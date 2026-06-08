<!-- PLAN-REVIEW-REPORT -->
# Plan Review: F-02 Staff Renderer

- **Plan**: context/changes/staff-renderer/plan.md
- **Mode**: Deep
- **Date**: 2026-06-08
- **Verdict**: SOUND (after triage — was REVISE; all 3 findings fixed)
- **Findings**: 0 critical · 2 warnings · 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS (was WARNING — fixed via F2) |
| Blind Spots | PASS (was WARNING — fixed via F1 + F3) |
| Plan Completeness | PASS |

## Grounding

4/4 existing referenced paths ✓ (SignInForm.tsx, signin.astro, global.css, ui/) · new paths correctly absent (staff/, dev/) · config symbols 6/6 ✓ (output:"server" astro.config.mjs:11, react-compiler/react-compiler:"error" eslint.config.js:58, no-console:"warn", no-set-html-directive:"error", default-export island style, @astrojs/check ^0.9.8 + typescript ^5.9.3 installed → `npx astro check` runnable, "no new npm packages" holds) · 13-row step table matches vexflow-api-notes.md §4 exactly and geometry is musically correct (even steps → lines E/G/B/D/F) · Progress↔Phase consistency clean (3 phases, all N.M bullets present, no stray checkboxes in phase bodies) · brief↔plan consistent · zero blast radius (no importers of new files) · no existing notation code (no pattern proliferation).

## Findings

### F1 — Clef sourcing + G4 alignment is the riskiest task and is left vague

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details + Phase 2.1 (treble-clef.ts)
- **Detail**: Both plan and brief name clef sourcing/alignment as "the one genuinely fiddly piece," yet it's the least-specified part. No concrete asset is pinned (just "public-domain Wikimedia OR Bravura OFL"), and alignment is hand-waved to "scale/translate so the curl sits on the G4 line... verify visually." The accuracy guardrail partly rests on the clef sitting on the G4 line, but it's the only load-bearing piece deferred to implementation-time improvisation. The two candidate sources have very different alignment ergonomics, and the choice is left open.
- **Fix A ⭐ Recommended**: Pin the Bravura gClef glyph (SMuFL U+E050) now, with deterministic alignment.
  - Strength: SMuFL registers the gClef so its glyph origin sits on the G line — alignment becomes "place origin at G4 Y, scale by staff-space ratio," not eyeballing. Reproducible math that serves the accuracy guardrail.
  - Tradeoff: Implementer must handle the glyph's em-square/bbox metrics and add a one-line OFL attribution.
  - Confidence: MED — SMuFL's G-line origin convention is documented, but the exact path/metrics weren't extracted here.
  - Blind spot: Em-to-staff-space scale factor unverified against the plan's LINE_GAP constant.
- **Fix B**: Pin a specific public-domain Wikimedia treble-clef SVG (exact URL + license) and accept eyeballed alignment.
  - Strength: Simplest to drop in; PD removes attribution worry.
  - Tradeoff: No standard origin → alignment to G4 is manual trial-and-error, exactly the fiddliness the plan flags.
  - Confidence: HIGH — grabbing one PD path is trivial.
  - Blind spot: Visual correctness depends entirely on the Phase 3 eyeball.
- **Decision**: FIXED via Fix A (pinned Bravura gClef U+E050 + deterministic SMuFL transform; treble-clef.ts now also exports CLEF_FONT_UNITS_PER_EM)

### F2 — Accuracy guardrail is split: step→Y geometry isn't pure/exported like the pitch map

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Implementation Approach + Phase 2 (Staff.tsx geometry)
- **Detail**: The plan's accuracy strategy is "keep the pitch→step map a pure, exported function so Vitest bolts on later." But a note can render musically wrong from a correct step value if the step→Y conversion (`stepY = baselineY − step * LINE_GAP/2`) is wrong — sign error, wrong baseline, off-by-one. That geometry lives inside Staff.tsx, DOM-coupled and not exported. So the "tests later" story covers only half the pitch→pixel path; the other half (equally able to misplace a note) stays untestable without a DOM. This undercuts the plan's own rationale for purity.
- **Fix**: Extract the geometry into the pure layer — export a `stepToY(step)` (or `STAFF_GEOMETRY` constants + pure helper) from pitch.ts (or a sibling geometry.ts), and have Staff.tsx consume it. Then the whole pitch→step→Y chain is pure and test-ready, matching the plan's accuracy principle end-to-end.
  - Strength: Closes the accuracy gap the plan's purity argument implies; Phase 1's "single source of musical truth" becomes complete rather than half.
  - Tradeoff: One more tiny module / a few more exports now.
  - Confidence: HIGH — the geometry is already a one-line pure formula; extracting it is near-zero cost.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix in plan (new pure `src/components/staff/geometry.ts` exporting LINE_GAP, BASELINE_Y, stepToY in Phase 1; Staff.tsx + clef transform consume it; added Phase 1 criterion 1.5 + Progress entry)

### F3 — /dev/staff ships as a public, server-rendered route in production

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 (src/pages/dev/staff.astro)
- **Detail**: With output:"server" and PROTECTED_ROUTES = ["/dashboard"] (src/middleware.ts:4), an "unlinked" /dev/staff is still publicly reachable and SSR'd on every request in the deployed Worker. The plan says it's "not linked from the product" — but unlinked ≠ inaccessible. Harmless content, but dead weight shipping to prod.
- **Fix**: Gate it behind `import.meta.env.DEV` (return 404 in prod), delete the route after Phase 3 verification, or add "/dev" to a guard. State which in the plan so the implementer doesn't ship an open prod route by default.
- **Decision**: FIXED via DEV gate (Phase 3 page 404s when `!import.meta.env.DEV`; updated Contract + Implementation Note; added manual check 3.6 + Progress entry)
