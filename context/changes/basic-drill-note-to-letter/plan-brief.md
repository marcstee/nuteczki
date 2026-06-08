# Basic Drill: Note-to-Letter Exercises — Plan Brief

> Full plan: `context/changes/basic-drill-note-to-letter/plan.md`

## What & Why

Deliver roadmap **S-01**, the north star: wire the two finished foundations (F-01 Supabase schema, F-02 staff renderer) into a working note→letter drill. This is the smallest end-to-end slice that proves the core hypothesis — child sees a note, picks a letter, gets feedback, the session finishes with stats — and getting it in front of the child is the fastest path to market feedback.

## Starting Point

Both prerequisites are implemented and `impl_reviewed`. The `sessions`/`answers` tables (RLS-scoped to `auth.uid()`, answers insert-only, sessions non-deletable) and a typed Supabase client exist. The `Staff` React component renders any beginner-range pitch (C4→A5) correctly and is ready to embed. Auth, protected-route middleware, and the island→API-route→server-client pattern are all in place. No drill UI, no domain-specific API route, and no test runner exist yet.

## Desired End State

A logged-in user taps "Start practising" on `/dashboard`, lands on a protected `/drill` page, picks a count (5/10/20), and plays a drill: each exercise shows a note on the staff with 7 letter buttons (`C D E F G A H`); answering locks the buttons, colors correct/wrong, shows a ✓/✗ cue, and "Next" advances; after the last exercise the session auto-finishes with correct/incorrect counts + accuracy %. The session and answers persist to Supabase in one batch; if the save fails, stats still show and a "Retry save" affordance recovers it.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Persistence granularity | Batch at session end (1 session + bulk answers) | Simplest, ~2 DB writes under Cloudflare's subrequest cap; adaptive view only reads finished sessions | Plan |
| Save-failure UX | Show stats now, retry save in background | Child never blocks on the network; honors "no silent data loss" by making failure visible + recoverable | Plan |
| Feedback & advance | Lock + color + ✓/✗ icon, then tap "Next" | Explicit pacing a young child controls; feedback is instant client-side (<200 ms NFR) | Plan |
| Wrong-answer flow | Single attempt — reveal correct, move on | Matches FR-006 and the one-answer-per-exercise data model; clean stats | Plan |
| Entry + navigation | Dashboard CTA → `/drill`; results offer Again/Done | Reuses the authenticated landing page; minimal new surface | Plan |
| Exercise selection | Random, no back-to-back duplicates | Repeats are unavoidable over 13 notes; blocking consecutive dupes avoids feeling broken | Plan |
| Results scope | Correct/incorrect counts + accuracy % | Satisfies FR-008 and gives an at-a-glance win; per-note review is S-04 | Plan |
| Scoring trust | Server trusts client's `is_correct` (validates structure) | Smaller payload, no server scoring; accepted tradeoff at single-user MVP scale | Plan |

## Scope

**In scope:** note→letter exercises only; random selection (no immediate repeats); preset count 5/10/20; instant client-side feedback; auto-finish with counts + accuracy %; batch persistence with idempotent retry; `/drill` page + dashboard CTA; `B4`→`H` labeling.

**Out of scope:** letter-to-note (S-02), adaptive weighting (S-03), session history (S-04), server re-scoring, new migration/RPC, test runner, mid-session resume.

## Architecture / Approach

One client island (`DrillSession`) runs a `setup → active → finished` state machine. All musical/domain logic (pitch→letter incl. `B4`→`H`, random selection, scoring, stats) lives in a pure sibling module `exercises.ts` — mirroring the staff-renderer's pure-core split — so the accuracy-critical pieces are isolated and unit-test-ready. Exercise generation, scoring, and feedback are entirely client-side (no network in the answer loop). The only network call is a single batch `POST /api/sessions` at the end; idempotency comes from client-generated UUIDs + server `upsert … ignoreDuplicates`, which matters because retries are part of the save UX and the schema forbids deleting partial writes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Drill domain core (pure) | `exercises.ts`: `pitchToLetter` (B4→H), `nextPitch`, `summarize` | A wrong letter mapping is a wrong answer — accuracy-critical |
| 2. Drill page + playable loop | `/drill` + dashboard CTA + island/exercise/results UI; no DB | React Compiler constraints; child-sized tap targets |
| 3. Persistence + save UX | `POST /api/sessions`, client save, background retry + error UX | RLS-scoped inserts; idempotent retry without duplicates |

**Prerequisites:** F-01 (session-data-schema) and F-02 (staff-renderer) — both done and `impl_reviewed`; local Supabase running for Phase 3 verification.
**Estimated effort:** ~2–3 sessions across the 3 phases.

## Open Risks & Assumptions

- Trusting the client's `is_correct` means a client bug/tamper could write a wrong verdict — accepted at single-user MVP scale; S-03's adaptive weighting reads this data, so revisit if it grows untrustworthy.
- Idempotent retry depends on the session/answer UUIDs being generated **once at finish** and reused across attempts; regenerating per attempt would defeat it.
- An abandoned mid-session saves nothing (no resume) — acceptable; the no-silent-loss guarantee is about completed sessions.

## Success Criteria (Summary)

- A logged-in user plays a full note→letter session from the dashboard, with musically correct notes, correct letter scoring (incl. `B4`→`H`), instant feedback, and auto-finish stats (counts + accuracy %).
- The completed session + answers persist to Supabase, scoped to the user by RLS, with no duplicate rows on retry.
- A save failure still shows stats and recovers via "Retry save".
