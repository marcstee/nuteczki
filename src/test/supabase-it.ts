/**
 * Shared helpers for integration tests that target the local Supabase instance.
 *
 * Two client modes — keep them visibly distinct; never use serviceClient() where
 * RLS behaviour is under test:
 *
 *   serviceClient()  — service_role key, bypasses RLS — for deterministic fixture
 *                      setup/read and admin operations (auth.admin.*)
 *   anonClient()     — publishable (anon) key — subject to RLS; sign in with
 *                      signedInClient() to test authenticated-user paths
 *
 * isLocalSupabaseReachable() — reachability + key-presence guard.  Call once at
 * the top of a suite (with top-level await) and feed to describe.skipIf so the
 * suite skips rather than fails when local Supabase is not running.
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";

// Load .dev.vars as a fallback in case vitest workers don't inherit process.env
// from the vitest config's test.env injection (a known limitation with getViteConfig).
export function parseDevVars(): Partial<Record<string, string>> {
  try {
    const content = readFileSync(".dev.vars", "utf8");
    const out: Partial<Record<string, string>> = {};
    for (const line of content.split("\n")) {
      const match = /^([A-Z_][A-Z0-9_]*)=(.+)$/.exec(line);
      if (match) out[match[1]] = match[2].trim();
    }
    return out;
  } catch {
    return {};
  }
}

const _devVars = parseDevVars();
const env = (key: string, fallback = "") => process.env[key] ?? _devVars[key] ?? fallback;

const LOCAL_URL = env("SUPABASE_URL", "http://127.0.0.1:54321");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = env("SUPABASE_KEY");

/**
 * Returns true when the local Supabase API is reachable AND both required keys
 * are present.  A missing key means the test environment is not configured for
 * integration tests, which is treated identically to "not running".
 */
export async function isLocalSupabaseReachable(): Promise<boolean> {
  if (!SERVICE_KEY || !ANON_KEY) return false;
  try {
    const res = await fetch(`${LOCAL_URL}/rest/v1/`, {
      headers: { apikey: ANON_KEY },
      signal: AbortSignal.timeout(3000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

/** Service-role client: bypasses RLS.  Use for fixture setup/read only. */
export function serviceClient() {
  return createClient<Database>(LOCAL_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Anon/publishable client: subject to RLS.  Unauthenticated by default. */
export function anonClient() {
  return createClient<Database>(LOCAL_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Returns an anon client that has been signed in as the given user.
 * auth.uid() resolves to the user's id so RLS WITH CHECK assertions apply.
 * Throws if sign-in fails (test misconfiguration, not a test assertion).
 */
export async function signedInClient(email: string, password: string) {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`supabase-it: sign-in failed — ${error.message}`);
  return client;
}
