<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Child-Friendly UI Redesign (Polish)

- **Plan**: context/changes/ui-redesign/plan.md
- **Scope**: Full plan — Phases 1–5 of 5
- **Date**: 2026-06-10
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

Both parallel review passes (plan-drift + safety/quality/pattern) converged: every
planned change is present, no missing work, and the className/copy-only contract
held (drill state machine, scoring, session-save retry, and auth flow all
logic-preserved; react-compiler-clean; no XSS / secrets / `console.*`; middleware
redirect does not weaken the auth guard). Automated gates verified by running them:
`npm run lint` = 0, `npx astro check` = 0 errors, `npm run build` = success.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Unwired favicon / PWA icon assets

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: public/ (6 new icon files), src/layouts/Layout.astro:18
- **Detail**: The redesign added android-chrome-192x192.png, android-chrome-512x512.png, apple-touch-icon.png, favicon-16x16.png, favicon-32x32.png, and favicon.ico to public/ (and deleted the old 1.2 MB template.png) — none of this was in the plan. Layout.astro still links only `/favicon.png`. By browser/iOS convention favicon.ico and apple-touch-icon.png are picked up implicitly, but the two android-chrome PNGs (~200 KB) need a web manifest that doesn't exist, so they ship as dead weight and the favicon set is half-wired.
- **Fix A ⭐ Recommended**: Finish the wiring — add the icon `<link>` tags and a manifest.webmanifest referencing the android-chrome sizes.
  - Strength: Completes the PWA/branding intent the assets imply; aligns with the plan's stated PWA/offline NFR.
  - Tradeoff: Slightly widens this change's surface beyond the redesign's copy/token scope.
  - Confidence: HIGH — standard Astro static-asset + manifest wiring.
  - Blind spot: Haven't confirmed whether a manifest belongs to a later roadmap slice instead.
- **Fix B**: Remove the unreferenced android-chrome PNGs (keep the convention-loaded favicon.ico / apple-touch-icon).
  - Strength: Keeps scope tight; no dead bytes in the bundle.
  - Tradeoff: Drops assets that are probably wanted soon anyway.
  - Confidence: MED — depends on near-term PWA intent.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — wired favicon set + apple-touch-icon + manifest in Layout.astro:18; created public/manifest.webmanifest (android-chrome 192/512, theme/bg #13243F).

### F2 — Landing redirect relocated to middleware (not index.astro)

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/middleware.ts:25-27 (planned for src/pages/index.astro)
- **Detail**: Plan Phase 2 §2 put the logged-in `/`→`/dashboard` redirect in index.astro's frontmatter. Implementation put it in middleware instead (exact-path + authenticated guard, hardcoded target — no open-redirect, PROTECTED_ROUTES logic intact). index.astro just renders `<Welcome/>`. Arguably better (pre-render, no flash); a location drift, not a defect. No double-redirect, no dead code.
- **Fix**: None needed in code. Optionally note the middleware location in the plan so it stays the source of truth.
- **Decision**: FIXED — added an impl addendum under Phase 2 §2 in plan.md noting the redirect lives in middleware.ts:25-27.

### F3 — Inert `@custom-variant dark` line left in global.css

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/styles/global.css:4
- **Detail**: The `.dark` token block was correctly deleted (single-theme app), but the Tailwind `@custom-variant dark (&:is(.dark *))` declaration remains. No `.dark` class is ever applied, so it is dead/inert.
- **Fix**: Remove line 4 for tidiness (purely cosmetic).
- **Decision**: FIXED — deleted the inert `@custom-variant dark` declaration from global.css.

### F4 — Plan text still says "Fredoka"; ships Baloo 2

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/styles/global.css:9-15,57 ; public/fonts/baloo2-latin-pl.woff2
- **Detail**: Plan specifies Fredoka throughout; implementation swapped to Baloo 2 (commit eb1539f) because Fredoka lacks full Polish glyph coverage — a documented, justified deviation (matches the saved `font-polish-coverage` memory). Wired consistently: @font-face → --font-sans → preload all reference baloo2-latin-pl.woff2. Flagged only because the plan doc wasn't updated to match the shipped font.
- **Fix**: None needed in code. Optionally update the plan's font name so it agrees with what shipped.
- **Decision**: FIXED — renamed all 16 Fredoka mentions in plan.md to Baloo 2 and added an impl note (with rationale + commit eb1539f) under Phase 1 §3.
