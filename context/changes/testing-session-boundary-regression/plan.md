# Session-boundary Regression Net (Phase 2) Implementation Plan

## Overview

Rollout Phase 2 of `context/foundation/test-plan.md`: a **regression net** for
two risks, built without changing production behavior.

- **Risk #3 — Silent save failure / data loss.** Prove a completed session's
  rows are retrievable from the **real** local Supabase schema, and that a save
  failure surfaces an error rather than a silent success. Where current code
  already holds the invariant (explicit `error` → 500), assert it. Where the
  structural gap exists (ignore-duplicate 200 no-op; non-transactional
  session/answers split), **characterize** the current behavior in
  explicitly-marked tests — do not fix it here.
- **Risk #4 — Wrong end-of-session summary.** Lock the overall tally and the
  per-type breakdown against a hand-counted oracle. The overall tally
  (`summarize`) is pure today; the per-type breakdown is inline JSX, so extract
  a pure `summarizeByType` helper and test that.

This phase ships a **green** regression net (no failing tests) and produces a
follow-up flag for the Risk #3 fix, which belongs to its own framed change.

## Current State Analysis

From `context/changes/testing-session-boundary-regression/research.md` (git
`af8d3df`):

- **Risk #3 write path** (`src/pages/api/sessions.ts:78-133`): per-request
  null-guarded client (503), `auth.getUser()` self-guard (401), two `upsert`s
  both `{ onConflict: "id", ignoreDuplicates: true }` (sessions then answers),
  explicit `error` checks returning 500, else `{ ok: true }` 200. The endpoint
  is **not** in `PROTECTED_ROUTES` — it self-guards.
- **The structural gap:** `ignoreDuplicates: true` makes a colliding-id write a
  no-op with `error === null` (200, nothing persisted); the two upserts are not
  transactional, so a `finished_at`-stamped session with **zero answers** is
  representable and is silently treated as valid by the read path
  (`history.astro:38-58`) and the `note_error_stats` adaptive view
  (`drill.astro:31`).
- **Schema** (`supabase/migrations/20260528214850_create_session_tables.sql`):
  UUID PKs, FK cascade, RLS `WITH CHECK (user_id = auth.uid())` on both tables,
  `exercise_count in (5,10,20)` and `exercise_type in ('note_to_letter',
  'letter_to_note')` CHECK constraints, `finished_at` nullable, `note_error_stats`
  view (`security_invoker = on`). `20260610000001_add_sessions_delete_policy.sql`
  adds `sessions_delete_own`. **Nothing couples a session to ≥1 answer.**
- **Risk #4 tally** (`src/components/drill/exercises.ts:131-142`): `summarize`
  is pure/exported — `{ correct, incorrect, total, accuracyPct }` with a
  `total === 0 → 0` guard and `Math.round` rounding. **Untested today.**
- **Risk #4 breakdown** (`src/components/drill/DrillSession.tsx:183-198`):
  inline JSX filters `answers` by `exerciseType` and calls `summarize` three
  times. No pure `summarizeByType` exists. Building blocks (`summarize`,
  `EXERCISE_TYPE_*`) are importable.
- **Payload-type drift:** `SessionPayload`/`AnswerPayload` are defined locally
  in `sessions.ts:23-35`, **not** derived from `src/db/database.types.ts`.
- **Test infra (Phase 1):** Vitest configured (`vitest.config.ts` →
  `getViteConfig({ test: { environment: "node" } })`, `@/*` alias inherited, no
  globals, explicit imports per §6.1). Existing tests:
  `src/components/drill/exercises.test.ts`, `src/components/staff/pitch.test.ts`;
  fixture `src/test/music-oracle.ts`. **No `@testing-library/*`** (not needed —
  we extract a pure helper instead).
- **Local Supabase:** `supabase/config.toml` — API `54321`, DB `54322`,
  major_version 17; `seed.sql` is **referenced but does not exist**. `.dev.vars`
  already points at local (`http://127.0.0.1:54321` + local anon key); `.env` is
  prod remote. `supabase` CLI is a devDependency.
- **CI** (`.github/workflows/ci.yml`): `lint` + `build` only — no `npm run
  test`, no `supabase start`. Wiring the integration gate is **Phase 5**.

## Desired End State

- `npm run test` runs **green** and includes:
  - Unit tests for `summarize` and a new pure `summarizeByType`, with
    hand-counted oracles, covering empty-session and rounding edge cases.
  - Integration tests that, against a running local Supabase, prove a session
    round-trips through the real schema and that a forced DB/RLS error surfaces
    as a 500; plus explicitly-marked characterization tests documenting the
    ignore-duplicate no-op and the partial-write gap, and one RLS negative test.
