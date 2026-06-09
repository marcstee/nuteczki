# Letter-to-Note Exercises Implementation Plan

## Overview

Deliver roadmap **S-02** (PRD US-01, FR-005): add a second exercise type — **letter→note** — and mix it into the existing drill alongside the note→letter exercises shipped by S-01. The child sees a **letter name** ("Find this note: C") and picks the matching note from **3 staff options**, with the same immediate green/red feedback the note→letter loop already gives. Every session is now a balanced shuffle of both types, and the end-of-session stats break results down per type (FR-008).

This is a focused extension, not a new feature: the drill loop, staff renderer, idempotent batch save, and results screen all exist and are `impl_reviewed`. The new work is the pure exercise-generation logic for the second type, one new exercise component, an orchestrator refactor to drive a mixed deck, a second stats block, and relaxing one API validation. Adaptive weighting (S-03) and session history (S-04) remain out of scope.

## Current State Analysis

S-01 (`basic-drill-note-to-letter`) is complete and reviewed; this change layers the second exercise type onto its finished infrastructure.

- **Pure drill core is live** ([exercises.ts](src/components/drill/exercises.ts)): exports `Letter`, `LETTERS`, `EXERCISE_TYPE_NOTE_TO_LETTER`, `pitchToLetter` (the `B4`→`H` map, row-by-row over all 13 pitches), `nextPitch(previous, rng?)` (uniform pick excluding the previous pitch), `summarize`, and the `AnswerRecord` interface. All pure, `rng`-injectable, test-ready.
- **Drill orchestrator is live** ([DrillSession.tsx](src/components/drill/DrillSession.tsx)): a `setup → active → finished` island. State is `phase`, `exerciseCount`, `answers: AnswerRecord[]`, `currentPitch`, `chosenLetter`, `startedAt`, plus stable save ids (`sessionId`, `answerIds`) and `saveState`. Stable ids are generated in the `handleNext` event handler on the transition into `finished` (never in render — that would break idempotency and the enforced `react-compiler/react-compiler` rule), then reused on every retry.
- **Exercise + results components are live** ([NoteToLetterExercise.tsx](src/components/drill/NoteToLetterExercise.tsx), [SessionResults.tsx](src/components/drill/SessionResults.tsx)). `SessionResults` already labels its stat block "Note → letter" with an inline note that S-02 adds a second line "without restructuring".
- **Staff renderer is a ready-to-embed child** ([Staff.tsx](src/components/staff/Staff.tsx)): `Staff({ note: Pitch, className?, "aria-label"? })`, SSR-safe, themes via `currentColor`. Its doc comment names `<g data-pitch>` as "the stable hook S-02 will target for clickable answers." `pitch.ts` exports `Pitch`, `PITCHES` (13 pitches C4→A5), and the positional helpers.
- **Persistence is live and idempotent** ([saveSession.ts](src/components/drill/saveSession.ts) → [api/sessions.ts](src/pages/api/sessions.ts)): a single batch `POST /api/sessions` upserts the session + all answers on client-generated UUIDs with `ignoreDuplicates`. **The DB already permits both types** — `answers.exercise_type` CHECK ∈ {`note_to_letter`, `letter_to_note`} — so **no migration is needed**. But the API route currently hard-rejects any `exercise_type !== EXERCISE_TYPE_NOTE_TO_LETTER` ([sessions.ts:67](src/pages/api/sessions.ts)); that single check must widen.
- **No test runner is installed.** Per the S-01 precedent and the module lesson boundary, the pure core stays test-ready; verification is manual.

## Desired End State

A logged-in user starts a drill exactly as today, but each session now interleaves both exercise types. On a **letter→note** exercise the child sees a large prompt letter with a "Find this note" caption and three staff cards; tapping a card locks all three, greens the card whose note matches the prompt letter, reds a wrong pick, shows a ✓/✗ cue, and "Next" advances. On a **note→letter** exercise nothing changes. After the last exercise the session auto-finishes and shows accuracy % plus **two** per-type stat blocks (note→letter and letter→note). The completed session persists in one batch with each answer carrying its real `exercise_type`; the save-failure/retry path is unchanged. Type-check, lint, and build all pass.

