# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-11

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in <area>"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/` (excludes `context/`,
`supabase/`, `public/`, build output).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                                                                                                 | Impact   | Likelihood | Source (evidence — not anchor)                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Dead-end exercise** — child is shown an exercise whose correct answer is missing from the options, or the rendered note doesn't match any offered option, so the exercise is unwinnable                                               | High     | High       | interview Q1; PRD guardrail "musical accuracy is non-negotiable"; FR-004/FR-005; hot-spot dir `src/components/drill/` (31 commits/30d)                                        |
| 3   | **Silent save failure / data loss** — child finishes a session but results never persist; parent sees no progress, adaptive history is starved                                                                                          | High     | Med-High   | interview Q2 (already burned in prod) + Q3; NFR "no silent data loss"; hot-spot dir `src/pages/api/` (10 commits/30d)                                                         |
| 7   | **Broken assembled session flow** — every piece passes in isolation, but the wired-together drill can't actually be _completed_ in the browser: feedback never advances, auto-finish doesn't fire, or the summary/save is never reached | High     | Med-High   | interview Q3 + user e2e request; US-01 (north star); PRD primary success criterion; hot-spot dir `src/components/drill/` (31 commits/30d)                                     |
| 2   | **Musically wrong note** — a note renders one line/space off, teaching the child the wrong pitch even when an option is selectable                                                                                                      | High     | Med        | PRD guardrail; FR-004/FR-005; roadmap F-02 (top blocker = notation skills); hot-spot dir `src/components/staff/` (5 commits/30d)                                              |
| 4   | **Wrong end-of-session summary** — correct/incorrect counts or per-type breakdown are miscomputed; the number the parent judges progress by is wrong                                                                                    | Med-High | Med-High   | interview Q3; FR-008, FR-009; hot-spot dir `src/components/drill/` (31 commits/30d)                                                                                           |
| 5   | **Adaptive selection silently degrades to random** — weighting toward missed notes stops working; the product wedge quietly disappears                                                                                                  | Med      | Med        | interview Q3; FR-003; roadmap "product wedge"; hot-spot dir `src/components/drill/` (31 commits/30d)                                                                          |
| 6   | **Cross-family data exposure (IDOR)** — the sessions endpoint read or delete checks "logged in" but not "owns this row," so one family reaches another's session data                                                                   | Med      | Low-Med    | abuse lens (auth + persisted user data present); archive `2026-06-10-session-history-ux/` (delete = first destructive action); hot-spot dir `src/pages/api/` (10 commits/30d) |

