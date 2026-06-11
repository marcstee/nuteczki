<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Session-boundary Regression Net (Phase 2)

- **Plan**: context/changes/testing-session-boundary-regression/plan.md
- **Scope**: All 3 phases (full plan)
- **Date**: 2026-06-11
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 3 observations

All automated gates green: `npm run test` 29/29 (incl. 5 integration, local Supabase
reachable), `astro check` 0 errors (payload guard compiles), `npm run lint` clean.
Cookbook §6.2/§6.4 filled; §3 Phase 2 row reads `complete`.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Integration suite never exercises the POST handler

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/sessions.integration.test.ts:42,122,145
- **Detail**: The plan's Phase 2 contract said the round-trip case inserts "via the save path" and the forced-error case surfaces "→ 500" — both endpoint behaviors. The tests instead insert directly through the service-role client and assert schema/PostgREST behavior (`svc.from("sessions").insert(...)`, `error?.code === "23514"`), never `POST /api/sessions`. The handler's parse/validation, `error → 500` mapping (sessions.ts:113,129), and `finished_at` stamping have zero coverage. Critically, the two `[characterization]` tests re-implement the `ignoreDuplicates` upsert inline rather than calling the handler — so when the Risk #3 fix lands (drop `ignoreDuplicates` in the handler), these tests will NOT go red, yet lessons.md and change.md instruct a maintainer to "promote them to assertions once the fix lands," implying they would break. The net documents schema capability, not handler behavior — where the bug lives. (Testing the handler directly is harder — needs a constructed Astro context with auth cookies — so the schema-level choice is defensible; the issue is the framing promises more than the tests deliver.)
- **Fix A ⭐ Recommended**: Correct the "promote to assertions" framing in lessons.md and change.md to state the suite characterizes the *schema*, and that the fix change must add handler-level tests (invoke POST, assert error→500 and finished_at) and rewrite the inline characterization upserts to call the handler.
  - Strength: Cheapest honest fix; aligns durable docs with what the tests guard, and routes real handler coverage into the already-flagged follow-up change where the atomic-write fix lives.
  - Tradeoff: Handler stays uncovered until the follow-up ships.
  - Confidence: HIGH — the follow-up is already where the characterization tests get promoted.
  - Blind spot: None significant.
- **Fix B**: Add one handler-level test now — construct a context with a signed-in cookie, call `POST`, assert the 500 mapping on a forced CHECK error and the finished_at stamp on success.
  - Strength: Closes the coverage gap this phase; pins the exact endpoint logic the plan named.
  - Tradeoff: Non-trivial — needs auth-cookie plumbing the suite lacks; risks reopening a green phase.
  - Confidence: MED — feasible but more setup than Phase 2 scoped.
  - Blind spot: Haven't verified createClient() reads the test cookie cleanly under the node vitest environment.
- **Decision**: FIXED via Fix A — framing corrected in change.md and lessons.md to state the suite characterizes the schema (not the handler); fix change must add handler-level tests from scratch.

### F2 — Duplicated .dev.vars parser

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: vitest.config.ts:4 ↔ src/test/supabase-it.ts:23
- **Detail**: `loadDevVars()` (config) and `parseDevVars()` (helper) are near-identical regex `.dev.vars` parsers. The helper one is a documented fallback for vitest worker env, so the redundancy is intentional belt-and-suspenders — just not DRY.
- **Fix**: Optional — export one parser from supabase-it.ts and reuse in vitest.config.ts, or leave as-is and note the intent.
- **Decision**: FIXED — exported `parseDevVars` from supabase-it.ts; vitest.config.ts now imports and calls it, eliminating the duplicate parser.

### F3 — Payload guard checks a hand-written mirror, not the real call

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/test/sessions.payload-types.test-d.ts:21-36
- **Detail**: The guard asserts a locally re-declared `SessionRow`/`AnswerRow` fits the generated Insert types — not the actual object passed to `.upsert()` in sessions.ts. A drift in the real upsert won't fail typecheck unless someone also edits the mirror. The plan allowed this form, and the upsert shape legitimately differs from `SessionPayload` (adds user_id/finished_at), so it's defensible — but weaker than "the actual code stays assignable."
- **Fix**: Optional — add a `satisfies …Insert` at the upsert call site for a guard that tracks the real code (note: touches the production file the plan deliberately avoided).
- **Decision**: FIXED — added `import type { Database }` to sessions.ts and `satisfies` annotations at both upsert call sites. Lint and astro check green.

### F4 — vitest.config.ts modified but not in plan's Changes Required

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: vitest.config.ts (commit 4d814ee)
- **Detail**: Phase 2 added `test.env: loadDevVars()` to inject local Supabase creds — necessary to enable the integration suite, within Phase 2 intent, but not listed in "Changes Required". Benign. (Separately, astro.config.mjs in the diff is the unrelated workerd-SSR commit 9a8afbd, not this plan.)
- **Fix**: None needed — note the addition for the record.
- **Decision**: SKIPPED — benign, no action needed.

## Strengths

- Unit oracles are genuinely hand-counted and anti-tautological (33/67 rounding, empty-session guard, absent-type zeroing).
- Two client modes kept visibly distinct; RLS negative test correctly uses `signedInClient` (would pass vacuously under service-role).
- Characterization tests self-label with `[characterization]` prefixes and back-reference lessons.md.
- Skip-when-unreachable guard keeps `npm run test` green for contributors without local Supabase.
