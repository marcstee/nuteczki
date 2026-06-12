// Thin service-role Supabase client for e2e cleanup only: deletes the `sessions`
// row a completed drill persists, so each run leaves no residue (the FK cascade
// on `answers.session_id` removes its answer rows). This is NOT a persistence
// assertion — Risk #3 (silent save failure) is owned by the integration suite
// (`src/pages/api/sessions.integration.test.ts`, test-plan §6.2). Here we only
// keep the e2e independent and repeatable.
//
// Env resolution mirrors `src/test/supabase-it.ts`: process.env first, then a
// `.dev.vars` fallback, so cleanup works whether or not the vars are exported
// into the Playwright process.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function parseDevVars(): Partial<Record<string, string>> {
  try {
    const out: Partial<Record<string, string>> = {};
    for (const line of readFileSync(".dev.vars", "utf8").split("\n")) {
      const match = /^([A-Z_][A-Z0-9_]*)=(.+)$/.exec(line);
      if (match) out[match[1]] = match[2].trim();
    }
    return out;
  } catch {
    return {};
  }
}

const devVars = parseDevVars();
const env = (key: string, fallback = "") => process.env[key] ?? devVars[key] ?? fallback;

const SUPABASE_URL = env("SUPABASE_URL", "http://127.0.0.1:54321");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");

const svc = SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

/** Delete the persisted drill session (and, via FK cascade, its answers). */
export async function deleteSession(id: string): Promise<void> {
  if (!svc) {
    throw new Error("supabase-e2e: SUPABASE_SERVICE_ROLE_KEY missing — cannot clean up the e2e session row");
  }
  const { error } = await svc.from("sessions").delete().eq("id", id);
  if (error) throw new Error(`supabase-e2e: cleanup delete failed — ${error.message}`);
}
