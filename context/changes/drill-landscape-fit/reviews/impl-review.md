<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Drill Landscape Fit (iPad)

- **Plan**: context/changes/drill-landscape-fit/plan.md
- **Scope**: Phase 1 of 1 (complete)
- **Date**: 2026-06-11
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Overall: NEEDS ATTENTION — no critical issues; implementation ships. Automated
gates (lint, `astro check`, build) all green on the committed state (HEAD
`b982d8c`). `Staff.tsx` musical/geometry core untouched as the plan required;
the `lessons.md` `length:` font-size-token rule was correctly applied to the new
accuracy figure.

Commits in scope: `e7bc071` (feat — height-aware tokens + results fit),
`e573f93` (fix — viewport-bound exercise views), `b982d8c` (chore — epilogue).

## Findings

### F1 — Viewport cap removed the scroll safety-valve the plan mandated

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/drill/NoteToLetterExercise.tsx:33, src/components/drill/LetterToNoteExercise.tsx:42
- **Detail**: The plan's "What We're NOT Doing" states: "No hard overflow:hidden
  clipping. Size-to-fit with scroll left as a last-resort safety valve so a
  control is never hidden/unreachable." The fix caps each exercise root at
  `max-h-[calc(100dvh-2rem)]` but adds no overflow fallback. Normal landscape is
  fine (flex-shrink makes it fit). But on a pathologically short viewport — or if
  the `shrink-0` rows + gaps alone exceed the cap — content overflows the capped
  box with `overflow:visible` and the "Dalej" button could become unreachable
  with no way to scroll to it. The plan's safety valve is absent.
- **Fix**: Add `overflow-y-auto` to the two capped exercise roots. Inert in the
  normal case (no scrollbar once content fits via flex-shrink); engages only as
  the last-resort the plan called for.
  - Strength: Restores the plan's stated guarantee at zero cost to the
    no-scroll-in-practice behavior the user confirmed.
  - Tradeoff: None meaningful — scrollbar appears only if shrink bottoms out.
  - Confidence: HIGH — standard flex + min-h-0 + overflow-auto pattern.
  - Blind spot: None significant.
- **Decision**: PENDING

### F2 — Layout-mechanism restructure beyond the plan's "no restructure" guardrail

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; the work is done and user-accepted
- **Dimension**: Scope Discipline
- **Location**: src/components/drill/LetterToNoteExercise.tsx:56 (grid→flex), both exercise roots (max-h cap)
- **Detail**: The plan said "No layout restructure. Keep the centered vertical
  stack." The working fix added a viewport height cap and switched letter→note's
  option cards from `grid-cols-3` to a flex row. It does NOT cross the specific
  lines the plan named (no two-column layout, no orientation breakpoint) and keeps
  the single-column visual — but it is a mechanism restructure, and it is what made
  "max 100vh" achievable. User directed it explicitly after the token-only approach
  fell short.
- **Fix**: Add a short addendum to plan.md recording the deviation (token-only caps
  → viewport-bound flex-shrink) so the plan stays the source of truth before
  `/10x-archive`.
  - Strength: Future readers/reviews see why the diff diverges from the original
    "no restructure" line.
  - Tradeoff: Tiny doc edit.
  - Confidence: HIGH.
  - Blind spot: None.
- **Decision**: PENDING

### F3 — Manual rows 1.6/1.8/1.9 checked on a global sign-off, not per-item

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious
- **Dimension**: Success Criteria
- **Location**: context/changes/drill-landscape-fit/plan.md Progress 1.6, 1.8, 1.9
- **Detail**: 1.4/1.5 (the exercise views) are directly evidenced by the user's
  "now it looks ok" after `e573f93`. But 1.6 (setup + results fit landscape), 1.8
  (iPhone / iPad-portrait / desktop regression), and 1.9 (full flow) were flipped
  on the same global confirmation. Notably, the results screen got only the lighter
  token treatment — not the `max-h` cap — so "results fits landscape" (1.6) is
  plausibly still unverified if it is a tall view.
- **Fix**: Re-confirm 1.6/1.8 on the device (or reopen those rows). If results still
  scrolls in landscape and it matters, give it the same `max-h` treatment as the
  exercises.
- **Decision**: PENDING

## Notes

- **Pattern observation (not a formal finding)**: the results screen uses one-off
  inline `dvh` arbitrary values (`text-[length:min(3.75rem,8dvh)]`,
  `p-[min(1.5rem,3dvh)]`, `gap-[min(0.75rem,1.5dvh)]`) rather than named `--drill-*`
  tokens. The plan explicitly sanctioned "token or inline `min()`" for the results
  screen, so this is allowed; flagged only in case a future pass wants to promote
  repeated values to tokens.
- **Plan adherence detail**: all three planned changes (height-aware tokens, gap
  token application, results-screen bespoke-size fit) MATCH intent. Intentional
  refinements within the plan's stated latitude: three graduated gap tokens
  (`--drill-gap-sm/-gap/-gap-lg`) instead of the two the contract named — required
  to preserve each portrait gap baseline exactly — and `--drill-prompt-text` tuned
  to `18dvh` (plan's `22dvh` was an explicit "tune on device" starting point).