- A compile-time guard asserts the local `sessions.ts` payload types stay
  assignable to the generated `database.types.ts` Insert types.
- `context/foundation/test-plan.md` §6.2 and §6.4 cookbook entries are filled;
  §3 Phase 2 row reads `complete`.
- `context/foundation/lessons.md` carries an entry naming the documented Risk #3
  gap (so the characterization tests are never mistaken for desired behavior),
  and a follow-up change is flagged for the fix.

**Verification:** `npm run test` exits 0 with the new suites present; the
integration suite is skipped-with-reason (not failed) when local Supabase is not
running; `npm run lint` and `astro check` pass; the cookbook/lessons/§3-status
edits are on disk.

### Key Discoveries:

- The handler is **not** a naive silent-200 — explicit `error` → 500 already
  holds (`sessions.ts:113-131`). The real gap is the ignore-duplicate no-op and
  the non-transactional split — properties of Postgres + PostgREST + the
  migration, **invisible to a mock** (`research.md` Summary, Architecture
  Insights).
- `summarizeByType` does not exist; the cheapest honest breakdown coverage is a
  pure extraction, not a React renderer (`research.md` Open Question 1).
- Real-schema integration is non-negotiable for Risk #3 — a mock cannot
  reproduce the no-op or the split that *defines* the risk; mocking is exactly
  what hid the Q2 prod gap (`test-plan.md` §2 #3, `lessons.md`).
- Oracle discipline (§6.1): expected counts hand-counted, never the same
  `reduce`; watch `Math.round` and the empty-session `0` guard.

## What We're NOT Doing

- **Not fixing the Risk #3 structural gap** (ignore-duplicate no-op /
  non-transactional partial write). Phase 2 *characterizes* it; the fix is a
  separate framed change (flagged in Phase 3). The idempotent-retry design was
  intentional, so a fix needs its own framing/research.
- **Not wiring tests into CI** (`supabase start` in GitHub Actions). Deferred to
  §3 Phase 5. Phase 2 wires only the local `npm run test` path.
- **Not testing per-answer correctness or adaptive weighting** — Risk #1/#2
  (Phase 1, done) and Risk #5 (Phase 4).
