# Session Data Schema — Plan Brief

> Full plan: `context/changes/session-data-schema/plan.md`

## What & Why

Define the Supabase persistence layer (tables, RLS, view, types) for drill sessions and answers. This is foundation F-01 — the data layer that every vertical slice (S-01 drill, S-02 letter-to-note, S-03 adaptive selection, S-04 session history) reads from and writes to. Designing the schema upfront avoids re-migration when downstream slices discover the data model doesn't fit their query patterns.

## Starting Point

Supabase is fully wired for auth (client, middleware, API routes), but has zero tables, zero migrations, and no generated types. The `supabase/migrations/` directory doesn't exist yet. The Supabase client in `src/lib/supabase.ts` is untyped.

## Desired End State

Two tables (`sessions`, `answers`) with RLS policies enforce user isolation from day one. A `note_error_stats` view proves the schema supports the adaptive algorithm's per-note error aggregation before S-03 starts. A typed Supabase client (`Database` generic) gives every downstream slice compile-time safety on queries.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Error history storage | Derive from answers (no separate table) | Single source of truth avoids sync issues between an error_history table and the answers it duplicates. |
| Note representation | Pitch name as text (e.g., `'C4'`) | Human-readable, directly maps to the 7 note names × beginner octave range, simple to query and group by. |
| Exercise type encoding | Text with CHECK constraint | Simpler migrations than Postgres enums; adding a new exercise type is an ALTER TABLE, not an ALTER TYPE. |
| RLS timing | Include in this migration | Every downstream slice inherits secure user isolation — no window where data is unprotected. |
| Session preset | Store chosen exercise_count on session | Enables showing "8/10 correct" in history; distinguishes completed from abandoned sessions. |
| Adaptive query | Database view (`note_error_stats`) | Proves the schema supports the adaptive pattern before S-03; one subrequest instead of multiple queries. |
| Type generation | Include as part of this plan | Every downstream slice gets typed Supabase queries from day one. |
| user_id on answers | Denormalized (copied from session) | Standard Supabase pattern — enables simple, fast RLS without a join to sessions on every query. |

## Scope

**In scope:**
- `sessions` table with exercise_count preset, timestamps, user_id
- `answers` table with exercise_type, note, is_correct, user_id
- RLS policies on both tables (user_id = auth.uid())
- `note_error_stats` view for adaptive algorithm
- Indexes for session history listing and error aggregation
- TypeScript type generation setup + typed Supabase client

**Out of scope:**
- API routes (S-01's job)
- Seed data
- Note value validation (domain logic for S-01/F-02)
- Middleware/route protection changes
- Application-level session lifecycle logic

## Architecture / Approach

Pure SQL migration → type generation → typed client. Two tables with a one-to-many relationship (session → answers). Both tables carry `user_id` for fast RLS. A Postgres view with `security_invoker = on` aggregates error stats from the last 5 completed sessions per user using a `ROW_NUMBER()` window function. Types are auto-generated via `supabase gen types` and wired into the existing `createServerClient` call.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema Migration | Tables, RLS, indexes, view in local Supabase | View's `ROW_NUMBER()` shape may need tweaking when S-03 implements the full algorithm |
| 2. Type Generation Setup | npm script, `database.types.ts`, typed client | Minor — well-documented Supabase workflow |

**Prerequisites:** Supabase local dev running (`npx supabase start`)
**Estimated effort:** ~1 session, 2 phases

## Open Risks & Assumptions

- The `note_error_stats` view's exact shape (last 5 sessions, grouped by note + exercise_type) may need adjustment when S-03 implements the adaptive algorithm — but views are cheap to alter.
- The `exercise_count` CHECK constraint locks presets to 5/10/20. If the UX changes preset values, a migration is needed (simple ALTER TABLE).
- Note values (e.g., `'C4'`) are unconstrained text — the valid range is domain logic, not a schema concern. If invalid notes are inserted, the app layer is at fault.

## Success Criteria (Summary)

- `npx supabase db reset` applies the migration cleanly with tables, RLS, and view visible in Studio
- `npm run db:types` generates TypeScript types that compile and match the schema
- `npm run build` succeeds with the typed Supabase client
