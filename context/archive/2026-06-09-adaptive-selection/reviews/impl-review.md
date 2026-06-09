<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Adaptive Exercise Selection

- **Plan**: context/changes/adaptive-selection/plan.md
- **Scope**: Full plan (Phases 1–2 of 2)
- **Date**: 2026-06-09
- **Verdict**: APPROVED
- **Findings**: 0 critical · 0 warnings · 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated checks (re-run during review)

- `npx astro check` — 0 errors, 0 warnings (ts(6387) hints are in eslint.config.js, pre-existing/unrelated)
- `npm run lint` — 0 errors, 1 warning (pre-existing `console.error` in DrillSession.tsx:90, from the save-session feature, outside this change's diff)
- `npm run build` — Complete

## Verification notes

- **Plan Adherence**: All 3 planned source files (`src/components/drill/exercises.ts`, `src/pages/drill.astro`, `src/components/drill/DrillSession.tsx`) changed exactly as specified. `weightedNextPitch` implements the cumulative-weight walk with `+1` baseline applied across the full PITCHES pool; `nextPitch` collapsed to a one-line wrapper; `buildSession` partitions `Math.round(0.7 * count)` weighted slots shuffled independently of the type deck; weighted letter→note slots draw from `weights[letter_to_note]` (per-type bias intact). With `EMPTY_WEIGHTS` the deck is distributionally identical to pre-S-03 behavior.
- **Scope Discipline**: No unplanned source changes; diff matches the plan's file list. `security_invoker` view query carries no manual `user_id` filter, as planned.
- **Safety & Quality**: Parameterized supabase-js query (no injection); nullable view columns guarded (`isPitch`, `typeof error_count !== "number"`, `error_count <= 0` skip); `data` non-null-narrowed by the `!error` discriminated union; bounded to ≤26 rows, one select per page load; graceful `EMPTY_WEIGHTS` fallback on null client / query error / no rows.
- **Success Criteria**: All automated green. The 1 lint warning is a pre-existing `console.error`, not a leftover debug `console.log` — criterion 2.4 satisfied.

## Findings

### F1 — Core weighting behavior has no automated coverage; manual verification left no trace

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/adaptive-selection/plan.md:211 (Progress items 2.5–2.8)
- **Detail**: The product wedge — the ~70/30 weighted/random split and the per-exercise-type bias — is verified only by manual runtime observation (Progress 2.5–2.8, all marked `[x]`). By the plan's own design the temporary dev-log instrumentation was removed before commit, so nothing in the diff or repo attests to the realized weighted-slot count (14 at count=20) or the 3–4× recurrence of a missed note. This is the expected, accepted state (formal tests deferred to Module 3 per "What We're NOT Doing"), not rubber-stamping — but the behavioral promise currently rests on developer attestation.
- **Fix**: None required — track the deferred unit tests for `buildSession` / `weightedNextPitch` (split ratio, per-type bias, cold-start uniformity, no-consecutive-repeat) as the Module 3 follow-up the plan already commits to. The functions are pure and RNG-injectable, so they can be tested cold.
- **Decision**: SKIPPED — accepted as-is; Module 3 will add the deferred unit tests per the plan's "What We're NOT Doing" section.
