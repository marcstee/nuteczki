# Session History UX (pagination + delete) Implementation Plan

## Overview

S-06 extends the already-shipped session-history view (`src/pages/history.astro`, S-04) and the S-05 redesign with two capabilities: **pagination** so the list stays manageable as sessions accumulate, and **per-session delete** — the product's first destructive action — guarded by a confirmation step. Delete must cascade to the session's answer rows so no orphaned answers remain and the S-03 adaptive algorithm (which reads recent answers via `note_error_stats`) is not skewed.

## Current State Analysis

- **The history page is deliberately zero-client-JS and SSR-only** (`src/pages/history.astro:20-32`). It builds a cookie-authed Supabase client, runs one embedded select of *all* completed sessions ordered `started_at desc`, aggregates via the pure `summarizeSessions` helper, and renders three deliberately-distinct states: `sessions === null` (error / unconfigured client — neutral card), empty array (confirmed first-run — empty state with "Zacznij ćwiczyć" CTA), and non-empty (the list). The comment at `history.astro:13-19` flags that collapsing error into empty is a real bug, so the split is load-bearing and must survive this change.
- **The schema cascades answers at the FK level but blocks delete at RLS.** `answers.session_id references sessions(id) on delete cascade` (`supabase/migrations/20260528214850_create_session_tables.sql:14`) — deleting a `sessions` row already removes its `answers` rows at the DB level. But the migration defines only `select` / `insert` / `update` policies on `sessions` (`:28-39`) — **no `delete` policy** — so a user cannot delete a session through the Supabase API today.
- **Cascade keeps adaptive history correct.** `note_error_stats` (`:52-70`) reads answers from each user's last 5 completed sessions. Because answers cascade-delete with their session, a removed session drops out of adaptive history automatically — exactly the correctness the change.md flags, already handled by the FK.
- **The index already supports paginated reads.** `sessions_user_id_started_at_idx on sessions (user_id, started_at desc)` (`:23`) makes an offset `.range()` query over `started_at desc` cheap.
- **API pattern is established.** `src/pages/api/sessions.ts` has a `POST` handler that self-guards auth (503 if Supabase unconfigured, 401 if no user — returns JSON, never a redirect, because it's hit by `fetch()`), validates input, and is idempotent. `/api/sessions` is **not** in `PROTECTED_ROUTES` (`src/middleware.ts:4`); it self-guards instead. A `DELETE` handler belongs in this same file.
- **UI inventory is thin.** `src/components/ui/` has only `button.tsx` (which has a `destructive` variant) and `LibBadge.astro` — **no Dialog/AlertDialog primitive**. `lucide-react` is available (Trash2). Islands mount with client directives (`drill.astro:51`: `<DrillSession client:load … />`).
- **No test runner.** Deps have no vitest/playwright; scripts are `lint`, `build`, `astro check` (via `@astrojs/check`), `astro sync`, `db:types`, `deploy`. Automated verification is limited to lint + typecheck + build; behavior is verified manually.

## Desired End State

A signed-in parent opens `/history` and sees the 10 most recent completed sessions. Prev/Next controls and a "Strona X z Y" indicator let them page through the rest as plain server-rendered links (`?page=N`), with no client JS for pagination. Each session card carries a small ghost trash icon (top-right); tapping it opens a branded Polish confirmation dialog, and confirming permanently deletes that session and its answers, then re-renders the list. Deleting the last card on a page beyond page 1 lands the user on the last valid page rather than an empty dead-end. Deleting a session immediately stops it from influencing the adaptive drill.

Verify by: paging through a >10-session account; deleting a session and confirming it disappears and its answers are gone (drill weights recompute); deleting the last card on page 2 and landing on page 1; cancelling the dialog leaves the session intact.

### Key Discoveries:

- Zero-client-JS SSR is the documented, load-bearing pattern for this page — pagination must stay SSR (`history.astro:6-19`).
- FK `on delete cascade` already deletes answers with their session (`migration:14`); **FK-driven cascades bypass RLS**, so only a `sessions` delete policy is needed — no answers delete policy.
- The three render states (`null` / empty / list) must be preserved exactly (`history.astro:55-113`).
- `DELETE` belongs in `src/pages/api/sessions.ts` alongside `POST`, self-guarding auth the same way.
- No test runner exists — success criteria lean on lint + `astro check` + build + manual verification.

## What We're NOT Doing

- No "delete all history", no multi-select / bulk delete — individual session delete only (per change.md and the S-06 scope).
- No soft-delete / trash / undo — delete is a hard cascade delete.
- No client-side pagination island, no infinite scroll / "load more" — pagination stays SSR via `?page=N`.
- No changes to the adaptive algorithm or the `note_error_stats` view — the existing cascade keeps it correct.
- No session detail view, editing, or renaming.
- No new test-runner setup — that is the test-plan's job, not this slice.
- No change to date formatting or the `summarizeSessions` aggregation math.

## Implementation Approach

Three phases in dependency order, each independently verifiable. Phase 1 (pagination) is a self-contained, zero-JS SSR change shippable on its own. Phase 2 stands up the delete backend (RLS policy + API handler) — testable with a direct request before any UI exists. Phase 3 adds the only client JS in this slice: a focused delete island that calls the Phase 2 endpoint and reloads, which re-runs Phase 1's page-bounds clamp.

## Critical Implementation Details

- **FK cascade bypasses RLS.** Deleting a `sessions` row cascades to `answers` via the existing `on delete cascade` FK, and Postgres executes that referential action as a system operation **not** subject to the `answers` RLS policies. Therefore Phase 2 adds a delete policy on `sessions` only; adding one on `answers` is unnecessary and would not be exercised by the cascade.
- **Page-bounds clamp ordering.** In `history.astro` the total count must be fetched and `totalPages` computed *before* deciding whether to render, so a `?page` beyond the last page can `return Astro.redirect()` to the last valid page **before** any list HTML is produced. This redirect is also what makes the post-delete reload land correctly when the last card on a page was removed.
- **Idempotent delete.** With RLS scoping, deleting a non-owned or already-deleted id affects zero rows and returns no error. The `DELETE` handler treats that as success (200), mirroring the idempotent ethos of the existing `POST` — concurrent deletes from two tabs are harmless no-ops.

## Phase 1: SSR Pagination

### Overview

Add `?page=N` offset pagination to the history page: 10 sessions per page, an exact total count, a page-bounds redirect, and Prev/Next + "Strona X z Y" controls — all server-rendered, preserving the three render states and the zero-client-JS pattern.

### Changes Required:

#### 1. History page — paginated query + bounds clamp

**File**: `src/pages/history.astro`

**Intent**: Read and validate a `page` query param, fetch only that page's slice plus the total count, and redirect out-of-range pages to the last valid page before rendering. Preserve the existing `null` / empty / list render-state split.

**Contract**: A `PAGE_SIZE = 10` constant. Parse `Astro.url.searchParams.get("page")` to a positive integer, defaulting/clamping invalid values (NaN, `< 1`) to `1`. Extend the existing select with `{ count: "exact" }` and `.range(from, to)` where `from = (page - 1) * PAGE_SIZE` and `to = from + PAGE_SIZE - 1`. Compute `totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))`. If the query errored, keep `sessions === null` (error state unchanged). If `count > 0` and `page > totalPages`, `return Astro.redirect(\`/history?page=${totalPages}\`)` before rendering. The empty state remains `count === 0`.

#### 2. History page — Prev/Next pagination controls

**File**: `src/pages/history.astro`

**Intent**: Render pagination controls below the list when there is more than one page, adopting the S-05 redesign's card/button styling.

**Contract**: Show controls only when `totalPages > 1`. A Prev link (`?page=${page - 1}`) and a Next link (`?page=${page + 1}`), each rendered as a disabled/non-interactive element (not an `<a>`) when at the respective boundary (`page === 1` / `page === totalPages`). A centered "Strona {page} z {totalPages}" indicator between them. Polish copy: "Poprzednia" / "Następna" (or arrow glyphs consistent with the existing `← Panel` back-link style).

### Success Criteria:

#### Automated Verification:

- [ ] Lint passes: `npm run lint`
- [ ] Type/astro check passes: `npx astro check`
- [ ] Production build succeeds: `npm run build`

#### Manual Verification:

- [ ] With >10 completed sessions, the page shows 10 cards, newest first, and Prev/Next + "Strona X z Y" appear.
- [ ] Next advances pages; Prev returns; controls are disabled at the first/last page.
- [ ] An out-of-range `?page=999` redirects to the last valid page.
- [ ] With ≤10 sessions, no pagination controls render; with 0 sessions, the empty state and CTA still render; the error state is unaffected when Supabase is unconfigured.

**Implementation Note**: After automated verification passes, pause for human confirmation that manual testing succeeded before proceeding to Phase 2.

---

## Phase 2: Delete Backend (RLS policy + DELETE API)

### Overview

Add the `sessions_delete_own` RLS policy (answers cascade via the existing FK) and a self-guarding, idempotent `DELETE` handler on `/api/sessions` that deletes a single session by id.

### Changes Required:

#### 1. New migration — sessions delete RLS policy

**File**: `supabase/migrations/<timestamp>_add_sessions_delete_policy.sql` (new; timestamp via `supabase migration new add_sessions_delete_policy` or matching the existing `YYYYMMDDHHMMSS_` format)

**Intent**: Allow an authenticated user to delete their own sessions. No answers policy is added — the FK cascade removes answer rows as a system operation that bypasses RLS.

**Contract**:

```sql
create policy "sessions_delete_own" on sessions
  for delete to authenticated
  using (user_id = auth.uid());
```

#### 2. DELETE handler on the sessions API route

**File**: `src/pages/api/sessions.ts`

**Intent**: Add an exported `DELETE` handler that self-guards auth like `POST`, reads the target session id from the query string, and deletes it (RLS scopes the delete to the owner; answers cascade).

**Contract**: `export const DELETE: APIRoute`. Build the client with `createClient` → 503 (reusing the existing `json` helper) when unconfigured; `supabase.auth.getUser()` → 401 when no user. Read `id` from `context.url.searchParams.get("id")`; reject a missing/empty id with 400. Run `supabase.from("sessions").delete().eq("id", id)`; on `error` return 500; otherwise return `json({ ok: true }, 200)` — idempotent (a non-owned or already-deleted id is a zero-row no-op, still 200).

### Success Criteria:

#### Automated Verification:

- [ ] Lint passes: `npm run lint`
- [ ] Type/astro check passes: `npx astro check`
- [ ] Production build succeeds: `npm run build`
- [ ] Migration applies cleanly against local Supabase: `supabase migration up` (or `supabase db reset`)

#### Manual Verification:

- [ ] `DELETE /api/sessions?id=<own-session-id>` returns 200 and the session is gone from the DB.
- [ ] The session's `answers` rows are gone after the delete (cascade verified).
- [ ] `DELETE` without a logged-in session returns 401; without `id` returns 400; with another user's id deletes nothing and still returns 200 (RLS no-op).
- [ ] After deleting a session, the drill page's `note_error_stats`-derived weights no longer reflect that session's answers.

**Implementation Note**: After automated verification passes, pause for human confirmation that manual testing succeeded before proceeding to Phase 3.

---

## Phase 3: Delete UI (AlertDialog island)

### Overview

Add the shadcn `alert-dialog` primitive and a focused `DeleteSessionButton` island — a ghost trash icon on each card that opens a Polish confirmation dialog and, on confirm, calls the Phase 2 endpoint and reloads (re-running Phase 1's clamp).

### Changes Required:

#### 1. Add the shadcn AlertDialog primitive

**File**: `src/components/ui/alert-dialog.tsx` (new, generated)

**Intent**: Install the accessible confirmation-dialog primitive matching the new-york shadcn style already in use.

**Contract**: `npx shadcn@latest add alert-dialog` — lands `src/components/ui/alert-dialog.tsx` and adds the `@radix-ui/react-alert-dialog` dependency. No hand-editing beyond what the generator produces.

#### 2. DeleteSessionButton island

**File**: `src/components/history/DeleteSessionButton.tsx` (new)

**Intent**: Render the per-card delete affordance and own the confirm → request → reload flow, with in-flight and error handling. This is the only client JS in the slice.

**Contract**: Props `{ sessionId: string; sessionDate: string }`. Renders a `Button` (`variant="ghost"`, `size="icon"`) containing a `Trash2` icon with an `aria-label` (e.g. `Usuń sesję z dnia {sessionDate}`). Clicking opens an `AlertDialog`: title "Usunąć tę sesję?", description warning the action is irreversible and names the date (e.g. "Tej operacji nie można cofnąć. Sesja z dnia {sessionDate} i jej odpowiedzi zostaną trwale usunięte."), Cancel "Anuluj", Action "Usuń" (destructive styling). On confirm: `fetch(\`/api/sessions?id=${sessionId}\`, { method: "DELETE" })`; while pending, disable both buttons and show a pending label ("Usuwanie…"); on `res.ok` call `window.location.reload()`; on failure show an inline error and keep the dialog open so the card is not lost. Must satisfy `react-compiler` lint rules (no rules violations).

#### 3. Mount the delete button on each card + adjust the header layout

**File**: `src/pages/history.astro`

**Intent**: Place the delete island in each session card's header next to the accuracy figure, hydrated lazily, passing the formatted date for the confirm copy.

**Contract**: In the card header (`history.astro:75-78`, currently `flex … justify-between` with date + accuracy), group the accuracy `%` and `<DeleteSessionButton client:visible sessionId={s.id} sessionDate={dateFormatter.format(new Date(s.startedAt))} />` on the right so the trash sits top-right without crowding the date. Use `client:visible` so only on-screen cards hydrate.

### Success Criteria:

#### Automated Verification:

- [ ] Lint passes (including `react-compiler` and `jsx-a11y`): `npm run lint`
- [ ] Type/astro check passes: `npx astro check`
- [ ] Production build succeeds: `npm run build`

#### Manual Verification:

- [ ] Each card shows a ghost trash icon top-right; tapping opens the Polish confirmation dialog.
- [ ] "Anuluj" / Esc / outside-click closes the dialog and leaves the session intact.
- [ ] "Usuń" deletes the session: the icon shows a pending state, then the list re-renders without that card and its answers are gone.
- [ ] Deleting the last card on page 2 lands the user on page 1 (the clamp redirect); deleting the only session shows the empty state.
- [ ] A failed delete (e.g. offline) shows an inline error and keeps the card.
- [ ] On iPhone/iPad Safari (the PWA form factor), the trash control is reachable and tappable (no hover dependency); dialog buttons are sized for touch.

**Implementation Note**: After automated verification passes, pause for human confirmation that manual testing succeeded.

---

## Testing Strategy

There is no test runner in this project (no vitest/playwright), so automated coverage is limited to lint, `astro check` (typecheck), and `build`. Behavioral correctness is verified manually per phase.

### Manual Testing Steps:

1. Seed/accumulate >10 completed sessions; confirm 10-per-page slicing, ordering, and Prev/Next + indicator behavior including boundary disabling.
2. Hit `/history?page=999` and confirm redirect to the last valid page.
3. Delete a session via the dialog; confirm the card disappears, the DB row and its answers are gone, and the drill's adaptive weights no longer include it.
4. Delete the last card on page 2; confirm landing on page 1. Delete the final session; confirm the empty state.
5. Cancel the dialog (button, Esc, outside click); confirm no deletion.
6. Simulate a failed delete (offline); confirm inline error and card preserved.
7. Verify the error state still renders distinctly when Supabase is unconfigured (not the empty state).

## Performance Considerations

Negligible at the PRD's small/low-qps scale. Pagination *reduces* per-request work versus today's unbounded fetch. The `{ count: "exact" }` aggregate and `.range()` are served by the existing `sessions_user_id_started_at_idx`. `client:visible` keeps island hydration limited to on-screen cards (≤10).

## Migration Notes

One additive, non-destructive migration (a new `delete` policy). No data migration, no column changes — `src/db/database.types.ts` is unaffected (policies don't appear in generated types), so no `db:types` regen is required. The migration is forward-only; rollback is dropping the policy.

## References

- Roadmap slice: `context/foundation/roadmap.md` S-06 (`session-history-ux`)
- Change identity: `context/changes/session-history-ux/change.md`
- Existing history page: `src/pages/history.astro`
- Aggregation helper: `src/components/history/sessionSummary.ts`
- API pattern (POST): `src/pages/api/sessions.ts`
- Schema + RLS + cascade + adaptive view: `supabase/migrations/20260528214850_create_session_tables.sql`
- Island mounting precedent: `src/pages/drill.astro:51`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: SSR Pagination

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — f2bdc65
- [x] 1.2 Type/astro check passes: `npx astro check` — f2bdc65
- [x] 1.3 Production build succeeds: `npm run build` — f2bdc65

#### Manual

- [x] 1.4 >10 sessions: 10 cards newest-first, Prev/Next + "Strona X z Y" appear — f2bdc65
- [x] 1.5 Next/Prev navigate; controls disabled at first/last page — f2bdc65
- [x] 1.6 Out-of-range `?page=999` redirects to the last valid page — f2bdc65
- [x] 1.7 ≤10 sessions hide controls; empty state + CTA intact; error state unaffected — f2bdc65

### Phase 2: Delete Backend (RLS policy + DELETE API)

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — 9d1c607
- [x] 2.2 Type/astro check passes: `npx astro check` — 9d1c607
- [x] 2.3 Production build succeeds: `npm run build` — 9d1c607
- [x] 2.4 Migration applies cleanly: `supabase migration up` (or `supabase db reset`) — 9d1c607

#### Manual

- [x] 2.5 `DELETE /api/sessions?id=<own>` returns 200 and removes the session — 7c88db2
- [x] 2.6 The session's answers rows are gone (cascade verified) — 7c88db2
- [x] 2.7 No-auth → 401; missing id → 400; other user's id → 200 no-op (RLS) — 7c88db2
- [x] 2.8 Adaptive weights no longer reflect the deleted session's answers — 7c88db2

### Phase 3: Delete UI (AlertDialog island)

#### Automated

- [x] 3.1 Lint passes (react-compiler + jsx-a11y): `npm run lint` — 7c88db2
- [x] 3.2 Type/astro check passes: `npx astro check` — 7c88db2
- [x] 3.3 Production build succeeds: `npm run build` — 7c88db2

#### Manual

- [x] 3.4 Ghost trash icon top-right of each card opens the Polish confirm dialog — 7c88db2
- [x] 3.5 Anuluj / Esc / outside-click closes without deleting — 7c88db2
- [x] 3.6 Usuń deletes: pending state → list re-renders without the card, answers gone — 7c88db2
- [x] 3.7 Deleting last card on page 2 lands on page 1; deleting the only session shows empty state — 7c88db2
- [x] 3.8 Failed delete shows inline error and keeps the card — 7c88db2
- [x] 3.9 Touch-reachable on iPhone/iPad Safari (no hover dependency) — 7c88db2

### Phase 4: Date + Time Display

#### Automated

- [x] 4.1 Lint passes: `npm run lint`
- [x] 4.2 Type/astro check passes: `npx astro check`
- [x] 4.3 Production build succeeds: `npm run build`

#### Manual

- [x] 4.4 Session cards show date and time (e.g. "10 cze 2026, 14:30") in Europe/Warsaw tz
- [x] 4.5 Confirm dialog and aria-label use the same date+time string
