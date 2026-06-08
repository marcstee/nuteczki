# Basic Drill: Note-to-Letter Exercises Implementation Plan

## Overview

Deliver roadmap **S-01** — the north star — by wiring the two finished foundations (F-01 schema, F-02 staff renderer) into a working drill loop. A logged-in user picks a preset exercise count (5 / 10 / 20), the child sees note-to-letter exercises (a note on the treble staff, pick the matching letter from 7 buttons `C D E F G A H`) with random selection, gets immediate visual feedback after each answer, and the session auto-finishes with stats (correct / incorrect counts + accuracy %). Session and answers persist to Supabase in a single batch save at the end.

This proves the core product hypothesis — the drill loop works end-to-end. Scope is deliberately narrow: one exercise type (note→letter), random selection only. Letter-to-note (S-02) and adaptive weighting (S-03) are out of scope.

## Current State Analysis

Both prerequisites are implemented and `impl_reviewed`; this change only wires them together plus adds the session lifecycle, drill UI, and one write-path API route.

- **F-01 schema is live** ([database.types.ts](src/db/database.types.ts)): `sessions` (`id`, `user_id`, `exercise_count` CHECK ∈ {5,10,20}, `started_at`, `finished_at` nullable = in-progress, `created_at`) and `answers` (`id`, `session_id`, `user_id`, `exercise_type` CHECK ∈ {`note_to_letter`,`letter_to_note`}, `note` text, `is_correct`, `answered_at`). The typed client is wired ([supabase.ts](src/lib/supabase.ts)). RLS is scoped to `auth.uid()`; **`answers` is insert-only and `sessions` has no DELETE policy** — neither table can be updated/deleted from the app under the authenticated role.
- **F-02 renderer is live** ([Staff.tsx](src/components/staff/Staff.tsx)): default-export React component `Staff({ note: Pitch, className?, "aria-label"? })`; pure [pitch.ts](src/components/staff/pitch.ts) exports `Pitch`, `PITCHES` (the 13 beginner pitches C4→A5), `pitchToStaffStep`, `needsLedgerLine`. It is plain SSR-safe React, so the drill island renders `<Staff note={…} />` directly. **The renderer is positional only — it never emits letter names; the H-vs-B labeling is explicitly S-01's job.**
- **Auth + house patterns** ([middleware.ts](src/middleware.ts)): `PROTECTED_ROUTES = ["/dashboard"]` redirects unauthenticated users to `/auth/signin` and sets `context.locals.user`. Pages (`.astro`) mount default-export React islands with `client:load` ([signin.astro](src/pages/auth/signin.astro)); mutations go island → API route under `src/pages/api/` → server `createClient()` ([signin.ts](src/pages/api/auth/signin.ts)). `createClient()` returns `null` when Supabase env is unset.
- **No test runner is installed.** Staff-renderer deferred Vitest by decision and verified manually; this module's lesson boundary says not to introduce testing strategy. We follow that precedent — keep the drill's pure core test-ready, verify manually.
- **Infra constraint** ([infrastructure.md](context/foundation/infrastructure.md)): Cloudflare Workers free tier caps subrequests at 50 per invocation; each Supabase call is one subrequest. The batch-save design keeps a completed session to ~2 DB writes in one invocation.

## Desired End State

A logged-in user starts from a "Start practising" CTA on `/dashboard`, lands on a protected `/drill` page, picks a count, and plays a full note→letter drill: each exercise shows a note on the staff and 7 letter buttons; tapping a button locks the choice, colors correct (green) / wrong-pick (red), shows a ✓/✗ cue, and a "Next" control advances; after the last exercise the session auto-finishes and shows correct/incorrect counts + accuracy %, with "Practice again" and "Done" actions. The completed session and all answers are saved to Supabase in one batch; if the save fails, stats still show and a clear "Retry save" affordance appears. Type-check, lint, and build all pass.

**Verification:** play a 5-exercise session in `npm run dev`; confirm correct staff notes, correct letter scoring (incl. `B4`→`H`), instant feedback, accurate stats; confirm one `sessions` row + 5 `answers` rows in Supabase Studio scoped to the logged-in user; confirm the save-failure path surfaces an error and retry recovers.

### Key Discoveries:

