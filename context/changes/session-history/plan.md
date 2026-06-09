# Session History View Implementation Plan

## Overview

Add a protected, static `/history` page (S-04) that lets the parent review every finished drill session in reverse-chronological order. Each row shows the session date, correct/incorrect counts broken down by exercise type, and an accuracy percentage with a subtle progress bar. A first-run empty state guides parents who have no sessions yet, and a dashboard link makes the view discoverable. This is a read-only view over the persistence layer that F-01/S-01 already shipped — no schema changes.

Satisfies **US-02** and **FR-009**.

## Current State Analysis

The data and the read pattern this slice needs already exist:

- **Schema (F-01, done)** — `sessions(id, user_id, exercise_count, started_at, finished_at, created_at)` and `answers(id, session_id, user_id, exercise_type, note, is_correct, answered_at)` in `supabase/migrations/20260528214850_create_session_tables.sql`. RLS scopes every row to `auth.uid()` (`sessions_select_own`, `answers_select_own`). Index `sessions_user_id_started_at_idx` on `(user_id, started_at desc)` is purpose-built for reverse-chronological listing; `answers_session_id_idx` backs the embedded join. The `answers_session_id_fkey` relationship lets PostgREST embed `answers` under `sessions`.
- **SSR fetch pattern (established)** — `src/pages/drill.astro:27` fetches server-side in the page frontmatter via `createClient(Astro.request.headers, Astro.cookies)`, null-guards the client, and on any query error falls back gracefully. Session history is the same shape: SSR fetch → aggregate → render.
- **Stats helper (reusable)** — `summarize()` in `src/components/drill/exercises.ts:131` is a pure function returning `{ correct, incorrect, total, accuracyPct }`. `DrillSession.tsx:187` already derives per-type breakdowns with `summarize(answers.filter(byType))` — the exact aggregation this page repeats per session.
- **Exercise-type constants** — `EXERCISE_TYPE_NOTE_TO_LETTER` / `EXERCISE_TYPE_LETTER_TO_NOTE` in `exercises.ts:27,34`, shared by UI and DB writes.
- **Auth plumbing** — `src/middleware.ts:4` guards routes via `PROTECTED_ROUTES` and sets `Astro.locals.user`. `/history` is not yet protected.
- **Visual language** — the "cosmic" dark theme: glass cards (`rounded-2xl border border-white/10 bg-white/5`), gradient headings (`from-blue-200 to-purple-200 bg-clip-text`), `text-green-400` / `text-red-400` counts. See `SessionResults.tsx` and `dashboard.astro`. Copy across all current screens is English.
- **No test runner** — there is no `test` script; `exercises.ts` is written pure "to be unit-tested later without a runner." Automated verification is `astro check` (types) + `eslint` + `astro build`.

## Desired End State