**Verification:** play a 10-exercise session in `npm run dev`; confirm both types appear (~5 each), letter→note scores correctly (any-octave match), feedback colors the right card, no two consecutive exercises drill the same note; confirm one `sessions` row + 10 `answers` rows in Supabase Studio with a mix of `note_to_letter` / `letter_to_note` and matching `note`/`is_correct`; confirm the results screen shows accurate per-type counts.

### Key Discoveries:

- **A prompt letter is octave-ambiguous; the fairness rule is "distinct-letter options"** — "C" maps to both `C4` and `C5`. The session is built so the 3 options always carry 3 **different** letters, so exactly one option matches the prompt; any octave of that letter is the single correct card. This resolves the ambiguity by construction (decided this session) and is the lone new musical-domain rule S-02 owns.
- **The DB already allows `letter_to_note`** ([session-data-schema](context/changes/session-data-schema/plan.md), CHECK on `answers.exercise_type`) — only the API's structural validation ([sessions.ts:67](src/pages/api/sessions.ts)) blocks it. No schema or RPC work.
- **`<Staff note={pitch} />` is reused verbatim** for each of the 3 options — no renderer change. Tapping the whole card (a `<button>` wrapping a `<Staff>`) is simpler and reads better than targeting `data-pitch` noteheads, and gives child-sized tap targets (NFR).
- **`SessionResults` was built for this** ([SessionResults.tsx:50](src/components/drill/SessionResults.tsx)) — a second labeled stat block drops in beside the first; the orchestrator computes per-type stats by filtering `answers` by `exerciseType` and calling the existing `summarize` twice.
- **The stored `note` for a letter→note answer is the target pitch** (the drilled note), keeping `answers.note` meaningful for the S-03 adaptive reader, which weights per note per exercise type.

## What We're NOT Doing

- **No adaptive selection** (S-03 / FR-003) — selection stays random (balanced shuffle); `note_error_stats` stays unused.
- **No session history view** (S-04 / FR-009) — the in-session results screen remains the only stats surface.
- **No migration / RPC / schema change** — the F-01 schema already permits `letter_to_note`.
- **No staff-renderer change** — `Staff` is reused as-is; we do **not** add multi-note rendering or notehead-level click targets.
- **No octave-precision drilling** — a letter-only prompt cannot demand a specific octave; any matching letter counts (decided this session). Octave-specific exercises are out of scope.
- **No server-side re-scoring** — the server still trusts the client's `is_correct` (validates structure only), unchanged from S-01.
- **No new persistence mechanism** — the existing idempotent batch save is reused; only its accepted `exercise_type` set widens.
- **No test runner** — pure core kept test-ready; manual verification only (S-01 precedent, module lesson boundary).

## Implementation Approach

Mirror S-01's pure-core split. All new musical/domain logic — the second exercise-type constant, the `Exercise` discriminated union, distractor selection, and the balanced-deck session builder — lands in the pure `exercises.ts` so the accuracy-critical pieces stay auditable and unit-test-ready. The session is **pre-built** once at start as an ordered `Exercise[]` (a balanced, shuffled mix honoring the no-back-to-back-note rule), simplifying the orchestrator to an index walk over that array and rendering the matching component per exercise. Feedback and scoring stay 100% client-side (no network in the answer loop, well under the 200 ms NFR). Persistence reuses the existing batch save unchanged except for widening the API's accepted `exercise_type` set. The build is two phases: pure core (P1), then the mixed UI + per-type results + API widening as one cohesive, end-to-end-verifiable increment (P2).

## Critical Implementation Details

- **Distinct-letter options are the correctness contract.** Each letter→note exercise has exactly one option whose `pitchToLetter` equals the prompt letter; the other two options have different letters (and differ from each other). Scoring is `pitchToLetter(chosenPitch) === promptLetter`. A bug that lets two options share the prompt letter makes a correct answer look wrong — treat this rule as accuracy-critical, on par with `pitchToLetter` itself.
- **Pre-build the session in an event handler, never in render.** `buildSession` calls `Math.random`/`crypto`-free `rng` and must run inside `handleStart` (an event handler), not during render — calling it in render would reshuffle every render and violate the enforced `react-compiler/react-compiler` rule. Same discipline already governs the stable save-id generation in `handleNext`; keep it.
- **Stored `note` is the drilled pitch for both types.** note→letter stores the displayed pitch; letter→note stores the **target** pitch (the correct option). `chosenPitch`/`chosenLetter` are in-memory feedback state only — they are never persisted (the schema has one `note` column + `is_correct`). This keeps `answers.note` a clean per-note signal for S-03.