Risk numbers are stable identities referenced by §3; rows are ordered by
impact × likelihood, not by number. Protect Risk #1 (High × High) first.

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                      | Must challenge                                                  | Context `/10x-research` must ground                                                                                  | Likely cheapest layer                                           | Anti-pattern to avoid                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| #1   | For _every_ generated exercise, the correct answer is present in the options **and** matches the rendered note descriptor                        | "Non-empty options array = valid exercise"                      | The exercise-generation entry point; how the correct answer and the option set are produced and related              | unit (pure generator)                                           | Asserting the option set equals what the generator currently returns (implementation mirror) — assert the invariant instead |
| #3   | After a completed session, its rows are retrievable from the **real** schema; a save failure surfaces an error, never a silent success           | "HTTP 200 / no exception thrown = persisted"                    | The persistence boundary to Supabase; what a failed insert does; whether the deployed schema is asserted, not mocked | integration (real seeded Supabase, no schema mock)              | Mocking the Supabase client so the test passes without the schema — the exact gap that broke prod (Q2)                      |
| #7   | A real session can be started, advanced through every exercise, auto-finished, with the summary rendered and persisted                           | "All unit/integration tests pass = a user can finish a session" | The session lifecycle entry point; auto-finish trigger; how the completed session reaches persistence                | e2e (one critical flow, DOM-snapshot, via `/10x-e2e`)           | Re-testing exercise _correctness_ inside the e2e (brittle; that is #1/#2/#4) — keep it to the flow                          |
| #2   | A known note (e.g. a treble-clef reference pitch) maps to its musically-correct staff position; the oracle comes from music theory, not the code | "It looks like a note = it is at the correct position"          | The pitch → staff-coordinate mapping; the beginner range (first lower to first upper ledger line)                    | unit (pure pitch/geometry); optional deterministic SVG snapshot | A golden snapshot nobody verified is musically correct (snapshot-without-meaning)                                           |
| #4   | Given a hand-counted answer sequence, the summary counts and per-type breakdown match the independent total                                      | "It is a number = it is the right number"                       | How answers are aggregated into the summary; per-type breakdown source                                               | unit (pure aggregation)                                         | Computing the expected value with the same reduce the code uses (oracle problem / tautology)                                |
| #5   | Over many seeded draws, the distribution skews toward missed notes (~70/30 per FR-003) and every drawn exercise is still valid (#1)              | "Exercises were returned = selection is adaptive"               | The answer-history window the algorithm reads; the weighting contract                                                | unit (seeded selection)                                         | Asserting an exact sequence (brittle to any RNG change) instead of the distribution property                                |
| #6   | User A receives a 403/404 — not data — when reading or deleting user B's session                                                                 | "Authenticated = authorized"                                    | Ownership check on the sessions endpoint; whether row-level ownership is enforced server-side                        | integration (auth + DB, cross-user negative case)               | Happy-path-only (testing only your own sessions and assuming authorization)                                                 |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                      | Goal (one line)                                                                                      | Risks covered | Test types                       | Status      | Change folder                                                    |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------- | -------------------------------- | ----------- | ---------------------------------------------------------------- |
| 1   | Bootstrap + exercise integrity  | Stand up the runner; prove every generated exercise is winnable and musically correct (no DB needed) | #1, #2        | unit                             | complete    | context/archive/2026-06-11-testing-bootstrap-exercise-integrity/ |
| 2   | Session-boundary regression net | Lock summary correctness and session persistence against the real schema, however composition churns | #3, #4        | unit + integration               | complete    | context/changes/testing-session-boundary-regression/             |
| 3   | Critical-flow e2e               | Prove a real user can start, complete, and persist a drill session                                   | #7            | e2e (Playwright, via `/10x-e2e`) | not started | —                                                                |
| 4   | Wedge + abuse coverage          | Adaptive weighting holds; no cross-family session access                                             | #5, #6        | seeded unit + integration        | not started | —                                                                |
| 5   | Quality-gates wiring            | Add test + e2e gates to CI; migration smoke; recommend local hook                                    | cross-cutting | gates                            | not started | —                                                                |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened`
→ `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer                       | Tool                                                               | Version                   | Notes                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| unit + integration          | Vitest                                                             | none yet — see §3 Phase 1 | Astro/Vite-native runner; nothing configured yet (0 test files, no test deps)                                                                                |
| component (React islands)   | @testing-library/react + happy-dom/jsdom                           | none yet — see §3 Phase 1 | for drill UI islands; only where a pure-function test cannot reach the behavior                                                                              |
| integration (DB)            | Vitest + local Supabase CLI                                        | none yet — see §3 Phase 2 | run against the real local schema (`supabase start`), never a schema mock — that is what hid the Q2 prod gap                                                 |
| e2e                         | Playwright                                                         | none yet — see §3 Phase 3 | DOM-snapshot default; driven by `/10x-e2e`; `getByRole`/`getByLabel`/`getByText` locators; never `waitForTimeout`                                            |
| (optional) AI-native visual | multimodal visual review of the staff screen — checked: 2026-06-11 | n/a                       | When NOT to use: pixel regression (use a deterministic SVG snapshot), or when the pitch unit test (#2) already asserts position. Selective — one screen only |

**Stack grounding tools (current session):**

- Docs: Context7 docs MCP — available; can ground current Vitest / Playwright / Astro test-setup APIs and version-specific config; checked: 2026-06-11
- Search: Exa.ai web search — available; for tool-status/discovery only, then prefer official docs; checked: 2026-06-11
- Runtime/browser: Claude Preview + computer-use browser automation — available as a verification surface, but Playwright is the deterministic e2e tool of record; checked: 2026-06-11
- Provider/platform: no dedicated Supabase / Cloudflare / GitHub MCP in session; `gh` CLI and local `supabase` CLI present and used for the §5 gates; checked: 2026-06-11

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase N" means the gate is enforced once that rollout
phase lands; before that it is `planned`.

| Gate                                    | Where                | Required?                                                  | Catches                                                           |
| --------------------------------------- | -------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| lint + typecheck                        | local + CI           | required (already wired: `eslint` + `astro check`/`build`) | syntactic / type drift                                            |
| unit                                    | local + CI           | required after §3 Phase 1                                  | logic regressions in generation, summary, staff pitch             |
| integration (DB)                        | local + CI           | required after §3 Phase 2                                  | silent save / persistence regressions against the real schema     |
| e2e on critical flow (drill completion) | CI on PR             | required after §3 Phase 3                                  | broken session-completion path                                    |
| supabase migrations applied (`db push`) | CI deploy            | required (already wired)                                   | prod schema drift — the Q2 burn                                   |
| post-deploy schema smoke                | between merge + prod | optional — see §3 Phase 5                                  | environment-specific persistence failures the local run can't see |
| post-edit hook (run unit on edit)       | local (agent loop)   | recommended after §3 Phase 1                               | regressions at edit time                                          |
| deterministic SVG snapshot of staff     | CI on PR             | optional                                                   | staff rendering regressions                                       |
| multimodal visual review of staff       | CI on PR             | optional (selective, 1 screen)                             | musical-layout issues a classic diff misses                       |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test

**When to use this layer**: for pure functions that take inputs and return
outputs with no DOM, DB, or network involvement. This covers exercise
generation, pitch-to-staff-position math, summary aggregation, and any other
logic you can invoke directly with a JS function call.

#### Location

- **Co-locate** the test file next to the source file:
  `src/components/drill/exercises.test.ts` alongside `exercises.ts`,
  `src/components/staff/pitch.test.ts` alongside `pitch.ts`, etc.
- **Shared fixtures** (oracle tables, helper PRNGs, shared constants) live under
  `src/test/` — one file per concern, not per consumer.
  - Current fixture: `src/test/music-oracle.ts` — the hand-written 13-pitch
    music-theory table (oracle + seeded PRNG) shared by both test suites.

#### Import convention

Use **explicit Vitest imports** — no global test functions. Every test file
starts with:

```ts
import { describe, it, expect } from "vitest";
```

Do not add `globals: true` to `vitest.config.ts`; this project deliberately
avoids it to keep imports self-documenting and ESLint-friendly.

#### Oracle discipline (mandatory)

The expected value in every assertion must come from an **independent
source** — never from re-reading the production lookup table you are testing.
Re-reading the production table produces a tautology: the test passes even
when the table is wrong.

**Rule**: write the expected value by hand, from domain knowledge (music
theory, PRD contract, spec), and put it in `src/test/` or inline in the test.
Never call the production mapping function to compute what it should return.

Examples of what this looks like in practice:

| Risk              | Oracle source                                                                     | Anti-pattern (do NOT do)                                  |
| ----------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------- |
| #2 pitch position | `src/test/music-oracle.ts` `staffStep` column, hand-verified against treble staff | `expect(pitchToStaffStep("G4")).toBe(STAFF_STEP["G4"])`   |
| #1 winnability    | `src/test/music-oracle.ts` `letter` column                                        | `expect(pitchToLetter(pitch)).toBe(pitchToLetter(pitch))` |

#### Running tests

```bash
npm run test          # runs all test files once (Vitest)
npx vitest            # watch mode during development
```

The runner is wired via `vitest.config.ts` → `getViteConfig()` (from
`astro/config`), so the `@/*` import alias is inherited automatically — no
path mapping to maintain.

#### Reference tests

- **Pitch-position** (`src/components/staff/pitch.test.ts`) — tests
  `pitchToStaffStep`, `stepToY`, `needsLedgerLine` against every one of the 13
  beginner-range pitches using the music-theory oracle. Also asserts
  monotonicity (higher pitch → smaller Y) and exact ledger bounds.
- **Winnability** (`src/components/drill/exercises.test.ts`) — drives
  `buildSession` with a fixed-seed PRNG across ~1 000 exercises; asserts every
  exercise is winnable (correct answer present in options for `letter_to_note`;
  oracle letter in `LETTERS` for `note_to_letter`), exactly one correct option,
  3-distinct option shapes, and that all 13 pitches are reached.

Use these as templates for new pure-function tests in this codebase.

#### CI gate

Not yet wired — see §3 Phase 5. Until then, run `npm run test` locally before
opening a PR.

### 6.2 Adding an integration test

**When to use this layer**: for persistence boundaries — Supabase reads/writes,
RLS assertions, and anything where a schema mock would hide the production gap
(the Q2 burn was exactly this). Run against the real local schema; never a mock.

#### Prerequisites

- `supabase start` must be running.
- `.dev.vars` must contain `SUPABASE_SERVICE_ROLE_KEY` (in addition to
  `SUPABASE_URL` and `SUPABASE_KEY`).

#### Location

- **Co-locate** the test file next to the source or handler under test:
  `src/pages/api/sessions.integration.test.ts` alongside `sessions.ts`.
- The `.integration.test.ts` suffix marks the file as DB-dependent (easier to
  filter / grep than a nested folder).
- **Shared fixtures** live in `src/test/` — specifically:
  - `src/test/supabase-it.ts` — shared client helper (service-role, anon, and
    signed-in clients + reachability guard).

#### Import convention

Same as §6.1 — explicit Vitest imports at the top of every file:

```ts
import { describe, it, expect, afterEach } from "vitest";
```

#### Client modes

Two client modes in `supabase-it.ts` — keep them visibly distinct:

| Mode         | Factory                                      | Key                         | RLS      | Use for                         |
| ------------ | -------------------------------------------- | --------------------------- | -------- | ------------------------------- |
| Service-role | `serviceClient()`                            | `SUPABASE_SERVICE_ROLE_KEY` | bypassed | fixture setup, reads, admin API |
| Anon/user    | `anonClient()` / `signedInClient(email, pw)` | `SUPABASE_KEY`              | enforced | RLS negative tests only         |

**Rule**: never use `serviceClient()` where RLS is under test — the test would
pass vacuously.

#### Reachability skip guard

Gate the entire suite on reachability at module level (top-level `await`), then
feed the result to `describe.skipIf`. This keeps `npm run test` green for
contributors who haven't run `supabase start`:

```ts
import { isLocalSupabaseReachable } from "@/test/supabase-it";

const reachable = await isLocalSupabaseReachable();
describe.skipIf(!reachable)("my suite (integration — skipped without local Supabase)", () => {
  // ...
});
```

#### Isolation pattern

Per-test unique UUIDs + `afterEach` cleanup. FK cascade on `answers.session_id`
removes answers automatically when a session is deleted:

```ts
const sessionIds = new Set<string>();

afterEach(async () => {
  for (const id of sessionIds) {
    await svc.from("sessions").delete().eq("id", id);
  }
  sessionIds.clear();
});
```

Add the id **before** the insert so cleanup runs even when the insert fails.

#### Seed data

`supabase/seed.sql` inserts a known-UUID owner row
(`00000000-0000-0000-0000-000000000001`). Stable across `supabase db reset`;
service-role fixture writes can reference it without signing in.

For the RLS negative test, create short-lived users via `svc.auth.admin.createUser()`
and delete them in a `finally` block — do not rely on the seed user for RLS tests.

#### Running tests

```bash
supabase start          # start local Supabase first
npm run test            # runs unit + integration (integration skipped if Supabase not running)
supabase db reset       # re-applies seed.sql and all migrations; safe between test runs
```

#### Reference test

`src/pages/api/sessions.integration.test.ts` — covers round-trip persistence,
forced CHECK-violation error surface, two characterization tests documenting the
Risk #3 structural gap (see `context/foundation/lessons.md`), and an RLS negative
test using `signedInClient`.

#### CI gate

Not yet wired — see §3 Phase 5. Until then, run integration tests locally with
`supabase start` before `npm run test`.

### 6.3 Adding an e2e test

- TBD — see §3 Phase 3 (drill-completion critical flow, driven by `/10x-e2e`).

### 6.4 Adding a test for a new API endpoint

**When to use this layer**: any Astro API route (`src/pages/api/`) that persists
to Supabase. Test two concerns separately:

1. **Compile-time payload-type guard** — assert the local payload interface stays
   assignable to the generated `database.types.ts` Insert types, so shape drift
   fails `astro check` before it reaches the DB.
2. **Persistence assertions** — integration tests that exercise the real schema
   (see §6.2 for the full integration setup).

#### Payload-type guard

Add a structural type assertion alongside the integration suite (or in a dedicated
`.test-d.ts` file). The assertion should verify that the handler's local payload
interface is assignable to the generated `Database["public"]["Tables"][…]["Insert"]`
type, failing `astro check` on drift — no runtime change:

```ts
import type { Database } from "@/db/database.types";

type SessionsInsert = Database["public"]["Tables"]["sessions"]["Insert"];
// Fails astro check if SessionPayload adds a field the schema doesn't know about
// or changes a field type — fix sessions.ts, not this guard.
type _sessionGuard = Pick<SessionPayload, keyof SessionsInsert> extends never ? never : true;
```

#### Persistence pattern

Follow §6.2 — service-role client for setup/read, signed-in anon client for the
RLS negative case, unique UUIDs + `afterEach` cleanup. The sessions endpoint
integration suite at `src/pages/api/sessions.integration.test.ts` is the reference.

Key invariants to assert for any new endpoint:

- A valid write round-trips: the row is readable after the write with the correct
  field values.
- A CHECK/RLS violation returns a non-null error (never a silent success).
- Characterize any no-op or partial-write surface with a `[characterization]`-prefixed
  test name + comment citing the relevant `lessons.md` entry.

See §3 Phase 4 for the full cross-user ownership / IDOR matrix (Risk #6).

### 6.5 Adding a test for the adaptive selection algorithm

- TBD — see §3 Phase 4 (seeded weighting-distribution assertion, oracle from the FR-003 ~70/30 contract).

### 6.6 Per-rollout-phase notes

- (Filled in as phases land.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Auth flows (sign-in / sign-up)** — Supabase stock email-password + OAuth; a
  trusted library with low marginal signal. **Distinction:** this excludes the
  login/signup _flow_, NOT authorization on the sessions endpoint — that is
  Risk #6, which stays in scope via §3 Phase 4. Re-evaluate if we add custom
  auth logic, role separation, or our own session/token handling. (Source:
  Phase 2 interview Q5.)
- **A full AI-native / vision test layer** — no dedicated AI-native rollout
  phase: a deterministic pitch unit test (#2) plus an SVG snapshot catches the
  staff regression more cheaply than a vision model. A selective multimodal
  review of the single staff screen is retained as an _optional_ supplement
  only (§4, §5). Re-evaluate if a visual-only regression (z-index, animation,
  layout) surfaces that deterministic tools cannot catch. (Source: synthesis
  cost × signal.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-11
- Stack versions last verified: 2026-06-11
- AI-native tool references last verified: 2026-06-11

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
