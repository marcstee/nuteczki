# Critical-Flow E2E (Risk #7) — Plan Brief

> Full plan: `context/changes/critical-flow-e2e/plan.md`
> Research: `context/changes/critical-flow-e2e/research.md`

## What & Why

Phase 3 of the test-plan rollout: prove **Risk #7 — Broken assembled session
flow**. Every drill piece passes in isolation, but green unit/integration suites
do not prove the wired-together drill can actually be _completed_ in a browser
(feedback never advances, auto-finish never fires, summary/save never reached).
One deterministic DOM-snapshot Playwright spec closes that gap.

## Starting Point

The drill is a single React island with a synchronous `setup → active → finished`
state machine and **no timers**. Playwright + storage-state auth are already
fully configured (`playwright.config.ts`, `e2e/auth.setup.ts`); `/drill` is a
protected route, so the spec runs signed-in. **No e2e specs exist yet** — only
the auth setup. CI runs lint + build on PRs to `main` with no test step.

## Desired End State

`npm run test:e2e` runs a spec that starts a 5-exercise session, advances through
all five (branching per card type), auto-finishes on the final "Dalej", asserts
the summary + "Zapisano" save indicator, exits to `/dashboard`, and cleans up its
persisted row. The one un-addressable control has a positional accessible name.
CI runs the spec on every PR and blocks deploy on failure. §6.3 cookbook documents
the pattern.

## Key Decisions Made

| Decision                | Choice                                      | Why (1 sentence)                                                                 | Source   |
| ----------------------- | ------------------------------------------- | -------------------------------------------------------------------------------- | -------- |
| Persistence assertion   | "Zapisano" indicator only                   | Risk #3 is owned by Phase 2 integration; a `/history` round-trip would re-cover it and add flake | Research |
| Test cleanup            | Service-role `afterEach` delete             | Reuses `supabase-it.ts`; FK cascade clears answers; leaves no residue across runs | Plan     |
| a11y locator gap        | Fix inline (positional `aria-label`)        | Closes a real a11y hole and unblocks role+name locators — **positional, not pitch, so it doesn't leak the answer** | Plan     |
| Flow coverage           | One happy path at count 5 + exit            | Smallest deterministic flow that still hits both exercise types (3/2 split)       | Research |
| CI gate                 | Wire the e2e gate now (own job, blocks deploy) | User chose immediate enforcement over deferring to Phase 5                        | Plan     |
| Save = persisted?       | No — assert "Zapisano" but not DB read-back | A 200 ≠ persisted (`lessons.md` Risk #3 gap); the e2e proves the _flow_, not the schema | Research |

## Scope

**In scope:** positional a11y label on letter→note options; one drill-completion
e2e spec (count 5, both card types, auto-finish, summary, "Zapisano", exit);
service-role cleanup; CI e2e job blocking deploy; §6.3 cookbook entry.

**Out of scope:** exercise correctness; persistence/`/history` re-testing;
auth-flow testing; replay ("Jeszcze raz") and counts 10/20; vision/multimodal.

## Architecture / Approach

Four phases, smallest blast radius first. **Phase 1** edits the production
`LetterToNoteExercise` component (via `/10x-implement`) to add positional
`aria-label`s. **Phase 2** authors `e2e/drill-completion.spec.ts` **via
`/10x-e2e`** (the project's single source of truth for e2e — generate → review
against the five anti-patterns → verify), not `/10x-implement`. **Phase 3** adds a
CI `e2e` job and gates `deploy` on it. **Phase 4** fills §6.3.

## Phases at a Glance

| Phase                       | What it delivers                                  | Key risk                                                              |
| --------------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| 1. A11y locator fix         | Positional `aria-label` on letter→note options    | Leaking the pitch in the label (mitigated: positional "Nutka N")     |
| 2. Drill-completion e2e     | The critical-flow spec (via `/10x-e2e`)           | Stopping after the last answer instead of the last "Dalej" (no finish) |
| 3. CI e2e gate              | `e2e` job blocking deploy + secrets               | E2E hitting **prod** Supabase — must target staging/local Supabase   |
| 4. Cookbook + rollout note  | §6.3 e2e entry + §6.6 note                         | Drift from the actual spec                                            |

**Prerequisites:** `E2E_EMAIL`/`E2E_PASSWORD` for a seeded test user; reachable
(non-prod) Supabase for local runs and CI; `SUPABASE_SERVICE_ROLE_KEY` for cleanup.
**Estimated effort:** ~2 sessions across 4 phases (Phase 2 the bulk via `/10x-e2e`).

## Open Risks & Assumptions

- **CI Supabase target is undecided.** Wiring the gate now (per your choice)
  crosses into Phase 5's infra remit; the e2e `webServer` will hit whatever
  `SUPABASE_URL` points at. Resolve before Phase 3 runs: point at a staging
  project or start local Supabase in the job (recommended). Otherwise CI creates
  and deletes rows in production.
- Assumes a seeded test user exists in the targeted Supabase (referenced by
  `auth.setup.ts`).
- The positional `aria-label` ("Nutka N") makes options addressable but does not
  identify the _correct_ one — fine for this flow test; a future correctness e2e
  would need a different scheme.

## Success Criteria (Summary)

- A real user (the spec) starts, completes, and saves a drill; the summary and
  "Zapisano" render; landing on `/dashboard`.
- The spec re-runs green back-to-back with no residual data; breaking the
  completion flow turns it red.
- CI blocks deploy when the completion flow is broken.