## Phase 1: Letter→note domain core (pure)

### Overview

Extend the pure drill core with everything the second exercise type needs: the `letter_to_note` constant, an `Exercise` discriminated union, a union `AnswerRecord`, and a `buildSession` that produces a full balanced-and-shuffled session of both types with distinct-letter distractors and no back-to-back target note. No React, no DOM, no network — auditable and unit-test-ready, exactly like S-01's core.

### Changes Required:

#### 1. Extend the drill domain module

**File**: `src/components/drill/exercises.ts`

**Intent**: Add the letter→note domain — the second exercise-type constant, the typed shape of each generated exercise, the per-answer record now that two types exist, and a pure session builder that lays out a balanced, shuffled, no-immediate-repeat mix of both types with fair (distinct-letter) distractors. Reuse `pitchToLetter`, `nextPitch`, `PITCHES`, `Letter`, `LETTERS` — do not duplicate them.

**Contract**: Adds to the existing exports:

- `const EXERCISE_TYPE_LETTER_TO_NOTE = 'letter_to_note'` — matches the `answers.exercise_type` CHECK value, mirroring the existing note→letter constant.
- A discriminated `Exercise` union (discriminant: the exercise-type constant):
  - note→letter: `{ type: typeof EXERCISE_TYPE_NOTE_TO_LETTER; pitch: Pitch }`.
  - letter→note: `{ type: typeof EXERCISE_TYPE_LETTER_TO_NOTE; promptLetter: Letter; targetPitch: Pitch; options: readonly Pitch[] }` — `options` is the 3 candidate pitches in display order (shuffled), containing `targetPitch` plus two distractors whose letters are distinct from `promptLetter` and from each other; exactly one option satisfies `pitchToLetter(option) === promptLetter`.
- `AnswerRecord` becomes a discriminated union over `exerciseType`, both members carrying the fields the save path reads (`exerciseType`, `note: Pitch`, `isCorrect: boolean`):
  - note→letter: `{ exerciseType: typeof EXERCISE_TYPE_NOTE_TO_LETTER; note: Pitch; chosenLetter: Letter; isCorrect: boolean }`.
  - letter→note: `{ exerciseType: typeof EXERCISE_TYPE_LETTER_TO_NOTE; note: Pitch; chosenPitch: Pitch; isCorrect: boolean }` (`note` = the target pitch).
- `function buildSession(count: 5 | 10 | 20, rng?: () => number): Exercise[]` — pure given `rng` (defaults to `Math.random`). Produces exactly `count` exercises: `ceil(count/2)` note→letter and `floor(count/2)` letter→note (odd counts lean note→letter, the established type), shuffled into a single ordered deck, where **no two consecutive exercises share the same target note** (the displayed pitch for note→letter, the `targetPitch` for letter→note). Each note→letter exercise picks a target pitch; each letter→note exercise picks a target pitch, derives `promptLetter = pitchToLetter(targetPitch)`, selects two distractor pitches whose letters are distinct from the prompt and each other, and returns the three shuffled `options`.

A small internal helper to pick a letter→note exercise's distractors (e.g. choose two letters from `LETTERS` excluding the prompt, then a pitch per letter from `PITCHES`) keeps the fairness rule in one auditable place. The previous-target exclusion can reuse `nextPitch`'s "exclude previous" idea.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- For each count (5/10/20), `buildSession` returns exactly `count` exercises with the balanced split (5→3 note→letter + 2 letter→note; 10→5/5; 20→10/10).
- Every letter→note exercise has exactly 3 options with 3 distinct letters, exactly one matching `promptLetter`, and `targetPitch` among the options.
- No two consecutive exercises in a built session share the same target note (displayed pitch / `targetPitch`), across repeated builds.
- The `AnswerRecord` union members both expose `note`, `exerciseType`, and `isCorrect` (so the existing save mapping still type-checks).

