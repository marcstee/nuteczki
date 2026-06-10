# Session History UX (pagination + delete) — Plan Brief

> Full plan: `context/changes/session-history-ux/plan.md`

## What & Why

S-06 adds **pagination** and **per-session delete** to the shipped session-history view. As a child practises, the history list grows without bound; pagination keeps it manageable, and delete lets a parent prune sessions. Delete is the product's first destructive action and must cascade to the session's answer rows so no orphans remain and the adaptive drill algorithm (S-03) isn't skewed by deleted history.

## Starting Point

`src/pages/history.astro` (S-04) is a deliberately zero-client-JS, SSR-only page that fetches *all* completed sessions newest-first and renders three distinct states (error / empty / list). The schema already cascades `answers` when a `sessions` row is deleted (`on delete cascade` FK), but there is **no `delete` RLS policy**, so delete is impossible via the API today. The API route `src/pages/api/sessions.ts` has a `POST` handler whose self-guarding auth pattern the new `DELETE` will mirror.

## Desired End State

A parent sees 10 sessions per page with Prev/Next + "Strona X z Y" controls (plain server-rendered `?page=N` links). Each card has a ghost trash icon (top-right) that opens a Polish confirmation dialog; confirming permanently deletes the session and its answers, then re-renders the list. Deleting the last card on a page beyond page 1 lands the parent on the last valid page rather than an empty dead-end.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Pagination mechanism | SSR via `?page=N` URL param | Preserves the page's documented zero-client-JS SSR pattern. | Plan |
| Pagination controls | Prev/Next + "Strona X z Y" | Simplest to build/use on a PWA; matches "page through". | Plan |
| Page size | 10 per page | Balances scroll length vs page count at the PRD's small scale. | Plan |
| Confirmation UI | shadcn AlertDialog island | Matches the new-york shadcn convention; accessible by default. | Plan |
| Delete affordance | Ghost Trash2 icon, top-right of card | Discoverable, unobtrusive, touch-friendly (no hover). | Plan |
| Post-delete behavior | Reload SSR + clamp to last valid page | No client list-state to sync; counts always correct. | Plan |
| Scope | Individual delete only | Matches change.md; smallest safe first destructive surface. | Plan |
| Answers RLS policy | None added (rely on FK cascade) | FK cascades bypass RLS, so only a `sessions` delete policy is needed. | Plan |

## Scope

**In scope:** SSR `?page=N` pagination (10/page, Prev/Next + indicator, bounds clamp); `sessions_delete_own` RLS policy; `DELETE /api/sessions` handler; shadcn AlertDialog + `DeleteSessionButton` island mounted per card.

**Out of scope:** delete-all / bulk / multi-select; soft-delete / undo; client-side pagination / infinite scroll; adaptive-view changes; session detail/edit; new test-runner setup.

## Architecture / Approach

Three layers, dependency-ordered. **DB:** one additive migration adds a delete RLS policy; the existing `on delete cascade` FK removes answers automatically. **API:** a self-guarding, idempotent `DELETE` handler beside the existing `POST` in `api/sessions.ts`, taking `?id=`. **Page:** `history.astro` gains a validated `?page` param, a `.range()` + exact-count query, a pre-render redirect that clamps out-of-range pages, Prev/Next controls, and a small `DeleteSessionButton` island (the slice's only client JS) that confirms, calls the endpoint, and reloads — re-triggering the clamp.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. SSR pagination | `?page=N`, 10/page, count, bounds clamp, Prev/Next + indicator | Preserving the three render states + zero-JS pattern while adding the clamp redirect |
| 2. Delete backend | `sessions_delete_own` RLS policy + idempotent `DELETE` API | Confirming FK cascade bypasses RLS (answers removed without an answers policy) |
| 3. Delete UI | shadcn AlertDialog + `DeleteSessionButton` island per card | First client JS on the page; react-compiler/a11y compliance; touch reachability |

**Prerequisites:** S-04 (shipped) and S-05 redesign (shipped); local Supabase for the migration.
**Estimated effort:** ~1–2 after-hours sessions across 3 phases.

## Open Risks & Assumptions

- FK-driven cascade deletes bypass RLS, so a `sessions`-only delete policy suffices — verified against Postgres semantics, to be confirmed manually in Phase 2 (answers gone after delete).
- No test runner exists; correctness rests on manual verification plus lint/typecheck/build.
- Reload-after-delete is acceptable UX at this data scale (chosen over optimistic removal to keep the list server-authoritative).

## Success Criteria (Summary)

- A parent can page through history (10/page) and never sees an empty dead-end after deleting.
- A parent can delete a single session behind a confirmation; the session and its answers are gone and the drill stops adapting to it.
- The page stays zero-client-JS except for the focused delete island; error/empty/list states remain distinct.
