<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Session Data Schema Implementation Plan

- **Plan**: context/changes/session-data-schema/plan.md
- **Mode**: Deep
- **Date**: 2026-05-28
- **Verdict**: REVISE → SOUND (all findings fixed during triage)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | WARNING → resolved (F2) |
| Architectural Fitness | PASS |
| Blind Spots | WARNING → resolved (F4) |
| Plan Completeness | WARNING → resolved (F1, F3) |

## Grounding
4/4 existing paths ✓ (src/db & supabase/migrations correctly flagged as not-yet-created), symbols ✓ (untyped createServerClient, schema_paths=[], major_version=17, no db:types script), Progress↔Phase ✓, brief↔plan ✓.

## Findings

### F1 — db:types redirect writes into a non-existent directory

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — npm script / generated types file
- **Detail**: `supabase gen types --local > src/db/database.types.ts` but `src/db/` does not exist (confirmed). A `>` redirect does not create parent dirs, so the first `npm run db:types` (verification 2.1) fails with "no such file or directory".
- **Fix**: Prepend `mkdir -p src/db &&` to the db:types script.
- **Decision**: FIXED (Fix in plan — db:types script now `mkdir -p src/db && supabase gen types …`)

### F2 — Partial index doesn't serve the view it's justified for

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Lean Execution
- **Location**: Phase 1 — Indexes & Performance Considerations
- **Detail**: `answers(user_id, note, exercise_type) WHERE NOT is_correct` is justified as speeding the `note_error_stats` view, but the view joins via `session_id` (uses `answers(session_id)`) and needs `COUNT(*)` total, so it reads correct rows too and cannot use a NOT-is_correct partial index lacking session_id. S-03's direct query is out of scope, so the index serves an unbuilt query.
- **Fix A ⭐ Recommended**: Drop the partial index; add it in S-03 when the real query exists.
  - Strength: No speculative write-cost; aligns with "What We're NOT Doing".
  - Tradeoff: S-03 owns one extra small migration.
  - Confidence: HIGH — index-not-used analysis is mechanical.
  - Blind spot: S-03's exact query shape unknown.
- **Fix B**: Keep the index, re-justify as a future S-03 direct-query index.
  - Strength: Keeps schema forward-leaning.
  - Tradeoff: Ships an unverified index of possibly-wrong shape.
  - Confidence: MED.
- **Decision**: FIXED (Fix A — index removed from migration; Performance Considerations updated)

### F3 — `supabase db lint` mischaracterized as column verification

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Success Criteria 1.2
- **Detail**: db lint reports schema advisories (RLS disabled, security_definer views), not column correctness — a misnamed/missing column passes lint. `db reset` proves SQL validity, not contract match.
- **Fix**: Reframe 1.2 to db-lint-for-advisories; add a `\d+`/Studio structural check for column confirmation.
- **Decision**: FIXED (Fix in plan — split into advisories check + `\d+` column check; Progress renumbered 1.1–1.6)

### F4 — RLS INSERT/UPDATE clause type left unspecified

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — RLS policies
- **Detail**: Policies stated as "INSERT/UPDATE their own rows" without USING vs WITH CHECK. INSERT honors only WITH CHECK; UPDATE needs WITH CHECK to prevent reassigning user_id. Silent security gap if implemented with USING alone.
- **Fix**: Specify WITH CHECK on INSERT, USING + WITH CHECK on UPDATE.
- **Decision**: FIXED (Fix in plan — per-policy USING/WITH CHECK clauses enumerated)
