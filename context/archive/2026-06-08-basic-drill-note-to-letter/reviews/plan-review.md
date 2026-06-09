<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Basic Drill — Note-to-Letter Exercises

- **Plan**: context/changes/basic-drill-note-to-letter/plan.md
- **Mode**: Deep
- **Date**: 2026-06-08
- **Verdict**: REVISE (light — fundamentally sound, two refinements)
- **Findings**: 0 critical, 2 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

11/11 existing paths ✓ (`drill.astro` intentionally to-create); symbols ✓
(`PITCHES`/`B4`/`Pitch` in pitch.ts, `createClient`→null in supabase.ts,
`auth.getUser()` + `PROTECTED_ROUTES` in middleware.ts, `answers`/`sessions`
columns & types in database.types.ts, house API/page patterns in
signin.ts/signin.astro/dashboard.astro); brief↔plan ✓ (phases, decisions, scope
match); verification commands ✓ (`@astrojs/check ^0.9.8`, `typescript ^5.9.3`,
`eslint`, `astro build` all present); Progress↔Phase mechanical contract ✓
(single `## Progress`, all three phases mirrored, 1.1–3.7 map 1:1 to success
criteria, no stray checkboxes in phase bodies).

## What's strong

- Phases each demo cleanly as independent increments (pure core → playable loop → persisted).
- `B4`→`H` labeling correctly owned by S-01; `pitch.ts` stays scientific (verified).
- Idempotent-upsert design genuinely handles duplicate-write and mid-batch-failure: single atomic answers INSERT, session-first FK ordering, `ON CONFLICT DO NOTHING` needs no UPDATE policy (consistent with the RLS facts).
- Error paths covered: 401 / 503 / 500 / 400, plus offline (fetch rejection → caller's catch).
- Blast radius small: only `middleware.ts` and `dashboard.astro` are additive edits to existing files; all else new files reusing the staff core read-only.

## Findings

### F1 — Non-transactional two-write can orphan a finished session

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 — `/api/sessions` steps 4–5
- **Detail**: The route does two separate upserts (session, then answers) in two PostgREST calls = two transactions. FK `answers.session_id → sessions.id` forces session-first. If the session insert succeeds but the answers insert fails (500) AND the user abandons "Retry save", you're left with a finished session row (`finished_at` set) and zero answers — permanently. `sessions` has no DELETE policy and no UPDATE policy, so it can't be cleaned up or staged (you can't write it in-progress then flip `finished_at` later). The idempotency design covers duplicate writes but is silent on this orphan case, which S-03 (adaptive, reads finished sessions + their answers) would later trip over.
- **Fix A ⭐ Recommended**: Name and accept the edge; make downstream tolerate it
  - Strength: Zero new code; honest about a constraint the plan itself documents (no UPDATE/DELETE, no RPC). Retry UX already shrinks the window. Add one line to "What We're NOT Doing" / Open Risks: "a finished session whose answers write fails and is never retried is an uncleanable orphan; S-03 must tolerate finished sessions with missing/short answer sets."
  - Tradeoff: The inconsistent row can exist; burden moves to consumers.
  - Confidence: HIGH — matches the plan's stated MVP risk posture and the RLS facts verified in session-data-schema.
  - Blind spot: Whether S-03's planned queries already assume `answers.count == exercise_count`.
- **Fix B**: Make the write atomic via a single Postgres RPC
  - Strength: Session + answers commit or roll back together; no orphan.
  - Tradeoff: Adds an RPC + migration the plan explicitly excludes ("No new migration / RPC"); reopens scope.
  - Confidence: MEDIUM — clean, but contradicts a stated scope boundary.
  - Blind spot: RLS/SECURITY-DEFINER semantics inside the function unverified.
- **Decision**: FIXED (Fix A) — added "No orphan cleanup" bullet to `## What We're NOT Doing`, putting S-03 on notice to tolerate finished sessions with missing/short answer sets.

### F2 — Save kickoff + id generation location left unspecified (React Compiler risk)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §2–3 (`saveSession.ts`, `DrillSession.tsx`)
- **Detail**: The plan flags React Compiler as Phase 2's key risk, yet the one true side effect — generating `crypto.randomUUID()` ids and firing the network save "on entering finished" — is left unplaced. The trap: generating ids in render (e.g. `if (phase==='finished') const id = randomUUID()`) both regenerates per render (defeating the idempotency the whole design rests on) and is an impure-render violation the enforced `react-compiler/react-compiler` rule will reject. The stable-id note warns against per-retry regeneration but not per-render.
- **Fix**: Specify that ids are created once in the event handler that transitions to `finished` (or a phase-keyed effect with a guard) and stored in `useState`; `saveSession` is fired from that same handler/effect, never computed in render.
- **Decision**: FIXED (Fix in plan) — Phase 3 §2 now passes ids into `saveSession` instead of generating them; §3 + the stable-id note pin id generation to the finish-transition handler, never in render (closes the React Compiler impure-render trap).