- **`B4` maps to the `H` button**, every other pitch to its first letter ([prd.md:87](context/foundation/prd.md) FR-004: buttons `C D E F G A H`). This Polish/German labeling is the one piece of musical-domain logic S-01 owns; `pitch.ts` intentionally stays scientific (`B4`, never `H4`).
- **`answers` is immutable and `sessions` is non-deletable under RLS** ([session-data-schema/plan.md](context/changes/session-data-schema/plan.md) lines 86–89). A failed partial save cannot be cleaned up server-side — this drives the idempotent-save design (client-generated UUIDs + insert-or-ignore) rather than delete-and-retry.
- **The `Staff` component is a ready-to-embed React child** ([Staff.tsx](src/components/staff/Staff.tsx)) — no refactor needed; the drill island imports it and `PITCHES`/`Pitch` directly.
- **API routes must self-guard auth**, not rely on `PROTECTED_ROUTES` — that middleware redirects to a login *page*, which is wrong for a `fetch()`. The `/api/sessions` route checks the user itself and returns `401` JSON.

## What We're NOT Doing

- **No letter-to-note exercises** (S-02 / FR-005) — only note→letter this slice.
- **No adaptive selection** (S-03 / FR-003) — random with no back-to-back repeats; the `note_error_stats` view stays unused here.
- **No session history view** (S-04 / FR-009) — the in-session results screen is the only stats surface; per-note review and cross-session trends are out of scope.
- **No new migration / RPC** — the F-01 schema is sufficient; persistence is two plain inserts.
- **No server-side re-scoring** — per the decision, the server trusts the client's `is_correct` (it still validates structure). Accepted tradeoff: a client bug/tamper could write a wrong verdict; acceptable at single-user MVP scale.
- **No test runner** — pure core kept test-ready; manual verification only (matches staff-renderer precedent and the module's lesson boundary).
- **No mid-session resume / pause** — an abandoned session saves nothing.
- **No orphan cleanup** — the save is two non-transactional upserts (session first, FK-ordered), and `sessions` has no UPDATE/DELETE policy. If the session insert succeeds but the answers insert fails and the user never retries, the result is an uncleanable orphan: a `finished_at` row with zero (or short) answers. Accepted at single-user MVP scale; the "Retry save" UX shrinks the window. **Downstream consumers that read finished sessions — notably S-03 (adaptive) — must tolerate finished sessions with missing/short answer sets rather than assuming `answers.count == exercise_count`.**

## Implementation Approach

A single client island (`DrillSession`) owns a three-state machine — `setup → active → finished`. All musical/domain logic (pitch→letter, random selection, scoring, stats) lives in a pure sibling module `exercises.ts`, mirroring the staff-renderer's pure-core split so the accuracy-critical pieces are isolated and reviewable. Exercise generation, scoring, and feedback are 100% client-side, so feedback is instant (well under the 200 ms NFR — no network in the answer loop). Persistence is a single batch `POST /api/sessions` at session end (create session + bulk-insert answers), keeping a completed session to ~2 DB writes. The build proceeds bottom-up: pure core (P1) → playable UI with no persistence (P2) → the write-path + save UX (P3), so each phase is an independently demoable increment.

## Critical Implementation Details

- **`B4` → `H`, everything else → first letter.** `pitchToLetter` is the lone musical-domain mapping S-01 owns; the staff renderer never emits letters. A wrong mapping here is the equivalent of a wrong note position — treat it as accuracy-critical and verify all 13 pitches map to the right one of the 7 buttons.
- **Idempotent save is required because retries are part of the design.** The "show stats now, retry save in background" decision means the same payload can be POSTed more than once. `sessions` has no DELETE policy and `answers` is insert-only, so a partial/duplicate write cannot be cleaned up server-side. Therefore the **client generates the session UUID and each answer UUID up front**, and the server inserts with `upsert(..., { onConflict: 'id', ignoreDuplicates: true })` — a retry re-sending the same ids is a no-op, never a duplicate. (RLS `WITH CHECK (user_id = auth.uid())` still applies on insert.)
- **Feedback never touches the network.** Correct/incorrect is computed in the island from the already-known pitch; the answer→feedback transition is pure local state, trivially meeting the 200 ms NFR. The only network call is the end-of-session batch save.

## Phase 1: Drill domain core (pure)

### Overview

Create the render-free, network-free core that holds every musical/domain decision the drill makes: the answer-letter alphabet and the `B4`→`H` mapping, random exercise selection (no immediate repeats), and session-stats computation. Isolated and unit-test-ready, exactly like staff-renderer's `pitch.ts`.

### Changes Required:

#### 1. Drill domain module

**File**: `src/components/drill/exercises.ts`

**Intent**: Hold the pure drill logic — the 7-letter answer set, the pitch→letter mapping (including `B4`→`H`), random next-pitch selection avoiding back-to-back repeats, and a stats summarizer — decoupled from React/DOM so it is auditable and unit-testable later.

**Contract**: Exports:
- `type Letter` — `'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'H'`.
- `const LETTERS: readonly Letter[]` — the 7 answer letters in button order `['C','D','E','F','G','A','H']` (FR-004 display order).
- `const EXERCISE_TYPE_NOTE_TO_LETTER = 'note_to_letter'` — matches the `answers.exercise_type` CHECK value, so the DB write and the UI share one constant.
- `function pitchToLetter(pitch: Pitch): Letter` — pure; first character of the pitch, except `B`→`'H'`. Implement so all 13 pitches resolve to exactly one `Letter` (auditable, not stringly-clever).
- `function nextPitch(previous: Pitch | null, rng?: () => number): Pitch` — pure given `rng` (defaults to `Math.random`); returns a uniformly random pitch from `PITCHES` excluding `previous` (when non-null), so no two consecutive exercises repeat the same note. `rng` is injectable for deterministic tests.
- `function summarize(answers: readonly { isCorrect: boolean }[]): { correct: number; incorrect: number; total: number; accuracyPct: number }` — pure; `accuracyPct` rounded to an integer, `0` when `total` is `0`.
- An in-memory `AnswerRecord` type (e.g. `{ note: Pitch; chosenLetter: Letter; isCorrect: boolean; exerciseType: typeof EXERCISE_TYPE_NOTE_TO_LETTER }`) shared by the island (P2) and the save payload (P3).

Imports `Pitch`/`PITCHES` from `@/components/staff/pitch` (reuse, do not redefine the pitch set).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- All 13 pitches map to the correct button letter via `pitchToLetter`, in particular `B4`→`H` and both `C4`/`C5`→`C`.
- `nextPitch` never returns the `previous` pitch across repeated calls, and returns only members of `PITCHES`.
- `summarize` returns correct counts and an integer `accuracyPct` (and `0` for an empty set).

**Implementation Note**: After this phase and automated verification passes, pause for human confirmation of the pitch→letter mapping before proceeding. Phase blocks use plain bullets; the `## Progress` section owns the checkboxes.

---

## Phase 2: Drill page + playable loop (no persistence)

### Overview

Build the full, playable drill UI as a single client island plus its page and entry point — setup, the active note→letter loop with locked/colored feedback and tap-to-continue, and a results screen with counts + accuracy %. No DB writes yet; the session runs entirely in client state so the loop and feedback can be verified in isolation.

### Changes Required:

#### 1. Protect the drill route

**File**: `src/middleware.ts`

**Intent**: Require auth for `/drill` so only logged-in users reach the drill.

**Contract**: Add `"/drill"` to the `PROTECTED_ROUTES` array. No other change.

#### 2. Drill page

**File**: `src/pages/drill.astro`

**Intent**: Host the drill island on a protected route, in the house page style.

**Contract**: An Astro page using `Layout`, mounting `<DrillSession client:load />` as the sole interactive surface. Follows the existing page pattern ([signin.astro](src/pages/auth/signin.astro)).

#### 3. Dashboard entry point

**File**: `src/pages/dashboard.astro`

**Intent**: Give the parent a clear way into the drill from the authenticated landing page.

**Contract**: Add a prominent "Start practising" link/button to `/drill` in the existing dashboard card. Styling consistent with the current dashboard buttons.

#### 4. Per-exercise view

**File**: `src/components/drill/NoteToLetterExercise.tsx`

**Intent**: Render one note→letter exercise — the staff note and the 7 answer buttons — with locked, color-coded feedback after answering and a tap-to-continue control.

**Contract**: Props: `{ pitch: Pitch; answered: boolean; chosenLetter: Letter | null; onAnswer: (letter: Letter) => void; onNext: () => void; progress: { index: number; total: number } }`. Renders `<Staff note={pitch} />` and a button per `LETTERS` entry. Before answering, buttons are active. After `onAnswer`, all buttons lock; the correct letter (`pitchToLetter(pitch)`) shows green, the chosen-wrong button shows red, a ✓/✗ cue appears, and a "Next" control (large, child-sized per the NFR) calls `onNext`. Buttons sized/spaced for a young child's motor skills. Default export, declarative (house style).

#### 5. Results view

**File**: `src/components/drill/SessionResults.tsx`

**Intent**: Show end-of-session stats and the two exit actions.

**Contract**: Props: `{ correct: number; incorrect: number; accuracyPct: number; onAgain: () => void; onDone: () => void }` (a `saveState` prop is added in P3 — keep the component open to it). Renders correct/incorrect counts and accuracy %, with the per-type line labeled as note→letter so S-02 can add a second line later. "Practice again" calls `onAgain` (back to setup); "Done" calls `onDone` (navigates to `/dashboard`). Default export.

#### 6. Drill session orchestrator

**File**: `src/components/drill/DrillSession.tsx`

**Intent**: Own the `setup → active → finished` state machine and drive the exercise loop entirely in client state.

**Contract**: Default-export island, declarative `useState` (no refs/effects beyond what React Compiler allows). State covers phase, chosen `exercise_count`, the running `AnswerRecord[]`, the current pitch, and the previous pitch (for `nextPitch`). Setup renders count buttons 5 / 10 / 20 (FR-002); starting captures `startedAt` and the first pitch and enters `active`. Each answer appends an `AnswerRecord` (`isCorrect = chosenLetter === pitchToLetter(pitch)`), shows feedback via `NoteToLetterExercise`, and "Next" generates the next pitch via `nextPitch(previous)` until `exercise_count` is reached, then enters `finished` (FR-007 auto-finish). Finished renders `SessionResults` with `summarize(answers)`. "Practice again" resets to setup; "Done" → `/dashboard`. No persistence in this phase.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint` (including `react-compiler/react-compiler`)
- Build passes: `npm run build`

#### Manual Verification:

- `npm run dev`: `/drill` redirects to `/auth/signin` when logged out; loads when logged in; the dashboard "Start practising" CTA reaches it.
- Picking 5 starts a 5-exercise session; each exercise shows a note on the staff with 7 letter buttons.
- Answering locks the buttons, greens the correct letter, reds a wrong pick, shows the ✓/✗ cue; "Next" advances; no two consecutive exercises show the same note.
- `B4` is scored correct only when "H" is tapped; the correct-answer highlight lands on "H".
- After the 5th answer the session auto-finishes and shows correct/incorrect counts + accuracy %; "Practice again" restarts setup; "Done" goes to `/dashboard`.
- Buttons are comfortably tappable on a phone-width viewport (NFR: child motor skills).

**Implementation Note**: After this phase and automated verification passes, pause for human confirmation that the drill loop and feedback play correctly before proceeding to persistence.

---

## Phase 3: Session persistence + save UX

### Overview

Add the write-path: a `POST /api/sessions` route that creates the session and bulk-inserts answers idempotently, a client save helper, and the save wiring in `DrillSession` — show stats immediately, save in the background, and surface a recoverable error if the save fails.

### Changes Required:

#### 1. Session save API route

**File**: `src/pages/api/sessions.ts`

**Intent**: Persist a completed session and its answers in one request, scoped to the authenticated user, idempotent under retry.

**Contract**: `POST` handler (server-rendered, like the auth routes). Request JSON body:
`{ id: string; exercise_count: 5 | 10 | 20; started_at: string; answers: { id: string; exercise_type: 'note_to_letter'; note: Pitch; is_correct: boolean }[] }` (ids are client-generated UUIDs).

Behavior:
1. `createClient(...)`; if `null` → `503` JSON.
2. Resolve the user via `supabase.auth.getUser()`; if none → `401` JSON (self-guarded; not via `PROTECTED_ROUTES`).
3. Validate structure → `400` on failure: `exercise_count` ∈ {5,10,20}; `answers` is an array of length `=== exercise_count`; every `note` ∈ `PITCHES` (imported from `@/components/staff/pitch`); every `exercise_type === 'note_to_letter'`; every `is_correct` boolean. The server trusts the `is_correct` value (per decision) but still requires it be a boolean.
4. Insert the session: `{ id, user_id, exercise_count, started_at, finished_at: new Date().toISOString() }` via `upsert(..., { onConflict: 'id', ignoreDuplicates: true })`.
5. Bulk-insert answers: map each to `{ id, session_id: id, user_id, exercise_type, note, is_correct }` via one `upsert(..., { onConflict: 'id', ignoreDuplicates: true })` call (single subrequest).
6. On success → `200` JSON `{ ok: true }`; on a DB error → `500` JSON so the client can retry.

RLS `WITH CHECK (user_id = auth.uid())` enforces ownership on both inserts. The two upserts + ignore-duplicates make a retried identical payload a no-op (see Critical Implementation Details).

#### 2. Client save helper

**File**: `src/components/drill/saveSession.ts`

**Intent**: Build the save payload (generating the session and answer UUIDs) and POST it, throwing on a non-OK response so the caller can drive retry state.

**Contract**: Exports `async function saveSession(input: { sessionId: string; answerIds: readonly string[]; exerciseCount: 5 | 10 | 20; startedAt: string; answers: readonly AnswerRecord[] }): Promise<void>`. The session and answer UUIDs are **passed in** (generated once by the orchestrator — see §3 and the stable-id note), **not** generated inside `saveSession`; calling it twice with the same input is therefore a true no-op retry. Maps `answerIds` + `AnswerRecord`s to the API shape, `fetch`es `POST /api/sessions`, and throws on `!res.ok`.

> Stable-id note: the session id and answer ids are generated **once, inside the event handler (or guarded phase-keyed effect) that transitions the machine into `finished`** — never in render. Calling `crypto.randomUUID()` in render both regenerates a fresh id every render (defeating the idempotency the whole save design rests on) *and* is an impure-render violation the enforced `react-compiler/react-compiler` rule rejects. The ids are stored in island `useState` and reused on every save attempt; `saveSession` receives them as input rather than generating them.

#### 3. Wire save + status into the orchestrator and results

**File**: `src/components/drill/DrillSession.tsx`, `src/components/drill/SessionResults.tsx`

**Intent**: On finish, show stats immediately and save in the background; reflect save status and allow manual retry without blocking the child.

**Contract**: In the same event handler (or guarded phase-keyed effect) that transitions the machine into `finished` — **never in render** — `DrillSession` generates the stable session id and one id per answer via `crypto.randomUUID()`, stores them in `useState`, sets `saveState: 'saving'`, and calls `saveSession` with those ids; on success → `'saved'`, on throw → `'error'`. The same stored ids are reused for every "Retry save", so retries stay idempotent. `SessionResults` gains a `saveState: 'saving' | 'saved' | 'error'` prop and an `onRetrySave` callback: a quiet indicator while saving/saved, and on `'error'` a clear non-blocking message + "Retry save" button that re-invokes the save with the same payload/ids. Stats are visible regardless of `saveState` (results never block on the network).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Completing a session writes exactly one `sessions` row (`exercise_count`, `started_at`, `finished_at` set) and `exercise_count` `answers` rows in Supabase Studio, all scoped to the logged-in user; `is_correct`/`note` match what was played.
- A second account cannot see the first account's rows (RLS holds).
- Simulating a failed save (e.g. stop Supabase / offline) still shows the stats, surfaces the error + "Retry save"; restoring connectivity and tapping retry persists the session with **no duplicate** rows.
- An unauthenticated `POST /api/sessions` returns `401`; a malformed payload (wrong length, bad note) returns `400`.

**Implementation Note**: After this phase and automated verification passes, pause for human confirmation that persistence, RLS scoping, and the save-failure/retry path all behave correctly. This completes the slice.

---

## Testing Strategy

### Unit Tests:

- **Deferred by decision** (no runner installed; module lesson boundary). `exercises.ts` is written as pure, exported, `rng`-injectable functions so a later Vitest suite can assert `pitchToLetter` (all 13 pitches, esp. `B4`→`H`), `nextPitch` (never repeats `previous`), and `summarize` without a DOM. This is the natural first test target when the project adopts a runner.

### Integration Tests:

- Manual end-to-end only this slice: play a session, confirm persisted rows and RLS scoping in Supabase Studio.

### Manual Testing Steps:

1. `npm run dev`, log in, open `/dashboard`, tap "Start practising" → `/drill`.
2. Pick 5; play through, deliberately answering one wrong and `B4` correct (tap "H"); confirm feedback colors, ✓/✗ cue, tap-to-continue, and no back-to-back repeats.
3. At finish, confirm counts + accuracy %; tap "Practice again" then "Done".
4. In Supabase Studio confirm one `sessions` row + 5 `answers` rows scoped to your user, with correct `note`/`is_correct`.
5. Stop the local Supabase (or go offline) and complete a session; confirm stats still show, an error + "Retry save" appears; restore and retry; confirm a single (non-duplicated) session persists.
6. `curl` `POST /api/sessions` unauthenticated → `401`; with a bad payload → `400`.

## Performance Considerations

- Feedback is pure client state — no network in the answer loop — so the 200 ms NFR is met trivially.
- A completed session is ~2 DB writes (session upsert + answers upsert) in one API invocation, well under Cloudflare's 50-subrequest free-tier limit.
- The drill island ships only the small drill + reused `Staff` SVG; no notation library, no new dependency.

## Migration Notes

None — no schema, dependency, or config changes. The F-01 migration already provides everything the write-path needs; the idempotent insert relies only on the existing primary keys.

## References

- Roadmap S-01: [`context/foundation/roadmap.md:103-113`](context/foundation/roadmap.md)
- PRD user story + FRs: [`context/foundation/prd.md`](context/foundation/prd.md) (US-01, FR-002/004/006/007/008)
- F-01 schema: [`context/changes/session-data-schema/plan.md`](context/changes/session-data-schema/plan.md), [`src/db/database.types.ts`](src/db/database.types.ts)
- F-02 renderer: [`context/changes/staff-renderer/plan.md`](context/changes/staff-renderer/plan.md), [`src/components/staff/Staff.tsx`](src/components/staff/Staff.tsx), [`src/components/staff/pitch.ts`](src/components/staff/pitch.ts)
- House patterns: [`src/pages/auth/signin.astro`](src/pages/auth/signin.astro), [`src/pages/api/auth/signin.ts`](src/pages/api/auth/signin.ts), [`src/components/auth/SignInForm.tsx`](src/components/auth/SignInForm.tsx), [`src/middleware.ts`](src/middleware.ts)
- Infra constraint (subrequest limit): [`context/foundation/infrastructure.md:67`](context/foundation/infrastructure.md)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Drill domain core (pure)

#### Automated

- [x] 1.1 Type checking passes: `npx astro check` — ad889fa
- [x] 1.2 Linting passes: `npm run lint` — ad889fa

#### Manual

- [x] 1.3 All 13 pitches map to the correct button letter (esp. B4→H, C4/C5→C) — ad889fa
- [x] 1.4 `nextPitch` never returns `previous` and returns only members of `PITCHES` — ad889fa
- [x] 1.5 `summarize` returns correct counts and integer `accuracyPct` (0 for empty) — ad889fa

### Phase 2: Drill page + playable loop (no persistence)

#### Automated

- [x] 2.1 Type checking passes: `npx astro check`
- [x] 2.2 Linting passes: `npm run lint` (react-compiler clean)
- [x] 2.3 Build passes: `npm run build`

#### Manual

- [x] 2.4 `/drill` redirects when logged out, loads when logged in; dashboard CTA reaches it
- [x] 2.5 Picking 5 runs a 5-exercise loop; each shows a staff note + 7 letter buttons
- [x] 2.6 Answering locks/colors buttons, shows ✓/✗ cue; "Next" advances; no back-to-back repeats
- [x] 2.7 `B4` scored correct only on "H"; correct-answer highlight lands on "H"
- [x] 2.8 Auto-finish shows counts + accuracy %; "Practice again" resets; "Done" → `/dashboard`
- [x] 2.9 Buttons comfortably tappable at phone width (child motor-skill NFR)

### Phase 3: Session persistence + save UX

#### Automated

- [ ] 3.1 Type checking passes: `npx astro check`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Build passes: `npm run build`

#### Manual

- [ ] 3.4 Completing a session writes 1 `sessions` row + N `answers` rows scoped to the user, values matching play
- [ ] 3.5 A second account cannot see the first account's rows (RLS holds)
- [ ] 3.6 Failed save still shows stats + error + "Retry save"; retry persists with no duplicate rows
- [ ] 3.7 Unauthenticated POST → 401; malformed payload → 400
