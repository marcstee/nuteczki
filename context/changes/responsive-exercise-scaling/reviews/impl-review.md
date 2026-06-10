<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Responsive Exercise Scaling

- **Plan**: context/changes/responsive-exercise-scaling/plan.md
- **Scope**: Phase 1 of 1 (full plan)
- **Date**: 2026-06-10
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

## Summary

All 5 planned changes landed exactly as specified: the `--drill-*` clamp() scaling
tokens in `global.css` plus the token swaps across `NoteToLetterExercise`,
`LetterToNoteExercise`, `DrillSession` (setup branch only), and `SessionResults`. The
diff touched precisely the files named in the plan — no unplanned source files. The three
automated gates were re-run during this review and all pass on the current tree (not just
per the Progress log): `npm run lint` (0 errors), `npx astro check` (0 errors), and
`npm run build` (success). Manual device-size items 1.4–1.8 are human-attested; the plan's
Implementation Note required that confirmation before close-out and the epilogue commit
(7cb9b3a) recorded it.

Apparent drift that is actually authorized by the plan (not flagged): clamp value tweaks
(`--drill-prompt-text` 6/20/11 vs plan's 5/14/9; `--drill-feedback-text` vw bump) — plan
said "values are tunable — the shapes matter more than the exact numbers"; unifying the
"Gotowe" button to `--drill-action-h` — plan's "Done may stay one step shorter" was
permissive, not required. The left-option `Staff` `w-full` was correctly left untouched and
only the `setup` branch of `DrillSession` was modified, both as planned.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Undocumented extra token --drill-caption-text

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/styles/global.css:30
- **Detail**: The plan's §1 names 7 tokens; the implementation shipped an 8th, `--drill-caption-text: clamp(1rem, 2.5vw, 1.25rem)`, and applied it to two `text-sm` captions ("Znajdź tę nutkę" in LetterToNoteExercise.tsx:48 and the surrounding caption) so they scale with the rest of the view. Benign and clearly in the spirit of the curve, but it is an addition the plan does not record, so a future reviewer reading the plan as ground truth would see drift.
- **Fix**: Add `--drill-caption-text` to the plan's §1 token list as a one-line addendum (it is already shipped and consistent with the curve).
- **Decision**: FIXED — added `--drill-caption-text` to plan §1 token list as a one-line addendum.

### F2 — text-[length:var(...)] used instead of plan's text-[var(...)]

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — no action needed
- **Dimension**: Plan Adherence
- **Location**: NoteToLetterExercise.tsx, LetterToNoteExercise.tsx, DrillSession.tsx
- **Detail**: The plan's example wrote `text-[var(--drill-tap-text)]`. The implementer used `text-[length:var(--drill-tap-text)]` for every font-size token. This is a correct improvement, not a defect: in Tailwind v4 a bare `text-[var(...)]` is ambiguous between color and font-size, so the `length:` data-type hint is required for the size to compile. The green build confirms it. Recorded only so the deviation from the plan's literal syntax is on the books.
- **Fix**: None — this is the right pattern. Leave as-is.
- **Decision**: ACCEPTED-AS-RULE: In Tailwind v4, CSS-variable font sizes need the `length:` type hint. Code already correct — no changes needed.
