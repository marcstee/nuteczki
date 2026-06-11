<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Bootstrap Vitest + Exercise Integrity

- **Plan**: context/changes/testing-bootstrap-exercise-integrity/plan.md
- **Scope**: All 4 phases (full plan)
- **Date**: 2026-06-11
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Verification evidence

- `npm run test` — 16 tests passed across 2 files in 248ms (well under the ~1s budget); deterministic via fixed-seed `makePrng`, no `Math.random` in the test path.
- `npm run lint` — clean (only pre-existing `astro-eslint-parser` projectService warnings).
- `npx astro check` — 0 errors, 0 warnings (deprecation hints are in untouched `eslint.config.js`).
- Cookbook §6.1 filled in; grep for `"TBD — see §3 Phase 1"` returns non-zero (criterion 4.1 satisfied); oracle-discipline rule stated explicitly.
- **Oracle discipline confirmed by reading production vs. test code**: `src/test/music-oracle.ts` uses hand-written literals; tests import the oracle's `letter`/`staffStep` columns as expected values and never import `pitchToLetter`, `STAFF_STEP`, or `PITCH_LETTER`. A wrong production literal turns the suite red (non-tautological).
- Scope guardrails respected: no CI `test` step added (`.github/workflows/ci.yml` untouched), `letterToNoteOptions` not exported, `eslint.config.js` not edited.

## Findings

### F1 — Test runner transitively loads .dev.vars via getViteConfig()

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: vitest.config.ts:3
- **Detail**: `getViteConfig()` inherits the full Astro + Cloudflare adapter config, so every `npm run test` run loads `.dev.vars` and initializes Cloudflare bindings (image processing, sessions, KV) — visible in the run output ("Using secrets defined in .dev.vars"). Phase 1 manual check 1.7 claims `.env` / `.dev.vars` are "untouched and unreferenced by the test config" and is marked `[x]`. "Untouched" is true, but `.dev.vars` is in fact transitively *referenced* (loaded) through the inherited config. Benign for the current pure-Node tests (they read no env), and inheriting the config is the deliberate, correct choice for the `@/*` alias. The reason to note it: the rollout's §3 Phase 2 adds DB/integration tests (Risks #3/#4) that WILL read Supabase env vars and would silently pick up whatever is in `.dev.vars`, potentially hitting a live/local Supabase without that being explicit.
- **Fix**: No code change needed for Phase 1. When Phase 2 lands DB tests, set the test env explicitly (e.g. a `.env.test` or Vitest `env` block) rather than relying on inherited `.dev.vars`, and correct the 1.7 manual-check wording to "untouched; transitively loaded via getViteConfig, harmless for Node tests."
- **Decision**: FIXED — corrected plan.md lines 201 and 443 to read "untouched; transitively loaded via getViteConfig, harmless for Node tests"
