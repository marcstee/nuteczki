# Session Data Schema Implementation Plan

## Overview

Define the Supabase persistence layer for drill sessions — two tables (`sessions`, `answers`), Row Level Security policies, indexes, and an adaptive-query view — then set up TypeScript type generation so every downstream slice gets typed Supabase queries from day one.

## Current State Analysis

Supabase infrastructure is fully wired: server-side client (`src/lib/supabase.ts` via `@supabase/ssr`), auth middleware (`src/middleware.ts`), and API routes for signin/signup/signout. The local dev environment is configured (`supabase/config.toml`, PostgreSQL 17, port 54322). However there are **zero migrations, zero tables, and no generated types**. The `supabase/migrations/` directory does not exist yet.

### Key Discoveries:

- `src/lib/supabase.ts:1-24` — server-side client uses `createServerClient` from `@supabase/ssr` with cookie-based session management. Currently untyped (no `Database` generic parameter).
- `supabase/config.toml:53-65` — migrations are enabled but `schema_paths = []` is empty; seed support points to `./seed.sql` which doesn't exist.
- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard"]`; the drill and history pages will need adding here in S-01/S-04 but that's out of scope for this change.
- Cloudflare Workers free tier has a 50 subrequest limit per invocation (`context/foundation/infrastructure.md`). Each Supabase query counts as one subrequest. The adaptive-query view consolidates what would otherwise be multiple queries into one.

## Desired End State

After this plan is complete:
- Two tables (`sessions`, `answers`) exist in the local Supabase instance with proper constraints, foreign keys, and indexes.
- RLS policies restrict all data access to the owning user (`auth.uid()`).
- A `note_error_stats` view aggregates per-note error counts from the last 5 completed sessions per user — proving the schema supports the adaptive algorithm's query pattern before S-03 starts.
- A typed Supabase client is available via `src/lib/supabase.ts` using generated types from `src/db/database.types.ts`.
- An npm script (`db:types`) regenerates types after future schema changes.

**Verification:** `npx supabase db reset` applies the migration cleanly. `npm run db:types` generates types. `npx astro check` and `npm run lint` pass.

## What We're NOT Doing

- No API routes — S-01 owns the CRUD layer.
- No seed data — tables are tested via migration success and type generation.
- No application-level validation of note values — the valid note range (C4–A5 for treble clef beginner) is domain logic for S-01/F-02, not a schema constraint.
- No `finished_at` enforcement logic — the app decides when to stamp a session as finished (S-01).
- No changes to middleware or protected routes.

## Implementation Approach

Two-phase approach: first the SQL migration (tables, RLS, view), then the TypeScript type generation workflow. Phase 1 is pure SQL with no application code changes. Phase 2 wires the generated types into the existing Supabase client.

## Phase 1: Schema Migration

### Overview

Create the Supabase migration with two tables, RLS policies, indexes, and the adaptive-query view.

### Changes Required:

#### 1. Migration SQL file

**File**: `supabase/migrations/<timestamp>_create_session_tables.sql`

**Intent**: Define the `sessions` and `answers` tables with constraints, foreign keys, indexes, RLS policies, and the `note_error_stats` view. This single migration establishes the entire persistence layer that S-01 through S-04 depend on.

**Contract**:

`sessions` table:
- `id` — uuid, PK, default `gen_random_uuid()`
- `user_id` — uuid, NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE
- `exercise_count` — smallint, NOT NULL, CHECK `(exercise_count IN (5, 10, 20))`
- `started_at` — timestamptz, NOT NULL, default `now()`
- `finished_at` — timestamptz, nullable (NULL = in progress)
- `created_at` — timestamptz, NOT NULL, default `now()`

`answers` table:
- `id` — uuid, PK, default `gen_random_uuid()`
- `session_id` — uuid, NOT NULL, FK → `sessions(id)` ON DELETE CASCADE
- `user_id` — uuid, NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE
- `exercise_type` — text, NOT NULL, CHECK `(exercise_type IN ('note_to_letter', 'letter_to_note'))`
- `note` — text, NOT NULL (e.g., `'C4'`, `'D4'`, `'A5'`)
- `is_correct` — boolean, NOT NULL
- `answered_at` — timestamptz, NOT NULL, default `now()`

`user_id` on `answers` is intentionally denormalized — it enables simple, fast RLS policies (`user_id = auth.uid()`) without a join to `sessions` on every query. This is the standard Supabase pattern.

