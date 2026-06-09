<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: F-02 Staff Renderer

- **Plan**: context/changes/staff-renderer/plan.md
- **Scope**: All phases (1–3 of 3)
- **Date**: 2026-06-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

One deliberate-looking deviation crosses an explicit scope guardrail and needs a
conscious ratify-or-revert. Everything else matches the plan — the pure-core /
component split is clean, the SMuFL clef transform is mathematically correct, and
all automated checks (astro check, lint, build) pass.

## Success Criteria — automated results

- `npx astro check` — PASS (0 errors, 0 warnings; the 4 hints are in `eslint.config.js`, not staff files)
- `npm run lint` — PASS (exit 0)
- `npm run build` — PASS (exit 0, Cloudflare adapter, server built in 2.72s)

Manual checkboxes (Phases 1–3) all have supporting diff evidence: the pitch→step
mapping matches the reference table row-for-row, `needsLedgerLine` fires only for
C4 (−2) and A5 (10), and the clef transform `translate(10, stepToY(2)=68)
scale(0.048, −0.048)` places the glyph origin on the G4 line. Note that none of the
manual criteria assert the notehead *type*, which is why F1 slipped past them.

## Findings

### F1 — Notehead is a filled quarter note with a stem, not the planned open whole note

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence (also breaches Scope Discipline)
- **Location**: src/components/staff/Staff.tsx:105-124
- **Detail**: The plan specifies the notehead three times as an OPEN (hollow) WHOLE
  note with NO stem — plan.md:46 ("an open (hollow) whole note — no stem … a stroked
  ellipse … with no fill"), plan.md:145 ("an open whole note, wrapped in
  `<g data-pitch>`"), and plan.md:31 in "What We're NOT Doing" ("no rhythm/stems
  beyond the stemless whole note"). The implementation renders a FILLED quarter note
  WITH a stem: Staff.tsx:114 fills the ellipse (`fill="currentColor"`),
  Staff.tsx:118-124 adds a stem with up/down direction logic around the middle line,
  and Staff.tsx:105 self-describes it as a "Filled quarter note (slanted head +
  stem)." This crosses the explicit "no stems" guardrail — the one scope boundary
  breached — and leaves Staff.tsx internally contradictory: the file docstring
  (Staff.tsx:54) still says "a single whole note." Pitch ACCURACY is unaffected
  (positions are all correct), so the "musical accuracy non-negotiable" guardrail
  holds positionally; but a quarter note asserts a rhythmic value the exercise never
  tests, which is what the whole-note choice was made to avoid. The change looks
  intentional (considered stem-direction logic, engraving tilt), so this is a
  ratify-or-revert decision, not a bug.
- **Fix A ⭐ Recommended**: Revert to the planned open whole note — remove the stem
  (Staff.tsx:118-124), set the ellipse to stroked/no-fill, drop the now-unused stem
  constants.
  - Strength: Restores the plan + the "no stems" guardrail exactly as
    reviewed/approved; a whole note makes no rhythmic claim — cleanest fit for a
    pitch-only flashcard under the accuracy guardrail.
  - Tradeoff: Discards intentional, working work; a hollow head is a slightly smaller
    click target for S-02 (mitigated later via pointer-events/fill).
  - Confidence: HIGH — the plan's intent is explicit; the edit is small and local.
  - Blind spot: Whether the team actually prefers the quarter note's look.
- **Fix B**: Keep the quarter note, ratify it — update plan.md:46, plan.md:145, the
  plan.md:31 NOT-doing line, and the Staff.tsx:54 docstring to describe a filled
  quarter note with a stem.
  - Strength: Preserves working, deliberate code; a filled head is a larger click
    target for S-02, and a quarter note is the more familiar first-note shape for
    beginners. Updates the source of truth before S-01/S-02 consume it.
  - Tradeoff: Re-opens a scope boundary after plan review; implies a rhythmic value
    the exercise ignores.
  - Confidence: HIGH — the deviation is self-consistent; the doc edits are mechanical.
  - Blind spot: Whether downstream S-01/S-02 designs assumed a whole note anywhere.
- **Decision**: FIXED via Fix B (ratified) — quarter note adopted as the source of truth. Updated plan.md Overview (:5), What We're NOT Doing (:31), Implementation Approach (:39), Critical Implementation Details (:46), and the Phase 2 contract (:145) to describe a filled quarter note with a stem; corrected the stale "whole note" docstring in Staff.tsx (:54). Code unchanged — the implementation was already the ratified shape.
