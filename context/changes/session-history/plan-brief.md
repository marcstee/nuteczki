# Session History View — Plan Brief

> Full plan: `context/changes/session-history/plan.md`

## What & Why

Parents need to see how their child is progressing across drill sessions (US-02 / FR-009). This adds a protected `/history` page listing every finished session — date, correct/incorrect by exercise type, and an accuracy % with a subtle progress bar — so improvement is visible at a glance. It's a read-only view over data the drill already persists.

## Starting Point

The persistence layer (F-01) and the drill (S-01/S-02/S-03) are done. `sessions` + `answers` tables exist, RLS-scoped to the user, with an index (`user_id, started_at desc`) already tuned for reverse-chronological listing. `drill.astro` establishes the SSR-fetch-in-frontmatter pattern, and `summarize()` is a pure helper that already computes per-type stats inside the drill. Nothing renders this data for the parent yet.

## Desired End State

A signed-in parent opens `/history` and sees their finished sessions newest-first, each as a glass card with per-type stat blocks and an accuracy bar. A parent with no sessions sees a friendly empty state linking to the drill. The view is reachable from the dashboard and ships zero client JavaScript.

## Key Decisions Made

| Decision                    | Choice                                  | Why (1 sentence)                                                                 | Source |
| --------------------------- | --------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| Aggregation strategy        | Nested select + TS, reuse `summarize()` | No migration; reuses the existing pure helper; fine at this small data scale.     | Plan   |
| Page structure              | Pure Astro, inline markup               | Matches the "Astro for static, React for islands" convention; ships no JS.        | Plan   |
| Progress indicator          | Accuracy % + subtle fill bar            | "Improvement at a glance" per FR-009, while staying a per-row indicator (no chart).| Plan   |
| Empty / unfinished handling | Empty-state CTA + finished-only list    | Graceful first-run UX; mirrors the `finished_at is not null` filter used elsewhere.| Plan   |
| Copy language               | English                                 | Consistent with every current screen; the Polish redesign is the separate S-05.   | Plan   |

## Scope

**In scope:** `/history` route (protected); SSR fetch of finished sessions + embedded answers; pure per-session aggregation helper; list rendering with per-type stat blocks + accuracy bar; empty state; dashboard entry link + back link.

**Out of scope:** schema/migration changes; charts or session-over-session trends; per-note breakdown or drill-down; pagination/sort/filter; edit/delete; Polish copy (S-05); any React island.

## Architecture / Approach

Mirror `drill.astro`: the `history.astro` frontmatter creates the cookie-authed Supabase client (null-guarded), runs one embedded select (`sessions(...).answers(exercise_type, is_correct)`, `finished_at` not null, ordered `started_at desc`), and passes the rows through a new pure `summarizeSessions()` helper (in `src/components/history/`) that reuses `summarize()`. The template maps the resulting view-models to glass cards, or renders the empty state. `/history` is added to `PROTECTED_ROUTES`; on any client/query error the page degrades to the empty state.

## Phases at a Glance

| Phase                  | What it delivers                                              | Key risk                                                              |
| ---------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| 1. History page & data | Protected `/history` page: fetch, aggregate, list, empty state | Embedded-select shape / date formatting details; low overall risk     |
| 2. Navigation wiring   | Dashboard link in, back link out                             | Trivial — link placement/styling only                                |

**Prerequisites:** S-01 done (there must be persisted sessions to list). No new access or infra.
**Estimated effort:** ~1 session across the two phases.

## Open Risks & Assumptions

- Assumes `saveSession` always sets `finished_at`, so the finished-only filter never hides legitimate completed sessions (true in the current save flow).
- No test runner exists, so `summarizeSessions` correctness rests on `astro check` + manual verification until a runner is added.

## Success Criteria (Summary)

- A parent with ≥1 session sees them newest-first with accurate per-type counts and accuracy %.
- A parent with no sessions sees a guiding empty state, not a blank screen.
- History is reachable from the dashboard and respects auth (signed-out → sign-in redirect).
