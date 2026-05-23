---
project: "Nuteczki"
version: 1
status: draft
created: 2026-05-18
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

Children learning music lack a simple, focused tool for practising note reading and note durations. Existing apps target older students, pack too many features, or skip the specific drills a beginner needs. Parents currently hand-draw notes on paper — slow to prepare and not engaging enough to keep a child motivated across sessions.

The insight: the gap isn't another full music education app — it's a dead-simple flashcard-style drill tool with immediate visual feedback, covering exactly three exercise types and nothing more.

## User & Persona

### Primary persona: the child

A young music student (beginner level) who practises note reading at home between lessons. Reaches for the app when it's practice time. Success = they enjoy the drills and measurably improve session over session.

### Secondary persona: the parent

Prepares/initiates practice, checks session history to see progress. Not the primary user of the drill interface.

## Success Criteria

### Primary
- The child completes a drill session using both exercise types (note→letter and letter→note) with immediate visual feedback after each answer, and the parent can see the session results afterward.

### Secondary
- The child's accuracy improves across sessions, visible in the session history.

### Guardrails
- Notes must display correctly on the staff — musical accuracy is non-negotiable. A wrong note position teaches the child incorrect information.

## User Stories

### US-01: Child completes a drill session

- **Given** a logged-in parent on the session start screen
- **When** the parent sets the exercise count and taps "Start session"
- **Then** the child sees exercises one by one (randomly selected from 2 types, weighted toward recent mistakes), gets visual feedback after each answer, and after the last exercise the session ends and stats are displayed

#### Acceptance Criteria
- Exercises are drawn from both types (note→letter and letter→note)
- Selection is weighted toward notes the child has previously answered incorrectly
- Each answer shows immediate visual feedback before the next exercise appears
- After the final exercise, the session ends and stats are displayed

### US-02: Parent views session history

- **Given** a parent who has completed at least one session
- **When** they navigate to the session history screen
- **Then** they see a list of all past sessions with date, correct/incorrect counts per exercise type

#### Acceptance Criteria
- Sessions are listed in reverse chronological order
- Each session entry shows date, total correct/incorrect, and breakdown by exercise type
- History persists across logins

## Functional Requirements

### Authentication
- FR-001: Parent can sign up and log in via email + password or OAuth. Priority: must-have
  > Socrates: Counter-argument considered: "Login adds friction — a child app should be instant-on." Resolution: kept; login is necessary for data persistence and cross-session history.

### Session management
- FR-002: Parent can start a new drill session by picking a preset exercise count (e.g. 5 / 10 / 20). Priority: must-have
  > Socrates: Counter-argument considered: "A fixed count would be simpler — one less decision for the parent." Resolution: revised from free number to preset options — quick pick, simple to build, still flexible.

- FR-003: App generates exercises for the session using a simple algorithm that prioritizes notes the child got wrong most often in recent sessions. Priority: must-have
  > Socrates: Counter-argument considered: "Premature — random selection is simpler and good enough for v1." Resolution: kept; adaptive selection is the core domain rule that makes this better than paper flashcards.

- FR-007: Session auto-finishes after the last exercise and immediately shows stats. Priority: must-have
  > Socrates: Counter-argument considered: "Session should auto-finish after the last exercise — manual finish is redundant with preset count." Resolution: revised from manual parent finish to auto-finish.

### Exercises
- FR-004: Child can see a note displayed on the staff and pick the correct letter name (C, D, E, F, G, A, H) from answer buttons. Priority: must-have
  > Socrates: Counter-argument considered: "7 answer buttons is too many for a young child." Resolution: kept; 7 buttons match the 7 note names the child is learning. The range is intentionally limited.

- FR-005: Child can see a letter name and pick the correct note on the staff from 3 visual options. Priority: must-have
  > Socrates: Counter-argument considered: "3 options may be too easy — random guessing gives 33%." Resolution: kept; 3 options is age-appropriate. Visual recognition is a distinct skill from letter recall.

- FR-006: Child can see immediate visual feedback after each answer, showing whether the answer was correct or incorrect and indicating the correct answer. Priority: must-have
  > Socrates: Counter-argument considered: "Showing the correct answer on wrong tries could teach guessing." Resolution: kept; immediate feedback is essential for learning and reinforces the correct association.

### Progress tracking
- FR-008: Parent can see current session statistics showing correct and incorrect answers broken down by exercise type. Priority: must-have
  > Socrates: Counter-argument considered: "Per-type breakdown is unnecessary with only 2 types." Resolution: kept; per-type breakdown shows whether the child is stronger at visual→letter or letter→visual.

- FR-009: Parent can see the history of all past sessions with statistics and a simple progress indicator (e.g. accuracy percentage per session). Priority: must-have
  > Socrates: Counter-argument considered: "History without trends/charts is just a list of numbers." Resolution: revised to include a simple progress indicator so the parent can see improvement at a glance.

## Non-Functional Requirements

- A child sees acknowledgement of any answer within 200 ms — feedback must feel instant with no perceptible delay.
- The product is usable on iPhone and iPad via Safari as a PWA.
- Interactive elements are sized and spaced for a young child's motor skills — a child can navigate exercises without adult assistance.
- Completed session data persists reliably across app restarts and logins — no silent data loss.

## Business Logic

The app selects exercises by weighting notes the child has answered incorrectly most often in recent sessions, so each drill targets the child's weakest spots.

The algorithm consumes the child's answer history from the last 3–5 sessions — which notes were answered correctly and incorrectly, by exercise type. It produces a weighted exercise set for the new session: approximately 70% of exercises target frequently-missed notes, and 30% are randomly selected for variety and motivation.

The child does not see the algorithm. They experience a drill session where exercises feel relevant rather than random. Over time, the parent observes in the session history that accuracy improves as weak spots are progressively drilled.

## Access Control

Simple login (email + password or OAuth). Single shared account — parent and child use the same login. No role separation for MVP. The child does drills, the parent views session history, all from the same account on the same device.

## Non-Goals

- No note duration exercises in v1 — scoped out to keep MVP focused on pitch recognition. Adding in v2.
- No multi-note display (chords, intervals) — only single notes on the staff at a time.
- No notes outside the ledger-line range (first lower to first upper ledger line) — beginner scope only.
- No native mobile app — PWA only for MVP.

## Open Questions

None. All sections fully populated from shape-notes.md (quality cross-check: accepted, no gaps).
