---
date: 2026-06-11T15:23:24+02:00
researcher: Marcstee
git_commit: af8d3df28311bb2dcdb5102ede790740543c363d
branch: main
repository: nuteczki
topic: "Phase 2 — Session-boundary regression net: ground Risk #3 (silent save failure) and Risk #4 (wrong summary)"
tags: [research, codebase, persistence, supabase, drill-summary, risk-3, risk-4]
status: complete
last_updated: 2026-06-11
last_updated_by: Marcstee
---

# Research: Phase 2 — Session-boundary regression net (Risk #3 + Risk #4)

**Date**: 2026-06-11T15:23:24+02:00
**Researcher**: Marcstee
**Git Commit**: af8d3df28311bb2dcdb5102ede790740543c363d
**Branch**: main
**Repository**: nuteczki

## Research Question

Per `context/foundation/test-plan.md` §3 Phase 2, ground the code surfaces for:

- **Risk #3 (Silent save failure / data loss):** After a completed session, its
  rows are retrievable from the **real** schema; a save failure surfaces an
  error, never a silent success. Must challenge "HTTP 200 / no exception = persisted."
  Ground: the persistence boundary to Supabase; what a failed insert does;
  whether the deployed schema is asserted, not mocked.
- **Risk #4 (Wrong end-of-session summary):** Given a hand-counted answer
  sequence, the summary counts and per-type breakdown match an independent total.
  Must challenge "it is a number = it is the right number." Ground: how answers
  are aggregated into the summary; the per-type breakdown source.

Plus: the existing test infrastructure (Phase 1) and local Supabase setup an
integration test will plug into.

## Summary

