<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Adaptive Exercise Selection

- **Plan**: context/changes/adaptive-selection/plan.md
- **Mode**: Deep
- **Date**: 2026-06-09
- **Verdict**: SOUND
- **Findings**: 0 critical · 1 warning · 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | WARNING |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding

8/8 paths ✓, symbols ✓ (buildSession:175, nextPitch:68, note_error_stats view, PITCHES=13, createClient), brief↔plan ✓. Data flow verified end-to-end: `finished_at` set on save (api/sessions.ts:109) → `note_error_stats` populated → SSR query in drill.astro → weights prop → `buildSession`. Float partition is exact (`Math.round(0.7×count)` = 4/7/14 for 5/10/20). `buildSession` has a single caller (DrillSession.tsx:82) passing only `count`, so inserting `weights` as the 2nd positional param is safe. `output: "server"` (global SSR) confirms the new frontmatter query runs per-request; dashboard.astro already uses the `Astro.locals.user` SSR pattern.

## Findings

### F1 — "Adaptivity observable" acceptance test is underpowered at count=5

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Manual Verification 2.5 / Testing Strategy step 2
- **Detail**: The only verification of the core behavior is eyeballing "missed notes recur noticeably more often." With the `+1` baseline over the full 13-pitch pool, a note missed 3× has weight 4 vs baseline 1 — ~4/16 ≈ 25% draw among weighted slots vs ~7.7% uniform. At count=5 there are only `round(0.7×5)=4` weighted slots, so a missed note is expected to appear only ~1 extra time — within noise. The test can read as "failed" when the code is correct, or "passed" by luck. The dev-only slot log is removed before commit, leaving no durable signal. This is the brief's own top-listed risk ("statistical correctness is hard to eyeball without tests").
- **Fix**: Pin the bias-observation step to count=20 (14 weighted slots) and concentrate misses on a single note across ≥3 sessions, so the over-appearance is unambiguous (~3–4× vs ~1×). Confirm the realized weighted-slot count via the temporary dev log at count=20 (where `round(0.7×20)=14` is exact) before removing it.
  - Strength: Turns a coin-flip check into a clear signal; no code change, only a sharper test recipe.
  - Tradeoff: Slightly longer manual run (20-question drills).
  - Confidence: HIGH — probabilities computed against the actual 13-pitch PITCHES pool and the `+1` formula in the plan.
  - Blind spot: Per-type bias (testing step 3) is even weaker — a note missed only in letter→note splits its signal across ~7 weighted slots of that type at count=20.
- **Decision**: FIXED (Fix in plan — bias steps pinned to count=20, single concentrated note, ≥3 sessions, slot count verified via dev log)

### F2 — Two parallel uniform-draw paths left undecided

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 1 — Change 2 (weightedNextPitch)
- **Detail**: Phase 1 says "nextPitch may remain for the random slots or be expressed in terms of this." `weightedNextPitch(prev, {}, rng)` is provably identical to `nextPitch(prev, rng)` (empty counts → all weights 1 → uniform). Leaving both keeps two code paths computing the same draw, and the choice is punted to the implementer.
- **Fix**: Decide now — implement the uniform draw once. Have random slots call `weightedNextPitch(prev, EMPTY_WEIGHTS[slotType], rng)` and either delete `nextPitch` or keep it as a one-line named wrapper. `nextPitch` has a single internal caller (exercises.ts:186) and no external importers (grep-confirmed), so collapsing it is safe.
- **Decision**: FIXED (Fix in plan — `nextPitch` reduced to a one-line wrapper over `weightedNextPitch`; uniform draw implemented once)

### F3 — Weight uses raw error_count, not error rate (mild feedback loop)

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details / weight formula
- **Detail**: The view exposes both `error_count` and `total_count`, but the formula weights by `error_count + 1` only. A note wrong 3/3 and one wrong 3/30 both get weight 4, though the first is the weaker spot. Because adaptivity concentrates draws on a weak note, that note's `total_count` (and absolute `error_count`) keeps climbing inside the 5-session window, so it can stay over-weighted even after the child starts getting it right — a mild self-reinforcing loop, bounded only by the window. This is a *documented* decision (brief: "error_count + 1 … matches PRD 'wrong most often'"), so this is a confirm-or-accept, not a defect.
- **Fix**: Confirm raw-count weighting is intended for the MVP. If the loop is a concern later, `error_count / (total_count·k + 1)` weights by miss-rate instead — but that's a deliberate change, out of scope for this slice unless you want it now.
- **Decision**: ACCEPTED (raw-count weighting confirmed intended for MVP; bounded feedback loop recorded under "What We're NOT Doing")
