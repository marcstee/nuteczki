<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Critical-Flow E2E (Risk #7)

- **Plan**: context/changes/critical-flow-e2e/plan.md
- **Scope**: Phases 1–4 of 4
- **Date**: 2026-06-13
- **Verdict**: REJECTED → RESOLVED in triage (2026-06-13) — all 3 findings FIXED; `npm run test` green (29 passed, exit 0)
- **Findings**: 1 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | FAIL → PASS (F1 fixed) |

## Findings

### F1 — `npm run test` now exits 1: Vitest globs the e2e spec

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: vitest.config.ts (no include/exclude) → e2e/drill-completion.spec.ts:16
- **Detail**: vitest.config.ts sets only `test: { environment, env }` — no `include`/`exclude`. Vitest's default include `**/*.spec.ts` therefore matches the new `e2e/drill-completion.spec.ts`, which imports `@playwright/test`, dragging in `playwright-core` → `chromium-bidi`; esbuild dep-optimization fails ("Could not resolve chromium-bidi/lib/cjs/bidiMapper/BidiMapper"). The 29 real unit/integration tests pass, but `npm run test` exits 1 (reproduced during review). This is Phase 2 breaking Phase 1's success criterion 1.3 ("Existing unit tests stay green: `npm run test`"): it was true at Phase 1 (0d86415), then Phase 2 added the e2e spec (637d952) and only re-ran `lint`, never `npm run test`. CI doesn't catch it — the `ci` job runs lint + build only.
- **Fix**: In vitest.config.ts add `exclude: [...configDefaults.exclude, "e2e/**", "playwright/**"]` (import `configDefaults` from "vitest/config"), or equivalently `include: ["src/**/*.{test,spec}.ts"]`.
  - Strength: Restores the green `npm run test` gate; hard-separates the Vitest (`src/`) and Playwright (`e2e/`) suites that already live in separate dirs and use different runners.
  - Tradeoff: None material — purely test-runner scoping.
  - Confidence: HIGH — reproduced locally (exit 1); Vitest default include/exclude is well-defined and `e2e/` is Playwright's testDir.
  - Blind spot: None significant.
- **Decision**: FIXED — added `include: ["src/**/*.{test,spec}.ts"]` + `exclude: [...configDefaults.exclude, "e2e/**", "playwright/**"]` to vitest.config.ts. The exclude-only form was insufficient (Vite's dep optimizer scans the default include glob, not just collected tests); the src-scoped `include` is the load-bearing fix. Verified: `npm run test` exits 0, 29 tests pass, 0 chromium-bidi errors.

### F2 — Four unplanned files outside the plan's Changes Required

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: astro.config.mjs, playwright.config.ts, e2e/auth.setup.ts, supabase/seed.sql
- **Detail**: The plan named only LetterToNoteExercise.tsx, the spec (+ helper), ci.yml, and test-plan.md. Four more files changed: astro.config.mjs (env-gated devToolbar disable so the overlay stops intercepting clicks), playwright.config.ts (load .env/.dev.vars + point webServer at local Supabase), e2e/auth.setup.ts (`Hasło` exact match + hydration-safe retry), supabase/seed.sql (GoTrue token columns + identities row so the seeded user can sign in). All four are well-commented and genuinely needed to make the e2e run locally and in CI (the `fix(...p3)` commit churn is this work). None expand product surface or touch prod paths — benign but undocumented relative to the plan.
- **Fix**: Add a one-line addendum to plan.md noting these four test-infra/DX files landed under Phases 2–3, so the plan stays the source of truth for the next reviewer.
- **Decision**: FIXED — appended an "Addendum (2026-06-13)" section to plan.md listing the four test-infra/DX files (astro.config.mjs, playwright.config.ts, e2e/auth.setup.ts, supabase/seed.sql).

### F3 — Stale reference to nonexistent `../seed.spec.ts`

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: e2e/drill-completion.spec.ts:6
- **Detail**: The header comment says "Seed: modelled on ../seed.spec.ts." No such file exists (`e2e/` holds only auth.setup.ts, drill-completion.spec.ts, supabase-e2e.ts). A reader following the pointer hits a dead end.
- **Fix**: Drop the "modelled on ../seed.spec.ts" clause, or repoint it to the real cleanup helper (`./supabase-e2e.ts`).
- **Decision**: FIXED — header comment now reads "Seed/cleanup: via ./supabase-e2e.ts."