A signed-in parent can open `/history` (via a dashboard link or directly) and see a reverse-chronological list of their finished sessions. Each session card shows: the date, a Note→letter and a Letter→note stat block (correct/incorrect), and an accuracy % with a thin fill bar. A parent with no finished sessions sees a friendly empty state with a "Start practising" call to action. The page is RLS-scoped (a parent never sees another account's sessions) and ships zero client JavaScript.

Verify by: signing in as a user with ≥1 finished session and loading `/history` (list renders, newest first, counts match the data); signing in as a user with 0 sessions (empty state with CTA); attempting `/history` while signed out (redirect to `/auth/signin`).

### Key Discoveries:

- Reverse-chron listing is already indexed — `sessions_user_id_started_at_idx` (`supabase/migrations/20260528214850_create_session_tables.sql:23`).
- A single embedded select returns everything needed: `sessions(...).answers(exercise_type, is_correct)`. RLS on both tables applies independently, so the result is already user-scoped.
- `summarize()` (`exercises.ts:131`) is the per-type aggregation primitive — no new stats math required, just group answers by `exercise_type` and call it.
- Convention (`CLAUDE.md`): "Astro components for static content; React `.tsx` only for interactive islands." A history list is static → pure Astro page, no island.

## What We're NOT Doing

- **No schema/migration changes.** Aggregation happens in TS over a nested select; no new view or table.
- **No charts or session-over-session trends** — roadmap parked these; the progress indicator is a per-row accuracy % + bar only.
- **No per-note breakdown or per-session drill-down** — rows show per-*type* counts, not which individual notes were missed, and are not expandable.
- **No pagination, sorting, or filtering controls** — small data volume; render the full list.
- **No edit/delete of sessions.**
- **No Polish copy** — copy stays English to match every current screen; the Polish redesign is the separate S-05 slice.
- **No React island** — the page is static; no client JS is shipped.
- **No changes to the drill or its `SessionResults` component** — the stat-block visual is rendered inline in Astro, not extracted/shared.

## Implementation Approach

Mirror `drill.astro` exactly: fetch in the page frontmatter with the cookie-authed Supabase client (null-guarded, graceful fallback on error), then transform the raw rows through one small **pure** helper that produces an ordered array of per-session view-models (reusing `summarize()`). The `.astro` template maps that array to glass cards in the existing cosmic style, or renders the empty state when the array is empty. Add `/history` to `PROTECTED_ROUTES`, then wire the dashboard entry link and a back link.

Two phases: Phase 1 delivers the working page (verifiable by direct URL); Phase 2 makes it discoverable.

## Phase 1: History Page & Data

### Overview

Protect `/history`, fetch and aggregate the parent's finished sessions, and render the list (or empty state) as a static Astro page in the cosmic/glass style.

### Changes Required:

#### 1. Protect the route

**File**: `src/middleware.ts`

**Intent**: Ensure unauthenticated requests to `/history` redirect to sign-in, consistent with `/dashboard` and `/drill`.

**Contract**: Add `"/history"` to the `PROTECTED_ROUTES` array (`src/middleware.ts:4`). No other change.

#### 2. Pure per-session aggregation helper

**File**: `src/components/history/sessionSummary.ts` (new)

**Intent**: Turn the raw `sessions(...).answers(...)` query result into an ordered array of per-session view-models, so the `.astro` template stays declarative and the math is pure and unit-testable later (mirroring `exercises.ts`). Reuses `summarize()` for the counts.

**Contract**: Export a `SessionSummary` type and a pure `summarizeSessions(rows)` function.
- `SessionSummary = { id: string; startedAt: string; accuracyPct: number; byType: { noteToLetter: TypeStats; letterToNote: TypeStats } }` where `TypeStats = { correct: number; incorrect: number }` (define locally — do not import the unexported one from `SessionResults.tsx`).
- For each input row, compute two distinct things (matching the precedent at `DrillSession.tsx:187–191`):
  - `accuracyPct` = `summarize(allAnswers).accuracyPct` — the **whole-session** summary over **all** of the row's answers, **unfiltered**.
  - `byType.noteToLetter` / `byType.letterToNote` = `summarize(answers.filter(byType))` — **per-type** summaries over the answers filtered by `exercise_type` using `EXERCISE_TYPE_NOTE_TO_LETTER` / `EXERCISE_TYPE_LETTER_TO_NOTE` (imported from `@/components/drill/exercises`).
  - `summarize` takes `{ isCorrect: boolean }[]`, so map `is_correct → isCorrect` before calling it (in both the unfiltered and filtered cases).
- Input rows are assumed already ordered (the query orders them); the helper preserves input order and does not re-sort. Accept a minimal structural row shape (`id`, `started_at`, `answers: { exercise_type: string; is_correct: boolean }[]`) rather than importing generated DB types, so the helper is decoupled and testable.

#### 3. The history page

**File**: `src/pages/history.astro` (new)

**Intent**: SSR-fetch the current parent's finished sessions with their answers embedded, run them through `summarizeSessions`, and render either the session list or the empty-state CTA — in the existing cosmic/glass visual language, English copy.

**Contract**:
- Fetch: `supabase.from("sessions").select("id, started_at, answers(exercise_type, is_correct)").not("finished_at", "is", null).order("started_at", { ascending: false })`. Null-guard `createClient(...)` exactly like `drill.astro:27`. Distinguish three outcomes (the `{ data, error }` split is already in hand, as in `drill.astro:31`): a **null client or a query `error`** → render the **error state** (below); a **successful query returning zero rows** → render the **empty state**; otherwise → render the list. The empty state is reserved for a confirmed-empty result so a returning parent who has history is never shown the first-run "Start practising" CTA during a transient outage. Do not leave a `console.*` call in (the `no-console` lint warning; `drill.astro` swallows errors silently).
- Wrap content in `<Layout title="Session history">` with the `bg-cosmic` container, matching `dashboard.astro` / `drill.astro`.
- **List**: for each `SessionSummary`, a glass card showing: the formatted **date** of `startedAt` (date-only, no time-of-day), computed in the frontmatter via `new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Warsaw", dateStyle: "medium" }).format(new Date(startedAt))`. The explicit `timeZone` is required because the page renders per-request on a Cloudflare Worker (UTC system clock) with zero client JS, so a UTC-formatted date would show the wrong day near local midnight for the Polish target audience. Time-of-day is dropped (would need the visitor's tz, unavailable without client JS); if the audience later goes multi-timezone, revisit by moving formatting client-side. Then two inline per-type stat blocks ("Note → letter", "Letter → note") reusing the `SessionResults` StatBlock *look* (green `correct` / red `incorrect`) as plain Astro markup; and the accuracy indicator — the integer `accuracyPct` plus a thin horizontal fill bar whose width is `accuracyPct%`, derived purely from that row.
- **Empty state**: when the query **succeeds with zero rows**, a centered glass card with a short English message and an `<a href="/drill">` styled like the dashboard's primary "Start practising" button.
- **Error state**: when the client is null or the query returns an `error`, a centered glass card with a neutral English message (e.g. "Couldn't load your sessions right now") and **no** "Start practising" CTA — so a parent with existing history is never told they have none.
- Heading uses the gradient-text treatment used elsewhere.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Signed in as a user with ≥1 finished session, `/history` lists sessions newest-first; each row's per-type correct/incorrect counts and accuracy % match the underlying data.
- The accuracy bar width visually tracks the percentage (0% empty, 100% full).
- Signed in as a user with 0 finished sessions, the empty state with the "Start practising" CTA appears (and the CTA navigates to `/drill`).
- When the query fails (or the client is unconfigured), the neutral error card appears **without** the "Start practising" CTA — not the empty state.
- Signed out, navigating to `/history` redirects to `/auth/signin`.
- Layout matches the cosmic/glass style of the dashboard and drill screens on a phone-width viewport (iPhone/iPad Safari target).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation from the human that the manual testing was successful before proceeding to Phase 2.

---

## Phase 2: Navigation Wiring

### Overview

Make the history view reachable: a link into it from the dashboard, and a link back out to the dashboard from the history page.

### Changes Required:

#### 1. Dashboard entry link

**File**: `src/pages/dashboard.astro`

**Intent**: Give the parent a clear way to reach session history from the dashboard.

**Contract**: Add an `<a href="/history">` ("Session history" or similar) below the existing "Start practising" link, styled as a secondary action (the existing bordered/glass button style, distinct from the primary gradient CTA) so it reads as secondary to starting a drill.

#### 2. Back link on the history page

**File**: `src/pages/history.astro`

**Intent**: Let the parent return to the dashboard without the browser back button.

**Contract**: Add an `<a href="/dashboard">` (e.g. a "← Dashboard" link) on the history page, present in both the list and empty-state renderings.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- From the dashboard, the "Session history" link navigates to `/history`.
- From `/history`, the back link returns to `/dashboard` (in both the populated and empty states).
- The new dashboard link reads as secondary to the primary "Start practising" action.

**Implementation Note**: After automated verification passes, confirm the navigation round-trip manually.

---

## Testing Strategy

### Unit Tests:

No test runner is configured in this project (matching `exercises.ts`, which is written pure "to be unit-tested later without a runner"). `summarizeSessions` is therefore written as a pure, side-effect-free function so it can be unit-tested when a runner is introduced. Until then, its correctness is covered by `astro check` (types) and the manual verification below.

If/when a runner lands, the cases to cover: a session with mixed correct/incorrect across both types (counts + accuracy), a session with only one exercise type present, a zero-answer session (accuracy `0`), and input-order preservation.

### Integration Tests:

None automated (no runner). The end-to-end path is covered by manual verification.

### Manual Testing Steps:

1. Sign in as a user who has completed at least one drill session; open `/history`. Confirm sessions are newest-first and counts/accuracy match the data.
2. Cross-check one row against the database (or against the drill's end-of-session stats) to confirm per-type counts and accuracy are correct.
3. Sign in as (or create) a user with no finished sessions; open `/history`; confirm the empty state and that its CTA opens `/drill`.
4. Sign out; navigate to `/history`; confirm redirect to `/auth/signin`.
5. From the dashboard, follow the "Session history" link; from history, follow the back link; confirm both directions work.
6. View `/history` at iPhone/iPad widths; confirm the cards, stat blocks, and accuracy bar render cleanly.

## Performance Considerations

At the target scale (small user base, low QPS, few sessions per user with 5/20 answers each) the nested select + in-TS aggregation is comfortably within budget, and the `(user_id, started_at desc)` index serves the listing directly. If a single user ever accumulated thousands of sessions, the per-answer fetch + JS aggregation would be the first thing to revisit (move to a Postgres summary view) — out of scope now.

## Migration Notes

None. No schema changes; this is a read-only view over existing tables.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-04)
- PRD: `context/foundation/prd.md` (US-02, FR-009, FR-008)
- Schema: `supabase/migrations/20260528214850_create_session_tables.sql`
- SSR fetch pattern to mirror: `src/pages/drill.astro:27`
- Stats helper reused: `src/components/drill/exercises.ts:131` (`summarize`)
- Per-type aggregation precedent: `src/components/drill/DrillSession.tsx:187`
- Stat-block visual reference: `src/components/drill/SessionResults.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: History Page & Data

#### Automated

- [x] 1.1 Type checking passes: `npx astro check`
- [x] 1.2 Linting passes: `npm run lint`
- [x] 1.3 Production build succeeds: `npm run build`

#### Manual

- [x] 1.4 `/history` lists finished sessions newest-first with correct per-type counts and accuracy
- [x] 1.5 Accuracy bar width tracks the percentage
- [x] 1.6 Zero-session user sees the empty state with a working "Start practising" CTA
- [x] 1.7 Signed-out access to `/history` redirects to `/auth/signin`
- [x] 1.8 Layout matches the cosmic/glass style at phone/tablet widths
- [x] 1.9 Query failure / null client renders the neutral error card without the "Start practising" CTA

### Phase 2: Navigation Wiring

#### Automated

- [ ] 2.1 Linting passes: `npm run lint`
- [ ] 2.2 Production build succeeds: `npm run build`

#### Manual

- [ ] 2.3 Dashboard "Session history" link navigates to `/history`
- [ ] 2.4 History back link returns to `/dashboard` from both list and empty states
- [ ] 2.5 Dashboard history link reads as secondary to "Start practising"
