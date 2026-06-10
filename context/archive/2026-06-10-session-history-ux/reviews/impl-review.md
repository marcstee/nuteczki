<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Session History UX (pagination + delete)

- **Plan**: context/changes/session-history-ux/plan.md
- **Scope**: Full plan — Phases 1–4 of 4
- **Date**: 2026-06-10
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated gates verified green on current HEAD: lint (no errors), `astro check`
(0 errors / 0 warnings / 5 hints), `npm run build` (Complete).

## Findings

### F1 — Phase 4 shipped but never written into the plan body, and it contradicts a "What We're NOT Doing" guardrail

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: context/changes/session-history-ux/plan.md:39, :281-293; src/pages/history.astro:77-81
- **Detail**: The plan body describes only Phases 1–3. "Phase 4: Date + Time Display" exists solely in the Progress checklist (plan.md:281-293, commit dc62174) — no Overview, Changes Required, Contract, or Success Criteria section. Phase 4 also changed the date formatter from `{ timeZone, dateStyle: "medium" }` to add `timeStyle: "short"`, but plan.md:39 lists "No change to date formatting or the summarizeSessions aggregation math" under What We're NOT Doing. A deliberate, committed phase directly violates a stated scope boundary, and the plan was never reconciled.
- **Fix**: Add a short "Phase 4" section to the plan body (intent + contract + the success criteria already mirrored in Progress) and amend plan.md:39 to drop or qualify the date-formatting exclusion.
  - Strength: Restores the plan as a trustworthy source of truth before future reviews use it as ground truth; the work is done and verified, so this is pure documentation reconciliation.
  - Tradeoff: Editing a fully-[x] plan after the fact; minor.
  - Confidence: HIGH — the change is real and visible in the diff and git history.
  - Blind spot: None significant.
- **Decision**: FIXED — Added Phase 4 plan body section and qualified the date-formatting scope guardrail.

### F2 — `shadcn add alert-dialog` regenerated the shared Button and dropped `shadow-xs` from every variant (app-wide visual change)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/components/ui/button.tsx (commit 7c88db2)
- **Detail**: The plan scoped Phase 3 to "land alert-dialog.tsx … no hand-editing beyond what the generator produces." The current shadcn generator also rewrote the shared `button.tsx` to its latest version: removed `shadow-xs` from default / destructive / outline / secondary variants, added xs/icon-xs/icon-sm/icon-lg sizes, switched the Slot import to the unified `radix-ui` package, and added data-variant/data-size attributes. `Button` is used across the whole app, so dropping the shadow is a site-wide visual change unscoped for a "delete history" slice. Builds pass; nothing is functionally broken.
- **Fix A ⭐ Recommended**: Keep the regenerated Button, eyeball the app's key screens (dashboard, drill, auth) once, and note the Button bump in the plan addendum.
  - Strength: Phase 3 manual verification was already marked done (the new look was seen at least on history); the regenerated component is current shadcn convention and internally consistent.
  - Tradeoff: Accepts an unscoped visual change as the new baseline.
  - Confidence: MED — haven't compared against the S-05 redesign's intended button treatment.
  - Blind spot: Whether `shadow-xs` was a deliberate S-05 brand choice on buttons elsewhere (dashboard CTAs, drill answer buttons) that this silently reverted.
- **Fix B**: Restore `shadow-xs` to the four variants to preserve the pre-existing button look, keeping only the additive sizes/attrs.
  - Strength: Zero visual drift from what S-05 shipped.
  - Tradeoff: Hand-edits a generated file; diverges from stock shadcn, so the next `shadcn add` re-introduces the diff.
  - Confidence: MED — depends on whether the old shadow was intended.
  - Blind spot: Same — needs a visual check to decide which look is correct.
- **Decision**: FIXED via Fix A — noted Button regeneration in Phase 3 Changes Required addendum; accepted as new baseline.

### F3 — `no-misused-promises` globally disabled for all .astro files

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: eslint.config.js:68
- **Detail**: To support the new `return Astro.redirect()` in history.astro frontmatter, the astro ESLint block disables `@typescript-eslint/no-misused-promises` (comment: parser crashes on `return` in frontmatter with this rule). Justified workaround, but it removes a type-safety net across every .astro file, not just history.astro. Unplanned, not mentioned in the plan.
- **Fix**: Acceptable as-is; consider tracking the astro-eslint-parser bug upstream so the rule can be re-enabled later, and note the relaxation in the plan addendum.
- **Decision**: FIXED — noted the ESLint rule relaxation in Phase 1's Changes Required addendum with a link to astro-eslint-parser to track for future re-enablement.

### F4 — First destructive action in the product ships with no automated regression guard

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/session-history-ux/plan.md:197-209
- **Detail**: All 21 manual checkboxes are self-reported [x] (no test runner — the plan explicitly defers that to the test-plan). Consistent with the plan, but delete-with-cascade is the product's first irreversible operation and the page-bounds clamp / RLS no-op behaviors have no automated coverage. Not a defect — a coverage note.
- **Fix**: Flag the delete + pagination-clamp flow as a priority risk for context/foundation/test-plan.md (the kind of destructive path the test rollout should cover first).
- **Decision**: FIXED — added a priority-risk callout to the plan's Testing Strategy section; flagged delete-with-cascade and pagination-clamp redirect as priority risks for when /10x-test-plan is run.
