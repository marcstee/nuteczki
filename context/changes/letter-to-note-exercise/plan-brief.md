# Letter-to-Note Exercises — Plan Brief

> Full plan: `context/changes/letter-to-note-exercise/plan.md`

## What & Why

Roadmap **S-02** (PRD US-01, FR-005): add the second exercise type — **letter→note** — and mix it into the existing drill alongside the note→letter exercises shipped by S-01. The child sees a letter name ("Find this note: C") and picks the matching note from 3 staff options. This completes the two-exercise-type core the product promises; without it the drill only tests one direction of note reading.

## Starting Point

The full drill loop already exists and is reviewed (S-01): a `setup→active→finished` orchestrator, a pure domain core (`exercises.ts`), the reusable `<Staff>` renderer, an idempotent batch save, and a results screen. The DB schema already permits `letter_to_note` (the `answers.exercise_type` CHECK lists both), so this is an extension of finished infrastructure — not new plumbing.

## Desired End State

Every session interleaves both exercise types. A letter→note exercise shows a large prompt letter and three staff cards; tapping the card whose note matches the letter scores correct (any octave), with the same green/red feedback as today. The session auto-finishes with overall accuracy % plus two per-type stat blocks, and persists both types in one batch save.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Octave-ambiguity correctness | Any-octave; 3 distinct-letter options | A letter-only prompt can't demand an octave, so exactly one option carries the prompt letter and any octave of it is correct | Plan |
| 3-option presentation | Three separate `<Staff>` cards | Reuses the renderer verbatim, reads as "3 options", gives child-sized tap targets | Plan |
| Type mixing | Balanced shuffled deck (odd leans note→letter) | Guarantees both types every session, best fit for "mixed" in the roadmap/US-01 | Plan |
| Distractor selection | 2 random pitches, letters distinct from prompt & each other | Age-appropriate difficulty (FR-005 keeps it gentle); enforces the single-correct-option rule | Plan |
| Results breakdown | Two labeled stat blocks | Fills the hook `SessionResults` already left; satisfies FR-008 per-type breakdown | Plan |
| No-immediate-repeat scope | Same target note never back-to-back; type may repeat | Preserves the working S-01 behavior without over-constraining the deck | Plan |
| Letter prompt display | Large letter + "Find this note" caption | Clear task cue for a pre-reader; mirrors the note→letter card's prominence | Plan |
| Phasing | 2 phases (persistence already exists) | The only DB-side change is relaxing one API validation — too small for its own phase | Plan |

## Scope

**In scope:** letter→note exercise type; mixing both types per session; the new exercise component; orchestrator refactor to drive a mixed deck; per-type results (FR-008); widening the API to accept `letter_to_note`.

**Out of scope:** adaptive weighting (S-03); session history (S-04); any schema/RPC change; staff-renderer changes; octave-precision drilling; server-side re-scoring; a test runner.

## Architecture / Approach

Mirror S-01's pure-core split. New domain logic — the `letter_to_note` constant, an `Exercise` discriminated union, distractor selection, and a `buildSession(count, rng)` that pre-builds a balanced, shuffled, no-back-to-back-note deck — lands in the pure `exercises.ts`. The orchestrator becomes an index walk over that pre-built `Exercise[]`, rendering `NoteToLetterExercise` or the new `LetterToNoteExercise` per step and scoring by type. Feedback/scoring stay fully client-side. Persistence reuses the existing batch save; only the API's accepted `exercise_type` set widens. `AnswerRecord` becomes a union whose members share the three fields the save path reads (`exerciseType`, `note`, `isCorrect`).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Letter→note domain core (pure) | `buildSession` + `Exercise`/`AnswerRecord` unions + distractor logic in `exercises.ts` | Getting the distinct-letter / single-correct-option invariant exactly right |
| 2. Mixed drill UI + persistence widening | New exercise component, orchestrator refactor, per-type results, API widening — a fully playable, persisted, mixed session | Orchestrator refactor must stay react-compiler clean while handling two answer shapes |

**Prerequisites:** S-01 (`basic-drill-note-to-letter`) — done and reviewed. No migration, no new dependency.
**Estimated effort:** ~1–2 sessions across 2 phases.

## Open Risks & Assumptions

- Assumes the DB `answers.exercise_type` CHECK already includes `letter_to_note` (confirmed in the F-01 schema) — so no migration is needed.
- Assumes tapping a whole staff card (not a notehead-level target) is the intended interaction for "3 visual options" — chosen for simplicity and tap-target size.
- `saveSession` is expected to need no change (it reads only the union's shared fields); the plan flags a fallback adjustment if the union narrows field access.

## Success Criteria (Summary)

- The child plays a session that interleaves both exercise types and can correctly answer a letter→note exercise (any octave of the prompt letter), with immediate green/red feedback.
- The results screen shows accurate per-type counts plus overall accuracy %.
- A completed mixed session persists one `sessions` row + N `answers` rows carrying both `exercise_type` values, scoped to the user, with no duplicates on retry.