- **Not covering IDOR / cross-family ownership (Risk #6)** beyond the single
  RLS-rejects-foreign-`user_id` negative test that the Risk #3 auth setup
  naturally produces. The full cross-user read/delete matrix is Phase 4.
- **Not refactoring the production payload types** to derive from
  `database.types.ts` — only adding a compile-time guard (no runtime change).
- **Not adding `@testing-library/react` / happy-dom** — the breakdown is covered
  by a pure helper, not a component render.

## Implementation Approach

Three phases, cheapest-signal first:

1. **Unit (no infra).** Extract `summarizeByType`, refactor the one inline JSX
   site to use it, and unit-test both pure functions. Ships value with zero new
   dependencies or infrastructure.
2. **Integration (real schema).** Add `seed.sql`, a service-role test client
   helper, and a Vitest integration suite that targets local Supabase. Use the
   **service-role** key for deterministic fixture setup/read (bypassing RLS),
   unique ids per test with `afterEach` cleanup (FK cascade handles answers),
   and a separate **anon/user** client only for the one RLS negative test.
   Assert today's invariants; characterize the gap.
3. **Hand-off.** Fill the cookbook (§6.2, §6.4), add the lessons entry, flag the
   follow-up fix, and flip the §3 status row.

## Critical Implementation Details

- **Two client modes in the integration suite.** Setup/read uses the
  `service_role` key (bypasses RLS — deterministic). The RLS negative test uses
  an `anon`/user-scoped client and must NOT fall back to service-role, or the
  test would pass vacuously. Keep the two client factories visibly distinct.
- **Integration suite must skip, not fail, when local Supabase is down.** Gate
  the suite on reachability of `127.0.0.1:54321` (or presence of the local
  service-role env var) and `describe.skip` with a clear reason otherwise — so
  `npm run test` stays green for contributors who haven't run `supabase start`,
  until the CI gate (Phase 5) makes it mandatory.
- **CHECK constraints reject malformed fixtures.** `exercise_count` must be one
  of 5/10/20 and `exercise_type` one of the two enum values, or seed/insert
  fails. Fixtures must be schema-valid.
- **Characterization tests must be self-labelling.** Each test that documents
  the gap (ignore-duplicate no-op, finished-but-empty session) must state in its
  name/comment that it captures **current, not desired** behavior, and reference
  the lessons.md entry — so a future reader doesn't "fix the test" to match an
  expectation.

---

## Phase 1: Summary Correctness (Risk #4, unit)

### Overview

Make the per-type breakdown testable by extracting a pure helper, then lock both
the overall tally and the breakdown with hand-counted oracles. No DB, no new
dependencies.

### Changes Required:

#### 1. Pure `summarizeByType` helper

**File**: `src/components/drill/exercises.ts`

**Intent**: Extract the per-type aggregation that currently lives as inline JSX
in `DrillSession.tsx:183-198` into a pure, exported function so it can be
unit-tested without React, keeping the oracle independent per §6.1.

**Contract**: `summarizeByType(answers: readonly AnswerRecord[])` returns a
keyed object — one summary per exercise type — where each value matches the
shape `summarize` returns (`{ correct, incorrect, total, accuracyPct }`). Keys
are the `EXERCISE_TYPE_*` constants already exported from this module. Computed
by filtering `answers` per type and delegating to `summarize` — no new counting
logic. Lives next to `summarize` (`exercises.ts:131-142`).

#### 2. Refactor the finished-branch render to consume the helper

**File**: `src/components/drill/DrillSession.tsx`

**Intent**: Replace the inline triple-`summarize` filtering (`:183-198`) with a
single call to `summarizeByType(answers)`, wiring its result into the existing
`<SessionResults byType=… accuracyPct=… />` props. Behavior-preserving — the
rendered numbers must be identical.

**Contract**: The `byType` prop shape (`SessionResults.tsx:14-17`,
`{ noteToLetter: TypeStats, letterToNote: TypeStats }`) is unchanged; map the
helper's keyed output onto it. `accuracyPct` continues to come from
`summarize(answers)`. No React Compiler rule bypass.

#### 3. Unit tests for `summarize` and `summarizeByType`

**File**: `src/components/drill/exercises.test.ts` (extend existing file)

**Intent**: Lock the tally and breakdown against hand-counted oracles. The
expected counts are written by hand from a fixed answer sequence — never
recomputed with the same `reduce` the code uses (anti-tautology, §6.1).

**Contract**: Cover, with explicit Vitest imports (`import { describe, it,
expect } from "vitest"`): a mixed correct/incorrect sequence across both types
(hand-counted totals + per-type breakdown); the empty-session case (`total === 0
→ accuracyPct === 0`, both per-type entries zeroed); and a rounding case proving
the `Math.round` rule (e.g. 1/3 correct → 33, 2/3 → 67). Oracle values inline in
the test, derived by hand.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Type checking passes: `astro check` (via `npm run build` or `astro check`)
- Linting passes: `npm run lint`

#### Manual Verification:

- The finished-session results screen still shows identical overall and per-type
  numbers after the refactor (spot-check one real drill session in the browser).

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation that the results screen is
unchanged before proceeding.

---

## Phase 2: Persistence Regression Net (Risk #3, integration)

### Overview

Stand up real-schema integration tests against local Supabase. Assert the
invariants current code holds; characterize the structural gap. Service-role
client for deterministic setup; one anon/user client for the RLS negative case;
unique-id fixtures with `afterEach` cleanup.

### Changes Required:

#### 1. Local seed file

**File**: `supabase/seed.sql`

**Intent**: Create the `seed.sql` that `config.toml` already references but which
does not exist, providing a stable, schema-valid baseline (a known test
`auth.users` row the service-role setup can reference) for integration runs.

**Contract**: Insert at least one known-UUID `auth.users` row for the test
owner. All seeded data must satisfy the CHECK constraints (`exercise_count in
(5,10,20)`, `exercise_type in (...)`). Idempotent (safe to re-run via
`supabase db reset`).

#### 2. Integration test client helper + reachability guard

**File**: `src/test/supabase-it.ts` (new shared fixture, per §6.1 "one file per
concern under `src/test/`")

**Intent**: Provide the integration suite with (a) a **service-role** client
factory for deterministic fixture setup/read, (b) an **anon/user-scoped** client
factory for RLS assertions, and (c) a reachability check so the suite skips
cleanly when local Supabase is not running.

**Contract**: Reads local URL + keys from env (`process.env`, pointing at
`127.0.0.1:54321` — never prod). Exports: `serviceClient()`, `anonClient()` (and
a sign-in/user-scoped variant for the negative test), and
`isLocalSupabaseReachable(): Promise<boolean>` (or an env-presence check) the
suite uses to `describe.skip` with a reason. Must keep the two client modes
visibly distinct so service-role is never used where RLS is under test.

#### 3. Persistence integration suite

**File**: `src/pages/api/sessions.integration.test.ts` (co-located with the
endpoint; `.integration.test.ts` suffix marks the DB-dependent suite)

**Intent**: Exercise the real save path and read path against the real schema.
Prove what holds; document what doesn't.

**Contract**: Explicit Vitest imports; `describe.skip` unless local Supabase is
reachable; unique session/answer/user UUIDs per test (timestamp/UUID suffix);
`afterEach` deletes the test's own rows (FK cascade removes answers). Cases:

- **Round-trip (invariant, asserts):** insert a finished session + answers via
  the save path, then read them back through the real schema — counts and
  `finished_at` match what was written.
- **Forced error → 500 (invariant, asserts):** a write that violates a CHECK or
  RLS `WITH CHECK` surfaces as an error / non-2xx, never a silent success.
- **Ignore-duplicate no-op (characterization, self-labelled):** a second write
  with a colliding `id` returns success while persisting nothing new — test name
  + comment state this captures **current, not desired** behavior and reference
  the lessons.md entry.
- **Non-transactional partial write (characterization, self-labelled):** a
  finished session with zero answers is representable and is read back as a
  valid-but-empty session — same self-labelling.
- **RLS negative (Risk #6 sliver):** an anon/user-scoped client attempting to
  write a row with a foreign `user_id` is rejected by `WITH CHECK` (no data
  leaks). Must use the non-service-role client.

#### 4. Payload-type compile-time guard

**File**: alongside the integration suite (or a dedicated
`src/pages/api/sessions.types.test-d.ts` / inline `satisfies` assertion)

**Intent**: Guard the drift research flagged — keep the local
`SessionPayload`/`AnswerPayload` (`sessions.ts:23-35`) assignable to the
generated `database.types.ts` Insert types, at typecheck time, with no runtime
change.

**Contract**: A type-level assertion (e.g. `satisfies` against
`Database["public"]["Tables"]["sessions"]["Insert"]` /
`["answers"]["Insert"]`, or an `Expect<Equal<…>>`-style check) that fails
`astro check` if the shapes drift. No production code changes.

### Success Criteria:

#### Automated Verification:

- With local Supabase running (`supabase start`), integration suite passes:
  `npm run test`
- With local Supabase **not** running, `npm run test` still exits 0 and reports
  the integration suite skipped (with reason)
- Type checking passes, including the payload-type guard: `astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- `supabase db reset` applies `seed.sql` cleanly (no constraint violations).
- The two characterization tests are clearly labelled as documenting current
  (not desired) behavior on inspection.
- The RLS negative test genuinely uses a non-service-role client (would fail if
  swapped to service-role).

**Implementation Note**: After automated verification passes, pause for manual
confirmation (seed applies, characterization labelling, RLS client correctness)
before proceeding.

---

## Phase 3: Cookbook, Lessons & Gap Hand-off

### Overview

Turn the work into durable project knowledge: fill the cookbook, record the
documented gap as a lesson, flag the fix as a follow-up, and advance the rollout
state.

### Changes Required:

#### 1. Fill integration & endpoint cookbook entries

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.2 (integration test) and §6.4 (API-endpoint test)
"TBD — see §3 Phase 2" stubs with the concrete pattern this phase established.

**Contract**: §6.2 documents: location (`*.integration.test.ts` co-located;
shared client helper in `src/test/supabase-it.ts`), the service-role-for-setup /
anon-for-RLS split, unique-id + `afterEach` isolation, the reachability skip
guard, the run command, and the round-trip integration suite as the reference
test. §6.4 documents the sessions-endpoint pattern (payload-type guard +
persistence assertions) and points to Phase 4 for the IDOR matrix. Do not edit
frozen §1–§5 strategy.

#### 2. Lessons entry for the documented Risk #3 gap

**File**: `context/foundation/lessons.md`

**Intent**: Record the ignore-duplicate / non-transactional gap as an
append-only lesson so the characterization tests are never mistaken for desired
behavior and the fix isn't forgotten.

**Contract**: New `##` section following the file's Context/Problem/Rule/Applies
format — names the no-op and partial-write surfaces, states the rule (a 200 from
the save path does not yet guarantee persistence; finished sessions can have
zero answers), and links the follow-up change.

#### 3. Flag the Risk #3 fix as a follow-up change

**File**: change-tracking (a `## Notes` follow-up line in this change's
`change.md`, and/or a `mcp__ccd_session__spawn_task` chip)

**Intent**: Ensure the actual fix (drop/replace `ignoreDuplicates`, couple
session+answers writes) is captured as its own framed change, not lost.

**Contract**: A clear, self-contained pointer naming the gap, the affected file
(`src/pages/api/sessions.ts`), and the characterization tests that will flip to
assertions once fixed.

#### 4. Advance the rollout state

**File**: `context/foundation/test-plan.md` (§3 table) and this change's
`change.md`

**Intent**: Mark the rollout phase done.

**Contract**: §3 Phase 2 `Status` → `complete`; `change.md` `status` →
`implemented` (or per the project's archive convention), `updated` → today.

### Success Criteria:

#### Automated Verification:

- §6.2 and §6.4 no longer contain "TBD — see §3 Phase 2": `grep` shows filled
  content.
- §3 Phase 2 row reads `complete`.
- Markdown lint/format passes (Prettier via lint-staged on `*.md`).

#### Manual Verification:

- The lessons.md entry reads clearly to someone who wasn't in this session and
  correctly frames the gap as known-and-deferred.
- The follow-up fix is discoverable (chip created or change.md note present).

**Implementation Note**: This phase is documentation-only; confirm the prose is
accurate and the rollout state is consistent before closing.

---

## Testing Strategy

### Unit Tests:

- `summarize`: overall counts, accuracy %, empty-session `0` guard, `Math.round`
  rounding — hand-counted oracle.
- `summarizeByType`: per-type breakdown for a mixed sequence, empty session —
  hand-counted oracle, independent of the production `reduce`.

### Integration Tests:

- Round-trip persistence through the real local schema (invariant).
- Forced CHECK/RLS error → non-2xx (invariant).
- Ignore-duplicate no-op (characterization, self-labelled).
- Non-transactional finished-but-empty session (characterization, self-labelled).
- RLS rejects foreign `user_id` (negative, non-service-role client).

### Manual Testing Steps:

1. `supabase start`, then `npm run test` — full suite green.
2. Stop local Supabase, `npm run test` — integration suite skipped with reason,
   suite still green.
3. In the browser, complete one drill session and confirm the results screen's
   overall + per-type numbers are unchanged after the Phase 1 refactor.
4. `supabase db reset` — `seed.sql` applies without constraint errors.

## Performance Considerations

Integration tests hit a real local Postgres; keep fixtures small and per-test.
Unique-id isolation permits parallelism without a global truncate. No production
hot path is touched.

## Migration Notes

`supabase/seed.sql` is new (config already references it). No schema migration —
the existing migrations are the schema under test. The Phase 1 refactor is
behavior-preserving.

## References

- Research: `context/changes/testing-session-boundary-regression/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (Risk #3/#4 guidance), §3
  Phase 2, §4 (integration stack), §6.1/§6.2/§6.4, §7
- Lessons: `context/foundation/lessons.md` (real-host-not-dev verification)
- Save handler: `src/pages/api/sessions.ts:78-133`
- Tally: `src/components/drill/exercises.ts:131-142`
- Inline breakdown: `src/components/drill/DrillSession.tsx:183-198`
- Schema: `supabase/migrations/20260528214850_create_session_tables.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Summary Correctness (Risk #4, unit)

#### Automated

- [x] 1.1 Unit tests pass: `npm run test` — c8181d2
- [x] 1.2 Type checking passes: `astro check` — c8181d2
- [x] 1.3 Linting passes: `npm run lint` — c8181d2

#### Manual

- [x] 1.4 Results screen shows identical overall + per-type numbers after refactor — c8181d2

### Phase 2: Persistence Regression Net (Risk #3, integration)

#### Automated

- [x] 2.1 With local Supabase running, integration suite passes: `npm run test` — 4d814ee
- [x] 2.2 With local Supabase not running, `npm run test` exits 0 with integration suite skipped (reason reported) — 4d814ee
- [x] 2.3 Type checking passes, including payload-type guard: `astro check` — 4d814ee
- [x] 2.4 Linting passes: `npm run lint` — 4d814ee

#### Manual

- [x] 2.5 `supabase db reset` applies `seed.sql` cleanly — 4d814ee
- [x] 2.6 Characterization tests clearly labelled as current (not desired) behavior — 4d814ee
- [x] 2.7 RLS negative test genuinely uses a non-service-role client — 4d814ee

### Phase 3: Cookbook, Lessons & Gap Hand-off

#### Automated

- [x] 3.1 §6.2 and §6.4 no longer contain "TBD — see §3 Phase 2"
- [x] 3.2 §3 Phase 2 row reads `complete`
- [x] 3.3 Markdown lint/format passes

#### Manual

- [x] 3.4 lessons.md entry frames the gap as known-and-deferred, readable cold
- [x] 3.5 Follow-up fix is discoverable (chip or change.md note present)
