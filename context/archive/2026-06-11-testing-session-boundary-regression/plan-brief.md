# Session-boundary Regression Net (Phase 2) — Plan Brief

> Full plan: `context/changes/testing-session-boundary-regression/plan.md`
> Research: `context/changes/testing-session-boundary-regression/research.md`

## What & Why

Phase 2 of the test rollout (`test-plan.md` §3): a **regression net** for Risk #3
(silent save failure / data loss) and Risk #4 (wrong end-of-session summary).
After a completed session, its rows must be retrievable from the **real**
Supabase schema and a save failure must surface an error — never a silent
success; and the summary the parent judges progress by must be provably correct.

## Starting Point

The save handler (`sessions.ts:78-133`) already returns 500 on explicit errors,
so it is *not* a naive silent-200. But two structural gaps exist:
`ignoreDuplicates: true` makes a colliding-id write a 200 no-op, and the
non-transactional session/answers split allows a `finished_at`-stamped session
with zero answers. On the summary side, `summarize()` is pure and untested; the
per-type breakdown Risk #4 names is inline JSX in `DrillSession.tsx`. Vitest is
configured (Phase 1); there is **no `seed.sql`**, no testing-library, and tests
are not in CI yet.

## Desired End State

`npm run test` runs green with: unit tests pinning the tally and a new pure
`summarizeByType`; integration tests proving real-schema round-trip and
forced-error→500, plus explicitly-labelled **characterization** tests
documenting the two gaps; one RLS negative test; and a compile-time payload-type
guard. The cookbook (§6.2/§6.4) and a lessons entry are written, and the Risk #3
fix is flagged as a follow-up change.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Risk #3 gap handling | Characterize now; assert invariants that hold; fix is a separate change | Ships a green net without coupling to an unbuilt fix; captures the gap in code | Plan |
| Risk #4 breakdown | Extract pure `summarizeByType` into `exercises.ts` | Cheapest honest coverage, no DOM deps, keeps the oracle independent | Research + Plan |
| Test auth | Service-role client for setup/read; anon client for one RLS negative test | Deterministic fixtures while still covering RLS explicitly | Plan |
| Isolation | Unique ids per test + `afterEach` cleanup | Matches the app's UUID/idempotent design; safe under parallelism | Plan |
| Payload-type drift | Compile-time guard only, no runtime change | Catches schema/payload drift at typecheck, stays on-theme for a net | Plan |
| Integration when DB down | `describe.skip` with reason, not fail | Keeps `npm run test` green until the CI gate (Phase 5) makes it required | Plan |

## Scope

**In scope:** pure summary unit tests (`summarize`, `summarizeByType`); the
`summarizeByType` extraction + behavior-preserving `DrillSession` refactor;
real-schema integration suite (round-trip, forced-error, two characterization
tests, one RLS negative); `seed.sql`; integration client helper; payload-type
guard; cookbook §6.2/§6.4; lessons entry; follow-up flag.

**Out of scope:** fixing the ignore-duplicate/partial-write gap; CI wiring
(Phase 5); per-answer correctness & adaptive weighting (Phase 1/4); the full
IDOR matrix (Phase 4, beyond the one RLS sliver); refactoring production payload
types; adding `@testing-library/react`.

## Architecture / Approach

Cheapest-signal-first. **Phase 1** is pure unit work (no infra): extract the
breakdown helper, refactor the one inline render site, test against hand-counted
oracles. **Phase 2** stands up the integration harness against local Supabase —
service-role client for deterministic setup, anon client for RLS, unique-id
fixtures with `afterEach` cleanup, reachability skip-guard — and asserts today's
invariants while characterizing the gap. **Phase 3** is documentation/hand-off.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Summary correctness (unit) | Pure `summarizeByType` + tests for tally & breakdown | Refactor changes a rendered number |
| 2. Persistence net (integration) | Real-schema suite + characterization + RLS + type guard | Suite must skip (not fail) when DB is down; two client modes kept distinct |
| 3. Cookbook & hand-off | §6.2/§6.4 filled, lessons entry, fix follow-up, §3 complete | Gap mis-recorded as desired behavior |

**Prerequisites:** local Supabase CLI (`supabase start`); Phase-1 Vitest setup
(done); `.dev.vars` local URL/keys.
**Estimated effort:** ~2-3 sessions across the three phases (Phase 2 is the bulk).

## Open Risks & Assumptions

- The two characterization tests document **current** behavior; they will be
  flipped to assertions only when the Risk #3 fix lands (separate change).
- Assumes local Supabase service-role key is reachable via `.dev.vars`/env for
  the integration suite; the suite skips cleanly otherwise.
- The `DrillSession` refactor must be behavior-preserving — verified manually
  against the live results screen.

## Success Criteria (Summary)

- A completed session round-trips through the real schema; a save failure
  surfaces an error — both proven by a green integration suite.
- The overall and per-type summary numbers match a hand-counted oracle.
- The known Risk #3 gap is documented in code + lessons, with the fix flagged —
  not silently shipped as "correct."