**Risk #3.** The save handler is **not** a naive silent-200: `POST /api/sessions`
checks the `error` object after each `upsert` and returns HTTP 500 on failure
([sessions.ts:113-133](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/pages/api/sessions.ts#L113-L133)).
The genuine silent-failure surface is two-fold and structural:
1. **`ignoreDuplicates: true`** on both upserts (`onConflict: "id"`) means an
   id-collision row is skipped as a no-op with `error === null` — a colliding-id
   write returns 200 having persisted nothing new.
2. **No transaction across the two tables.** The `sessions` upsert and the
   `answers` upsert are separate subrequests; a failure or process death between
   them can leave a `finished_at`-stamped session with **zero answers**, which
   the read path and the adaptive view (`note_error_stats`) then silently treat
   as a valid-but-empty session.

A test must run against the **real local schema** (UUID PKs, FK cascade, RLS
`WITH CHECK (user_id = auth.uid())`, the `exercise_count in (5,10,20)` and
`exercise_type in (...)` checks) — a mock cannot reproduce the ignore-duplicate
no-op or the session/answers split that *defines* this risk. This is exactly the
Q2 prod-burn shape the test plan calls out.

**Risk #4.** The overall tally is a **pure, exported, unit-testable-today**
function `summarize(answers)`
([exercises.ts:131-142](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/components/drill/exercises.ts#L131-L142)).
**But** the thing Risk #4 explicitly names — the **per-type breakdown** — is
*not* a pure function. It is computed inline in the `finished`-branch render of
`DrillSession.tsx` by filtering answers by type and calling `summarize` three
times
([DrillSession.tsx:183-198](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/components/drill/DrillSession.tsx#L183-L198)).
Covering the breakdown therefore needs either a tiny pure-helper extraction
(`summarizeByType`) into `exercises.ts` or a component-level test. **Open
decision for `/10x-plan` — flagged below.**

**Infra.** Vitest is configured (`node` env, via Astro's `getViteConfig`), the
Supabase CLI is a devDependency, the local stack runs on `127.0.0.1:54321/54322`,
both migrations exist, generated DB types are committed. Gaps for Phase 2: no
`seed.sql`, no DOM/testing-library deps, `npm run test` is **not** in CI yet
(that is Phase 5).

## Detailed Findings

### Risk #3 — Persistence boundary

#### Write path — `POST /api/sessions`

[src/pages/api/sessions.ts](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/pages/api/sessions.ts)

- Client acquired per-request, null-guarded → 503 if Supabase unconfigured
  ([sessions.ts:78-81](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/pages/api/sessions.ts#L78-L81)).
- Auth self-guard: `supabase.auth.getUser()` → 401 if no user
  ([sessions.ts:83-88](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/pages/api/sessions.ts#L83-L88)).
  Note: `/api/sessions` is **not** in `PROTECTED_ROUTES` — it self-guards by design.
- Two `upsert`s, both `{ onConflict: "id", ignoreDuplicates: true }`:
  - `sessions` row: `id, user_id, exercise_count, started_at, finished_at`
    (`finished_at` stamped server-side)
    ([sessions.ts:103-112](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/pages/api/sessions.ts#L103-L112)).
  - `answers` rows (batched): `id, session_id, user_id, exercise_type, note, is_correct`
    ([sessions.ts:118-128](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/pages/api/sessions.ts#L118-L128)).
- Error handling is explicit, not silent:
  ```ts
  if (sessionError) { return json({ error: "Failed to save session" }, 500); }   // :113-115
  if (answersError) { return json({ error: "Failed to save answers" }, 500); }   // :129-131
  return json({ ok: true }, 200);                                                // :133
  ```
- **DELETE** path: `supabase.from("sessions").delete().eq("id", id)`; RLS enforces
  ownership, answers cascade. (Ownership/IDOR is Risk #6 / Phase 4 — out of scope here.)

**The silent-failure gap to pin (the actual Risk #3 target):**
- `ignoreDuplicates: true` → PostgREST emits `ON CONFLICT DO NOTHING`; an existing
  `id` is skipped, `error` is `null`, handler proceeds — 200 with nothing written.
  The handler never verifies the existing row matches the payload.
- The two upserts are not transactional. A finished session with zero answers is
  representable at the DB level (no constraint couples them) and is observable
  through the read path and the adaptive view.
- RLS `WITH CHECK` violations **do** surface as errors → 500 (good).

#### Read path (history)

[src/pages/history.astro](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/pages/history.astro) — SSR, zero client JS.
- Count: `from("sessions").select("*", { count: "exact", head: true }).not("finished_at","is",null)`
  ([history.astro:38-41](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/pages/history.astro#L38-L41)).
- List with embedded answers:
  `from("sessions").select("id, started_at, answers(exercise_type, is_correct)").not("finished_at","is",null).order("started_at",{ascending:false}).range(from,to)`
  ([history.astro:53-58](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/pages/history.astro#L53-L58)).
- Query-error vs confirmed-empty are kept distinct (`sessions === null` vs `[]`).
- **Adaptive read:** [drill.astro:31](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/pages/drill.astro#L31)
  reads the `note_error_stats` view (last 5 finished sessions). A finished-but-empty
  session contributes nothing → the partial-write gap silently degrades adaptive
  bias rather than erroring (ties Risk #3 to Risk #5).

#### Supabase client + middleware

- [src/lib/supabase.ts](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/lib/supabase.ts):
  `createClient(headers, cookies)` returns `null` if `SUPABASE_URL`/`SUPABASE_KEY`
  missing; uses `@supabase/ssr` `createServerClient<Database>`, cookie-based auth.
- [src/middleware.ts](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/middleware.ts):
  builds a client and sets `locals.user`, but **not** `locals.supabase` — every
  route builds its own. `PROTECTED_ROUTES` includes `/drill`, `/history`, not
  `/api/sessions`.

#### Schema (must be asserted, not mocked)

[supabase/migrations/20260528214850_create_session_tables.sql](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/supabase/migrations/20260528214850_create_session_tables.sql)

- `sessions(id uuid pk, user_id uuid not null → auth.users on delete cascade,
  exercise_count smallint not null check (in 5,10,20), started_at timestamptz not
  null default now(), finished_at timestamptz NULLABLE, created_at ...)`.
- `answers(id uuid pk, session_id uuid not null → sessions on delete cascade,
  user_id uuid not null → auth.users, exercise_type text check (in
  'note_to_letter','letter_to_note'), note text not null, is_correct boolean not
  null, answered_at ...)`.
- Indexes: `answers_session_id_idx`, `sessions_user_id_started_at_idx`.
- RLS on both; policies all `to authenticated`, keyed `user_id = auth.uid()`:
  `sessions_select/insert/update_own`, `answers_select/insert_own`. **No answers
  UPDATE/DELETE policy** (insert-only; delete via FK cascade).
- View `note_error_stats` (`security_invoker = on`): per-(note, exercise_type)
  error/total counts over the user's last 5 finished sessions.
- [20260610000001_add_sessions_delete_policy.sql](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/supabase/migrations/20260610000001_add_sessions_delete_policy.sql):
  adds `sessions_delete_own`.

**Schema facts that bite tests:** `finished_at` nullable; nothing couples a
session to ≥1 answer; `exercise_count` and `exercise_type` CHECK constraints will
reject malformed fixtures (so the seed must be valid).

#### Client-side save caller

- [src/components/drill/saveSession.ts](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/components/drill/saveSession.ts):
  `fetch("/api/sessions", POST, body)` with payload `{ id, exercise_count,
  started_at, answers:[{id, exercise_type, note, is_correct}] }`; ids are passed
  in (idempotent-retry contract). Surfaces only HTTP-level failure:
  `if (!res.ok) throw new Error("Save failed: " + res.status)` — a 200-with-no-persist
  (the ignore-duplicate gap) is treated as success.
- [DrillSession.tsx:128-144](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/components/drill/DrillSession.tsx#L128-L144):
  stable `crypto.randomUUID()` ids generated once on finish; `persist` sets
  `saveState` saving→saved / →error; retry reuses ids.
- [SessionResults.tsx:77-94](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/components/drill/SessionResults.tsx#L77-L94):
  non-blocking error banner + "Ponów zapis" retry; results are never hidden behind
  save state.

#### Row types

[src/db/database.types.ts](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/db/database.types.ts):
`answers` Row/Insert/Update (`:37-74`), `sessions` (`:75-101`, `finished_at:
string | null`), `note_error_stats` view (`:104-113`). The API payload types
(`AnswerPayload`, `SessionPayload`) are defined locally in
[sessions.ts:23-35](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/pages/api/sessions.ts#L23-L35),
**not** derived from `database.types.ts` — a drift surface worth a type-level note.

### Risk #4 — End-of-session summary

#### Answer accumulation

In React state in the orchestrator island
[DrillSession.tsx:65](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/components/drill/DrillSession.tsx#L65)
(`const [answers, setAnswers] = useState<AnswerRecord[]>([])`), appended per
answer at [:107-110](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/components/drill/DrillSession.tsx#L107-L110)
(note→letter) and [:118-121](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/components/drill/DrillSession.tsx#L118-L121)
(letter→note). Each record carries `exerciseType` and `isCorrect`.

#### The aggregation — pure `summarize`

[exercises.ts:131-142](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/components/drill/exercises.ts#L131-L142):
```ts
export function summarize(answers: readonly { isCorrect: boolean }[]): {
  correct: number; incorrect: number; total: number; accuracyPct: number;
} {
  const total = answers.length;
  const correct = answers.reduce((n, a) => (a.isCorrect ? n + 1 : n), 0);
  const incorrect = total - correct;
  const accuracyPct = total === 0 ? 0 : Math.round((correct / total) * 100);
  return { correct, incorrect, total, accuracyPct };
}
```
Pure, exported, no React/DOM/network. **Unit-testable today** for total
correct/incorrect/total and accuracy %. Note the `total === 0 → 0` guard and the
`Math.round` rounding rule — both are oracle-worthy edge cases.

#### The per-type breakdown — NOT pure (the gap)

`summarize` is type-agnostic. The per-type split that Risk #4 names is inline in
the `finished` render:
[DrillSession.tsx:183-198](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/components/drill/DrillSession.tsx#L183-L198):
```tsx
const noteToLetter = summarize(answers.filter((a) => a.exerciseType === EXERCISE_TYPE_NOTE_TO_LETTER));
const letterToNote = summarize(answers.filter((a) => a.exerciseType === EXERCISE_TYPE_LETTER_TO_NOTE));
// ...passed to <SessionResults byType={{ noteToLetter:{...}, letterToNote:{...} }} accuracyPct={summarize(answers).accuracyPct} />
```
To unit-test the breakdown without React, the smallest extractable unit is a pure
`summarizeByType(answers)` helper that **does not yet exist**. Building blocks
(`summarize`, `EXERCISE_TYPE_*`, `pitchToLetter`) are all importable.

The per-answer correctness check is also tangled in the event handlers
([DrillSession.tsx:105](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/components/drill/DrillSession.tsx#L105),
[:117](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/components/drill/DrillSession.tsx#L117)),
though `pitchToLetter` itself is pure/exported. Per-answer scoring overlaps Risk
#1/#2 (Phase 1, already covered) — keep Phase 2 focused on the tally.

#### Types

- `AnswerRecord` discriminated union:
  [exercises.ts:171-183](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/components/drill/exercises.ts#L171-L183).
- No named summary/stats type — `summarize`'s return is an inline object type.
- `TypeStats { correct; incorrect }` (local, not exported):
  [SessionResults.tsx:5-8](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/components/drill/SessionResults.tsx#L5-L8);
  `byType` prop shape at `:14-17`.

#### Existing coverage

Only [exercises.test.ts](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/src/components/drill/exercises.test.ts)
exists under `drill/`; it covers `buildSession` winnability only. **`summarize`
and the per-type breakdown are entirely untested today.**

### Test infrastructure (Phase 1) + local Supabase

- **Vitest:** [vitest.config.ts](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/vitest.config.ts)
  — `getViteConfig({ test: { environment: "node" } })`. `@/*` alias inherited.
  No setup files, no `globals` (explicit imports per §6.1).
- **Scripts/deps:** `package.json` `"test": "vitest run"`; `vitest ^3.2.0`,
  `supabase ^2.23.4` (devDeps); `@supabase/supabase-js ^2.99.1`, `@supabase/ssr
  ^0.10.3` (deps). **No `@testing-library/*` or happy-dom/jsdom yet** — needed only
  if Phase 2 goes the component-test route for the breakdown.
- **Existing tests/fixtures:** `src/components/drill/exercises.test.ts`,
  `src/components/staff/pitch.test.ts`, fixture `src/test/music-oracle.ts`
  (hand-written 13-pitch oracle + Mulberry32 PRNG).
- **Local Supabase:** `supabase/config.toml` — API `54321`, DB `54322`, Studio
  `54323`, DB major_version 17; `seed.sql` referenced but **does not exist**.
  Entry point `supabase start`.
- **Env:** `astro.config.mjs` env schema declares `SUPABASE_URL`/`SUPABASE_KEY`
  server-secret-optional. `.dev.vars` already points at local
  (`http://127.0.0.1:54321` + local anon key); `.env` is the prod remote. An
  integration test should target the local URL/key (e.g. via `process.env` in a
  test setup), **not** prod.
- **CI:** [.github/workflows/ci.yml](https://github.com/marcstee/nuteczki/blob/af8d3df28311bb2dcdb5102ede790740543c363d/.github/workflows/ci.yml)
  runs `lint` + `build` only; **no `npm run test`, no `supabase start`**. Wiring
  the test/integration gates is Phase 5, not this phase.

## Code References

- `src/pages/api/sessions.ts:78-133` — save handler; upserts, error checks, the `ignoreDuplicates` gap.
- `src/pages/history.astro:38-58` — finished-session read path with embedded answers.
- `src/pages/drill.astro:31` — adaptive read from `note_error_stats`.
- `src/lib/supabase.ts:6-24` — SSR client factory, null-guard.
- `src/middleware.ts:4-13` — `PROTECTED_ROUTES`, `locals.user`.
- `supabase/migrations/20260528214850_create_session_tables.sql` — sessions/answers/RLS/view.
- `supabase/migrations/20260610000001_add_sessions_delete_policy.sql` — delete policy.
- `src/components/drill/exercises.ts:131-142` — pure `summarize`.
- `src/components/drill/exercises.ts:171-183` — `AnswerRecord`.
- `src/components/drill/DrillSession.tsx:183-198` — inline per-type breakdown (extraction candidate).
- `src/components/drill/saveSession.ts` — client save caller.
- `src/components/drill/SessionResults.tsx:5-17,77-94` — stats props + save-error UI.
- `src/db/database.types.ts:37-113` — generated row/view types.
- `vitest.config.ts`, `supabase/config.toml`, `.github/workflows/ci.yml` — infra.

## Architecture Insights

- **Save is intentionally fire-and-forget + idempotent.** Client-generated UUIDs +
  `ignoreDuplicates` upserts make retries safe for *identical* payloads. The
  trade-off: the design optimizes for "never block the child / never lose the
  in-memory results" over "guarantee the DB matches what the user saw." Risk #3 is
  precisely the seam this trade-off opens — and it is invisible to a mock.
- **Real-schema integration is non-negotiable for Risk #3.** The failure modes
  (ignore-duplicate no-op, non-transactional session/answers split, RLS
  `WITH CHECK`) are properties of Postgres + PostgREST + the migration, not of the
  JS. Per §4/§7 of the test plan and lessons.md, dev-only / mocked verification is
  exactly what hid the Q2 prod gap.
- **Risk #4 has a layering decision.** Overall tally = pure function (cheap unit
  test, do it now). Per-type breakdown = inline JSX. Cheapest honest coverage is a
  small `summarizeByType` extraction (then a pure unit test with a hand-counted
  oracle) rather than pulling in a React component renderer just to read two
  numbers. This keeps the oracle independent (test plan's anti-tautology rule) and
  avoids adding DOM test deps for a pure computation.
- **Oracle discipline (§6.1) applies directly.** For Risk #4, the expected
  counts/percent must be hand-counted from the answer sequence — never recomputed
  with the same `reduce`. Watch the `accuracyPct` rounding (`Math.round`) and the
  empty-session `0` guard.

## Historical Context (from prior changes)

- `context/archive/2026-06-11-testing-bootstrap-exercise-integrity/` — Phase 1
  established the Vitest setup, `src/test/music-oracle.ts`, explicit-import
  convention, and the oracle-discipline pattern this phase reuses.
- `context/archive/2026-06-10-session-history-ux/` — added the history UX and the
  session delete (first destructive action); source of the Risk #6 ownership
  concern (Phase 4, not here) and the `sessions_delete_own` migration.
- `context/foundation/lessons.md` — "verify against what the production host
  actually serves, not just dev" reinforces the real-schema-not-mock stance for
  Risk #3.

## Related Research

- `context/foundation/test-plan.md` §2 (Risk Response Guidance for #3, #4), §3
  Phase 2, §4 (integration stack), §6.2/§6.4 (cookbook stubs this phase fills),
  §7 (negative space — auth flow excluded, but sessions-endpoint authorization
  stays in scope as Risk #6).

## Open Questions

1. **Per-type breakdown coverage (decision for `/10x-plan`):** extract a pure
   `summarizeByType(answers)` helper into `exercises.ts` and unit-test it (cheap,
   no new deps, keeps oracle independent) — **recommended** — vs. a component-level
   test of `DrillSession`'s finished branch (adds `@testing-library/react` +
   happy-dom for two numbers). The plan should pick one explicitly.
2. **Risk #3 integration mechanics:** how to obtain an authenticated test user
   against local Supabase (sign-up via auth API vs. seeded `auth.users` row), and
   per-test isolation (truncate vs. unique-id-per-run vs. transaction rollback).
   No `seed.sql` exists yet — the plan must define the fixture/reset strategy.
3. **How to assert the silent-failure gap:** the test must show (a) a forced DB
   error → HTTP 500 (the handler already does this), and (b) the
   ignore-duplicate / non-transactional no-op observed through the read path. (b)
   may *fail against current code* — the plan should decide whether Phase 2 asserts
   the desired invariant (and flags a fix) or documents current behavior.
4. **Payload-type drift:** `sessions.ts` defines `SessionPayload`/`AnswerPayload`
   locally rather than from `database.types.ts`. Worth a type-level guard, or out
   of scope for a regression net? (Decision for `/10x-plan`.)
5. **CI:** integration tests need `supabase start` in CI — explicitly deferred to
   Phase 5 by the test plan; confirm Phase 2 only wires the local `npm run test`
   path.