**Implementation Note**: After this phase and automated verification passes, pause for human confirmation of the distinct-letter fairness rule and the balanced split before proceeding. Phase blocks use plain bullets; the `## Progress` section owns the checkboxes.

---

## Phase 2: Mixed drill UI + persistence widening

### Overview

Make the mixed session playable and persisted end-to-end: a new letter→note exercise component, an orchestrator refactor to build and walk the mixed deck and render either type, a second per-type stat block on the results screen, and a one-line widening of the API to accept `letter_to_note`. After this phase a session interleaves both types, gives correct feedback for each, finishes with accurate per-type stats, and saves both types in one idempotent batch.

### Changes Required:

#### 1. Letter→note exercise component

**File**: `src/components/drill/LetterToNoteExercise.tsx` (new)

**Intent**: Render one letter→note exercise — a large prompt letter with a "Find this note" caption and the 3 staff option cards — with locked, color-coded feedback after answering and a tap-to-continue control. Feedback-only; scoring lives in the orchestrator.

**Contract**: Default export. Props: `{ promptLetter: Letter; options: readonly Pitch[]; answered: boolean; chosenPitch: Pitch | null; onAnswer: (pitch: Pitch) => void; onNext: () => void; progress: { index: number; total: number } }`. Renders the "Exercise i of total" cue, a caption ("Find this note") above a large `promptLetter`, then one tappable card per `options` entry, each wrapping `<Staff note={option} />` on the same white "paper" card treatment the note→letter view uses. Before answering, cards are active. After `onAnswer`, all cards lock; the **correct** card (the option where `pitchToLetter(option) === promptLetter`) turns green, a wrong pick turns red, the rest dim, a ✓/✗ cue appears, and a large child-sized "Next" control calls `onNext`. Each option card carries an accessible name (reuse `Staff`'s `aria-label`). Mirrors `NoteToLetterExercise`'s visual language and house style.

#### 2. Orchestrator: build & drive the mixed deck

**File**: `src/components/drill/DrillSession.tsx`

**Intent**: Build the balanced mixed session at start and walk it, rendering the matching exercise component per step and scoring each answer by type, while keeping the existing setup/finished/save behavior intact.

**Contract**: Replace the single-pitch loop state with the pre-built deck. On `handleStart(count)`, set `exercises = buildSession(count)` (in the event handler, never render) and `currentIndex = 0`. State holds `exercises: Exercise[]`, `currentIndex`, the running `answers: AnswerRecord[]`, and a per-exercise chosen-answer marker that distinguishes "not answered" from the chosen `Letter`/`Pitch` (e.g. a nullable discriminated `chosen`). Rendering the active phase switches on `exercises[currentIndex].type`: note→letter renders `NoteToLetterExercise` (unchanged props), letter→note renders `LetterToNoteExercise` with `promptLetter`/`options`. `handleAnswer` scores by type — note→letter: `chosenLetter === pitchToLetter(pitch)`; letter→note: `pitchToLetter(chosenPitch) === promptLetter` — and appends the matching `AnswerRecord` (letter→note stores `note = targetPitch`). `handleNext` advances `currentIndex` (resetting the chosen marker) until all `count` exercises are answered, then transitions to `finished` and kicks off the existing background save (stable ids generated here, as today). Progress uses `currentIndex`. `handleAgain` resets the new deck state alongside the existing fields. Stays declarative `useState`, react-compiler clean.

#### 3. Results: per-type breakdown

**File**: `src/components/drill/SessionResults.tsx`

**Intent**: Show correct/incorrect for **both** exercise types (FR-008), keeping the overall accuracy % and the unchanged save-status / exit actions.

**Contract**: Replace the single `correct`/`incorrect` pair with per-type stats — e.g. accept a `byType: { noteToLetter: { correct; incorrect }; letterToNote: { correct; incorrect } }` shape (or two explicit pairs) plus the existing `accuracyPct`, `onAgain`, `onDone`, `saveState`, `onRetrySave`. Render the existing "Note → letter" block and a sibling "Letter → note" block, each with its correct/incorrect counts. The orchestrator computes each by filtering `answers` on `exerciseType` and calling the existing `summarize`. Overall accuracy stays `summarize(answers).accuracyPct`. No change to the save-status indicator or the Practice again / Done actions.

#### 4. Widen the API to accept letter→note

**File**: `src/pages/api/sessions.ts`

**Intent**: Accept and persist `letter_to_note` answers, which the DB already allows; the route currently rejects them.

**Contract**: Import `EXERCISE_TYPE_LETTER_TO_NOTE`. In `parseBody`, change the per-answer guard from `exercise_type !== EXERCISE_TYPE_NOTE_TO_LETTER` to accept **either** constant (reject anything else → `400`); widen `AnswerPayload['exercise_type']` to the union of both constants. All other validation is unchanged — `note` is still a `Pitch`, `is_correct` still a boolean, `answers.length === exercise_count`. The two idempotent upserts and RLS are untouched.

#### 5. Save helper (verify only)

**File**: `src/components/drill/saveSession.ts`

**Intent**: Confirm the batch payload builder still works against the union `AnswerRecord` with no change.

**Contract**: `saveSession` maps `answer.exerciseType`, `answer.note`, `answer.isCorrect` — all common to both union members — so it should need **no edit**. If the union narrows access to any of these fields, adjust the mapping to read only the shared fields. No behavior change.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint` (including `react-compiler/react-compiler`)
- Build passes: `npm run build`

#### Manual Verification:

- `npm run dev`: a 10-exercise session interleaves both types (~5 each); both types appear within a single session.
- A letter→note exercise shows the "Find this note" caption + large letter and 3 staff cards with 3 distinct letters; tapping the matching-letter card scores correct (any octave), a non-matching card scores wrong.
- Answering a letter→note exercise locks the cards, greens the correct card, reds a wrong pick, shows the ✓/✗ cue; "Next" advances. note→letter exercises behave exactly as before.
- No two consecutive exercises drill the same note, across either type.
- Auto-finish shows overall accuracy % and **two** stat blocks (note→letter and letter→note) with counts matching what was played; "Practice again" restarts; "Done" → `/dashboard`.
- Completing a mixed session writes one `sessions` row + `exercise_count` `answers` rows in Supabase Studio, with a mix of `note_to_letter` / `letter_to_note` and matching `note`/`is_correct`, all scoped to the logged-in user; a second account cannot see them (RLS holds).
- Simulating a failed save still shows stats + "Retry save"; retry persists with no duplicate rows.
- An unauthenticated `POST /api/sessions` returns `401`; a payload mixing valid `letter_to_note` answers succeeds; a payload with an unknown `exercise_type` or bad `note` returns `400`.
- Option cards are comfortably tappable at phone width (child motor-skill NFR).

**Implementation Note**: After this phase and automated verification passes, pause for human confirmation that the mixed loop, letter→note feedback, per-type stats, and persistence of both types all behave correctly. This completes the slice.

---

## Testing Strategy

### Unit Tests:

- **Deferred by decision** (no runner installed; module lesson boundary). The new `buildSession`, the distractor selector, and the `Exercise` shape are written as pure, `rng`-injectable functions so a later Vitest suite can assert the balanced split, the distinct-letter / single-correct-option invariant, and the no-back-to-back-note rule without a DOM — the natural first test target alongside the existing `pitchToLetter`/`nextPitch`/`summarize`.

### Integration Tests:

- Manual end-to-end only this slice: play a mixed session, confirm persisted rows (both `exercise_type` values) and RLS scoping in Supabase Studio.

### Manual Testing Steps:

1. `npm run dev`, log in, open `/dashboard`, tap "Start practising" → `/drill`.
2. Pick 10; confirm both exercise types appear (~5 each) and no two consecutive exercises drill the same note.
3. On a letter→note exercise, deliberately tap a wrong card once and a correct card once (including an "H"/`B4` prompt); confirm the correct card greens, the wrong pick reds, the ✓/✗ cue, and tap-to-continue.
4. On a note→letter exercise, confirm behavior is unchanged from S-01.
5. At finish, confirm overall accuracy % and both per-type stat blocks with correct counts; tap "Practice again" then "Done".
6. In Supabase Studio confirm one `sessions` row + 10 `answers` rows scoped to your user, with a mix of `note_to_letter`/`letter_to_note` and correct `note`/`is_correct`.
7. Stop the local Supabase (or go offline), complete a mixed session; confirm stats still show, error + "Retry save" appears; restore and retry; confirm a single (non-duplicated) session persists.
8. `curl` `POST /api/sessions` unauthenticated → `401`; with an unknown `exercise_type` → `400`; with a valid mixed payload → `200`.

## Performance Considerations

- Feedback is pure client state — no network in the answer loop — so the 200 ms NFR is met trivially for both types.
- Each letter→note exercise renders 3 small reused `Staff` SVGs; no notation library, no new dependency, negligible cost.
- A completed session is still ~2 DB writes (session upsert + answers upsert) in one API invocation, well under Cloudflare's 50-subrequest free-tier limit.

## Migration Notes

None — no schema, dependency, or config changes. The F-01 schema already permits `letter_to_note`; only the API's accepted `exercise_type` set widens. The idempotent insert relies only on the existing primary keys.

## References

- Roadmap S-02: [`context/foundation/roadmap.md:115-125`](context/foundation/roadmap.md)
- PRD user story + FR: [`context/foundation/prd.md`](context/foundation/prd.md) (US-01, FR-005, FR-006, FR-008)
- S-01 (the mirror this extends): [`context/changes/basic-drill-note-to-letter/plan.md`](context/changes/basic-drill-note-to-letter/plan.md)
- Drill core & UI: [`src/components/drill/exercises.ts`](src/components/drill/exercises.ts), [`src/components/drill/DrillSession.tsx`](src/components/drill/DrillSession.tsx), [`src/components/drill/NoteToLetterExercise.tsx`](src/components/drill/NoteToLetterExercise.tsx), [`src/components/drill/SessionResults.tsx`](src/components/drill/SessionResults.tsx)
- Persistence: [`src/components/drill/saveSession.ts`](src/components/drill/saveSession.ts), [`src/pages/api/sessions.ts`](src/pages/api/sessions.ts)
- Staff renderer: [`src/components/staff/Staff.tsx`](src/components/staff/Staff.tsx), [`src/components/staff/pitch.ts`](src/components/staff/pitch.ts)
- Schema (allows `letter_to_note`): [`context/changes/session-data-schema/plan.md`](context/changes/session-data-schema/plan.md)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Letter→note domain core (pure)

#### Automated

- [x] 1.1 Type checking passes: `npx astro check`
- [x] 1.2 Linting passes: `npm run lint`

#### Manual

- [x] 1.3 `buildSession` returns `count` exercises with the balanced split (5→3/2, 10→5/5, 20→10/10)
- [x] 1.4 Every letter→note exercise has 3 distinct-letter options, exactly one matching `promptLetter`, with `targetPitch` among them
- [x] 1.5 No two consecutive exercises share the same target note, across repeated builds
- [x] 1.6 Both `AnswerRecord` union members expose `note`/`exerciseType`/`isCorrect` (save mapping type-checks)

### Phase 2: Mixed drill UI + persistence widening

#### Automated

- [ ] 2.1 Type checking passes: `npx astro check`
- [ ] 2.2 Linting passes: `npm run lint` (react-compiler clean)
- [ ] 2.3 Build passes: `npm run build`

#### Manual

- [ ] 2.4 A session interleaves both types (~half each); both appear within one session
- [ ] 2.5 Letter→note shows caption + large letter + 3 distinct-letter staff cards; matching-letter card scores correct (any octave), non-matching scores wrong
- [ ] 2.6 Letter→note feedback locks/greens correct card, reds wrong pick, shows ✓/✗; "Next" advances; note→letter unchanged
- [ ] 2.7 No two consecutive exercises drill the same note, across either type
- [ ] 2.8 Auto-finish shows accuracy % + two per-type stat blocks with counts matching play; "Practice again" resets; "Done" → `/dashboard`
- [ ] 2.9 Mixed session writes 1 `sessions` row + N `answers` rows with mixed `exercise_type`, scoped to the user; second account can't see them (RLS)
- [ ] 2.10 Failed save still shows stats + "Retry save"; retry persists with no duplicate rows
- [ ] 2.11 Unauthenticated POST → 401; valid mixed payload → 200; unknown `exercise_type`/bad `note` → 400
- [ ] 2.12 Option cards comfortably tappable at phone width (child motor-skill NFR)
