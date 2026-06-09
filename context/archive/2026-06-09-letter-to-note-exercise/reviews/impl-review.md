<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Letter-to-Note Exercises

- **Plan**: context/changes/letter-to-note-exercise/plan.md
- **Scope**: All phases (1–2 of 2, complete) — commits 4bb0367 (P1), 3962949 (P2)
- **Date**: 2026-06-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS (2 observations) |
| Success Criteria | PASS |

## What was verified

- **Plan vs. diff**: all 5 planned source files changed (`exercises.ts`, `DrillSession.tsx`, `LetterToNoteExercise.tsx` (new), `SessionResults.tsx`, `api/sessions.ts`); nothing unplanned. `saveSession.ts` correctly left untouched — plan item #5 was verify-only and the union `AnswerRecord` exposes the three shared fields (`exerciseType`, `note`, `isCorrect`) it maps, so no edit was needed.
- **Accuracy-critical core** (`exercises.ts`): distinct-letter / single-correct-option invariant holds (`letterToNoteOptions` excludes the prompt letter, picks 2 distinct distractor letters, one pitch each; only `targetPitch` carries the prompt letter; distractors can't collide with the target or each other). Balanced split `ceil/floor` → 5:3/2, 10:5/5, 20:10/10, odd leans note→letter. No-back-to-back rule: every target drawn via `nextPitch(previousTarget)` across both types.
- **Orchestrator** (`DrillSession.tsx`): `buildSession()` runs in `handleStart` (event handler), stable save-ids generated in `handleNext` — render stays pure, react-compiler clean. Per-type scoring matches each component's feedback logic; stored `note = targetPitch` for letter→note.
- **API widening** (`sessions.ts:67`): per-answer guard accepts either constant, `AnswerPayload['exercise_type']` widened; auth (401), pitch/boolean/length validation, idempotent upserts, and RLS untouched.
- **Automated success criteria (re-run during review)**: `npx astro check` → 0 errors; `npm run lint` → 0 errors (1 pre-existing `no-console` warning at DrillSession.tsx:76, inherited from S-01 commit 2ff243a — not introduced by this change); `npm run build` → Complete.
- **Manual success criteria**: 1.3–1.6 and 2.4–2.12 are checked `[x]` in Progress and structurally supported by the code; runtime/Supabase-Studio items (2.9–2.11) rely on human confirmation per the plan's manual-verification design (the epilogue commit 8de3c3b closed out the plan). No rubber-stamping red flags.

## Findings

### F1 — Stale module doc in the API route

- **Severity**: 🔢 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/sessions.ts:6-8
- **Detail**: The route now persists both exercise types, but its header comment still reads "Persist a completed note→letter session and its answers." The code widened; the doc didn't.
- **Fix**: Reword to "Persist a completed drill session (note→letter and letter→note) and its answers".
- **Decision**: FIXED

### F2 — Wrong-answer cue differs from the sibling component

- **Severity**: 🔢 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/drill/LetterToNoteExercise.tsx:91
- **Detail**: On a wrong pick `LetterToNoteExercise` shows "✗ Not quite", whereas `NoteToLetterExercise` reveals the answer ("✗ It was {letter}"). Almost certainly intentional — the correct staff card is already greened on screen, so a text reveal would be redundant — but it's an asymmetry between siblings worth a glance to confirm it's by design.
- **Fix**: Leave as-is if intentional (recommended); no code change needed.
- **Decision**: SKIPPED (confirmed intentional — correct staff card is already highlighted)