Indexes:
- `answers(session_id)` — fast join from session to its answers (drives the `note_error_stats` view's join)
- `sessions(user_id, started_at DESC)` — session history listing in reverse chronological order

(No per-note error index here: the `note_error_stats` view joins via `session_id` and reads all answers for the last 5 sessions — a `WHERE NOT is_correct` partial index can't serve it. S-03 adds an index matched to its actual adaptive query when that query exists.)

RLS policies (both tables have RLS enabled, all scoped to the `authenticated` role). Each policy must use the correct clause — INSERT honors only `WITH CHECK`, SELECT only `USING`, UPDATE needs both:
- `sessions` SELECT — `USING (user_id = auth.uid())`
- `sessions` INSERT — `WITH CHECK (user_id = auth.uid())`
- `sessions` UPDATE — `USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())` (the `WITH CHECK` prevents reassigning a row to another user)
- No DELETE policy on `sessions` — sessions are never deleted from the app.
- `answers` SELECT — `USING (user_id = auth.uid())`
- `answers` INSERT — `WITH CHECK (user_id = auth.uid())`
- No UPDATE or DELETE policy on `answers` — answers are immutable once recorded.

View `note_error_stats` — uses `security_invoker = on` (Postgres 17) so RLS on the underlying tables applies:

```sql
CREATE VIEW note_error_stats WITH (security_invoker = on) AS
WITH ranked_sessions AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY started_at DESC) AS rn
  FROM sessions
  WHERE finished_at IS NOT NULL
)
SELECT
  rs.user_id,
  a.note,
  a.exercise_type,
  COUNT(*) FILTER (WHERE NOT a.is_correct) AS error_count,
  COUNT(*) AS total_count
FROM ranked_sessions rs
JOIN answers a ON a.session_id = rs.id
WHERE rs.rn <= 5
GROUP BY rs.user_id, a.note, a.exercise_type;
```

This view is included as a code snippet because it's the non-obvious piece — the `ROW_NUMBER()` window function with `PARTITION BY user_id` ensures "last 5 sessions" is per-user, and `security_invoker` ensures RLS applies when queried through the Supabase API.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset`
- No schema advisories: `npx supabase db lint` (no errors — flags RLS-disabled tables, security_definer views, etc.; does NOT verify column shape)
- Columns match the contract: `psql "$DB_URL" -c "\d+ sessions" -c "\d+ answers"` (or inspect in Studio) shows the columns/types/constraints defined above
- Supabase local instance is running and accessible at `localhost:54321`

#### Manual Verification:

- Open Supabase Studio at `localhost:54323` and confirm both tables, RLS policies, and the view are visible
- Verify RLS policies are listed under each table's policies tab

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Type Generation Setup

### Overview

Add an npm script to generate TypeScript types from the Supabase schema, generate the initial types file, and wire the typed `Database` generic into the Supabase client helper.

### Changes Required:

#### 1. npm script for type generation

**File**: `package.json`

**Intent**: Add a `db:types` script so developers (and agents) can regenerate types after any schema change with a single command.

**Contract**: New script entry `"db:types"` that runs `mkdir -p src/db && supabase gen types --lang=typescript --local > src/db/database.types.ts`. The `mkdir -p` ensures the target directory exists on first run (it does not yet) — a bare `>` redirect would otherwise fail with "no such file or directory".

#### 2. Generated types file

**File**: `src/db/database.types.ts`

**Intent**: Auto-generated TypeScript definitions for all Supabase tables, views, and functions. This file is generated, not hand-written.

**Contract**: Run the `db:types` script; the output file contains the `Database` type export that maps to the `sessions`, `answers` tables and `note_error_stats` view.

#### 3. Typed Supabase client

**File**: `src/lib/supabase.ts`

**Intent**: Pass the `Database` generic to `createServerClient` so all downstream queries are fully typed.

**Contract**: Import `Database` from `@/db/database.types` and use it as the generic parameter: `createServerClient<Database>(...)`. The function return type changes from `SupabaseClient | null` to `SupabaseClient<Database> | null`.

### Success Criteria:

#### Automated Verification:

- Types generate without error: `npm run db:types`
- TypeScript compiles: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Open `src/db/database.types.ts` and confirm it contains type definitions for `sessions`, `answers`, and `note_error_stats`
- Verify IDE autocompletion works when writing a Supabase query (e.g., `supabase.from('sessions').select('*')` shows typed columns)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Not applicable — this change is pure schema + type generation, no application logic.

### Integration Tests:

- Migration applies cleanly on a fresh `supabase db reset`
- Type generation produces a valid TypeScript file that compiles

### Manual Testing Steps:

1. Run `npx supabase db reset` — confirm it completes without errors
2. Open Supabase Studio (`localhost:54323`) and inspect both tables' columns, constraints, and RLS policies
3. Run `npm run db:types` — confirm `src/db/database.types.ts` is generated
4. Run `npx astro check` — confirm no type errors
5. Run `npm run build` — confirm production build succeeds

## Performance Considerations

- The `note_error_stats` view uses `ROW_NUMBER()` with a window function. At MVP scale (single user, dozens of sessions), this is negligible. If performance becomes a concern at scale, the view can be replaced with a materialized view or a Supabase RPC function with explicit pagination.
- The view's access path is the `answers(session_id)` index (join from the last-5 sessions to their answers). No per-note error index is added in this change — S-03 introduces one matched to its actual adaptive query once that query exists.

## Migration Notes

- This is the first migration in the project — `supabase/migrations/` directory will be created automatically by the Supabase CLI.
- To apply on remote Supabase: `npx supabase db push` (after setting up the remote project link).
- Rollback: drop tables in reverse order (`answers` first due to FK, then `sessions`), drop the view.

## References

- Roadmap F-01: `context/foundation/roadmap.md:62-73`
- PRD functional requirements: `context/foundation/prd.md:72-101`
- PRD business logic (adaptive algorithm): `context/foundation/prd.md:112-116`
- Supabase client: `src/lib/supabase.ts`
- Infrastructure constraints (subrequest limit): `context/foundation/infrastructure.md:66-68`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema Migration

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` — 43d4b30
- [x] 1.2 No schema advisories: `npx supabase db lint` — 43d4b30
- [x] 1.3 Columns match the contract: `\d+ sessions` / `\d+ answers` (or Studio) — 43d4b30
- [x] 1.4 Supabase local instance accessible at localhost:54321 — 43d4b30

#### Manual

- [x] 1.5 Tables, RLS policies, and view visible in Supabase Studio — 43d4b30
- [x] 1.6 RLS policies listed under each table's policies tab — 43d4b30

### Phase 2: Type Generation Setup

#### Automated

- [x] 2.1 Types generate without error: `npm run db:types`
- [x] 2.2 TypeScript compiles: `npx astro check`
- [x] 2.3 Linting passes: `npm run lint`
- [x] 2.4 Build succeeds: `npm run build`

#### Manual

- [x] 2.5 database.types.ts contains definitions for sessions, answers, and note_error_stats
- [x] 2.6 IDE autocompletion works for typed Supabase queries
