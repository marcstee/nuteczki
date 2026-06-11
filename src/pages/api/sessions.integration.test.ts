/**
 * Persistence regression net for Risk #3 (silent save failure / data loss).
 *
 * Requires local Supabase running (`supabase start`) and credentials in .dev.vars.
 * When local Supabase is unavailable the whole suite is skipped — `npm run test`
 * still exits 0.  Set SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY in
 * .dev.vars (or env) and run `supabase start` to enable.
 *
 * Client modes:
 *   svc  — service_role (bypasses RLS) — used for all fixture setup/read
 *   user — anon, signed in as a real user — used ONLY for the RLS negative test
 */

import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { isLocalSupabaseReachable, serviceClient, signedInClient } from "@/test/supabase-it";
import { EXERCISE_TYPE_NOTE_TO_LETTER, EXERCISE_TYPE_LETTER_TO_NOTE } from "@/components/drill/exercises";

// Known-UUID seed user inserted by supabase/seed.sql; stable across `supabase db reset`.
// Used as user_id for service-role fixture writes (no sign-in needed — bypasses RLS).
const SEED_USER_ID = "00000000-0000-0000-0000-000000000001";

const reachable = await isLocalSupabaseReachable();

describe.skipIf(!reachable)("sessions persistence (integration — skipped without local Supabase)", () => {
  const svc = serviceClient();

  // Track sessions created per-test so afterEach can delete them.
  // FK cascade on answers.session_id → deleting a session removes its answers.
  const sessionIds = new Set<string>();

  afterEach(async () => {
    for (const id of sessionIds) {
      // Silently tolerates "no rows matched" (e.g. when the insert itself failed)
      await svc.from("sessions").delete().eq("id", id);
    }
    sessionIds.clear();
  });

  // ─── invariant: round-trip ────────────────────────────────────────────────

  it("round-trip: a finished session and its 5 answers are readable after write", async () => {
    const sessionId = randomUUID();
    sessionIds.add(sessionId);
    const startedAt = new Date().toISOString();
    const finishedAt = new Date(Date.now() + 30_000).toISOString();

    const { error: sErr } = await svc.from("sessions").insert({
      id: sessionId,
      user_id: SEED_USER_ID,
      exercise_count: 5,
      started_at: startedAt,
      finished_at: finishedAt,
    });
    expect(sErr).toBeNull();

    // 3 note_to_letter (2 correct, 1 wrong) + 2 letter_to_note (1 correct, 1 wrong)
    // Hand-counted: correct=3, total=5
    const answerRows = [
      {
        id: randomUUID(),
        session_id: sessionId,
        user_id: SEED_USER_ID,
        exercise_type: EXERCISE_TYPE_NOTE_TO_LETTER,
        note: "C4",
        is_correct: true,
      },
      {
        id: randomUUID(),
        session_id: sessionId,
        user_id: SEED_USER_ID,
        exercise_type: EXERCISE_TYPE_NOTE_TO_LETTER,
        note: "D4",
        is_correct: true,
      },
      {
        id: randomUUID(),
        session_id: sessionId,
        user_id: SEED_USER_ID,
        exercise_type: EXERCISE_TYPE_NOTE_TO_LETTER,
        note: "E4",
        is_correct: false,
      },
      {
        id: randomUUID(),
        session_id: sessionId,
        user_id: SEED_USER_ID,
        exercise_type: EXERCISE_TYPE_LETTER_TO_NOTE,
        note: "F4",
        is_correct: true,
      },
      {
        id: randomUUID(),
        session_id: sessionId,
        user_id: SEED_USER_ID,
        exercise_type: EXERCISE_TYPE_LETTER_TO_NOTE,
        note: "G4",
        is_correct: false,
      },
    ];
    const { error: aErr } = await svc.from("answers").insert(answerRows);
    expect(aErr).toBeNull();

    // Read back session + answers
    const { data: session, error: rErr } = await svc
      .from("sessions")
      .select("id, finished_at, answers(*)")
      .eq("id", sessionId)
      .single();

    expect(rErr).toBeNull();
    expect(session?.finished_at).toBeTruthy();
    // answers is a nested array from the FK relation
    const answers = session?.answers as { is_correct: boolean }[];
    expect(answers).toHaveLength(5);
    // Hand-counted correct = 3
    expect(answers.filter((a) => a.is_correct)).toHaveLength(3);
  });

  // ─── invariant: forced CHECK error surfaces as non-null error ─────────────

  it("forced error: invalid exercise_count violates CHECK and returns a non-null error", async () => {
    const sessionId = randomUUID();
    sessionIds.add(sessionId); // add pessimistically; cleanup is a no-op if insert fails

    const { error } = await svc.from("sessions").insert({
      id: sessionId,
      user_id: SEED_USER_ID,
      exercise_count: 7, // violates CHECK (exercise_count IN (5, 10, 20))
      started_at: new Date().toISOString(),
    });

    expect(error).not.toBeNull();
    // PostgreSQL check_violation = 23514
    expect(error?.code).toBe("23514");
  });

  // ─── characterization: ignore-duplicate no-op ─────────────────────────────
  // CURRENT BEHAVIOUR, NOT DESIRED.
  // See context/foundation/lessons.md §"Risk #3 structural gap: ignore-duplicate
  // no-op and non-transactional partial write".  When the fix lands (drop
  // ignoreDuplicates / use upsert-with-update semantics), these expectations
  // must change and the test should be promoted to an assertion.

  it("[characterization] ignore-duplicate: second write with same id is a no-op (current, not desired behavior)", async () => {
    const sessionId = randomUUID();
    sessionIds.add(sessionId);
    const startedAt = new Date().toISOString();

    // First write
    const { error: firstErr } = await svc
      .from("sessions")
      .upsert(
        { id: sessionId, user_id: SEED_USER_ID, exercise_count: 5, started_at: startedAt },
        { onConflict: "id", ignoreDuplicates: true },
      );
    expect(firstErr).toBeNull();

    // Second write with same id but different exercise_count — mirrors the API's
    // ignoreDuplicates upsert.  Current behaviour: returns success, persists nothing new.
    const { error: secondErr } = await svc
      .from("sessions")
      .upsert(
        { id: sessionId, user_id: SEED_USER_ID, exercise_count: 20, started_at: startedAt },
        { onConflict: "id", ignoreDuplicates: true },
      );
    expect(secondErr).toBeNull(); // succeeds (no error)

    // Verify the original exercise_count was NOT changed — the second write was a no-op
    const { data } = await svc.from("sessions").select("exercise_count").eq("id", sessionId).single();
    expect(data?.exercise_count).toBe(5); // unchanged from first write — characterizes the gap
  });

  // ─── characterization: non-transactional partial write ────────────────────
  // CURRENT BEHAVIOUR, NOT DESIRED.
  // See context/foundation/lessons.md §"Risk #3 structural gap: ignore-duplicate
  // no-op and non-transactional partial write".  A finished session with zero
  // answers is representable in the schema and silently treated as valid.

  it("[characterization] partial write: a finished session with zero answers is representable (current, not desired behavior)", async () => {
    const sessionId = randomUUID();
    sessionIds.add(sessionId);

    // Insert a finished session without any answers — mirrors the gap where
    // answers write fails after sessions write succeeds (non-transactional split)
    const { error } = await svc.from("sessions").insert({
      id: sessionId,
      user_id: SEED_USER_ID,
      exercise_count: 10,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    });
    expect(error).toBeNull();

    // Read back: session exists with finished_at set but zero answers
    const { data: session } = await svc.from("sessions").select("finished_at, answers(*)").eq("id", sessionId).single();

    expect(session?.finished_at).toBeTruthy(); // session is marked "done"
    const answers = session?.answers as unknown[];
    expect(answers).toHaveLength(0); // but has no answers — the partial-write gap
  });

  // ─── RLS negative: foreign user_id rejected by WITH CHECK ─────────────────

  it("RLS negative: authenticated user cannot insert a session with a foreign user_id", async () => {
    // Create two short-lived users: A signs in and attempts the write; B's id is
    // the "foreign" user_id.  Both are created via admin API so signInWithPassword
    // works (SQL-inserted seed users lack the required auth schema entries).
    const ts = Date.now();
    const { data: userA, error: errA } = await svc.auth.admin.createUser({
      email: `rls-actor-${ts}@test.local`,
      password: "rls-test-password-123",
      email_confirm: true,
    });
    if (errA) throw new Error(`RLS test: could not create actor user — ${String(errA)}`);
    const { data: userB, error: errB } = await svc.auth.admin.createUser({
      email: `rls-target-${ts}@test.local`,
      password: "rls-test-password-456",
      email_confirm: true,
    });
    if (errB) throw new Error(`RLS test: could not create target user — ${String(errB)}`);

    try {
      // Sign in as User A — this client is NOT service_role; RLS applies.
      const userClient = await signedInClient(`rls-actor-${ts}@test.local`, "rls-test-password-123");

      const sessionId = randomUUID();
      sessionIds.add(sessionId); // pessimistic; cleanup is a no-op if insert fails

      // Attempt to write a session whose user_id is User B's id —
      // a different UUID from the authenticated User A's id.
      // WITH CHECK (user_id = auth.uid()) must reject this.
      const { error } = await userClient.from("sessions").insert({
        id: sessionId,
        user_id: userB.user.id, // foreign user_id — not auth.uid()
        exercise_count: 5,
        started_at: new Date().toISOString(),
      });

      expect(error).not.toBeNull(); // RLS must reject the write
      // PostgREST surfaces RLS WITH CHECK violations as 42501 (insufficient_privilege)
      // or as an HTTP-level error; either way the error must be non-null.
      expect(error?.code).not.toBe(""); // any error code is acceptable — the key test is error !== null

      // Verify no row was persisted
      const { data } = await svc.from("sessions").select("id").eq("id", sessionId);
      expect(data).toHaveLength(0);
    } finally {
      await svc.auth.admin.deleteUser(userA.user.id);
      await svc.auth.admin.deleteUser(userB.user.id);
    }
  });
});
