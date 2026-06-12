# Critical-Flow E2E (Risk #7) Implementation Plan

## Overview

Phase 3 of the test-plan rollout (`test-plan.md` §3). We are proving **Risk #7 —
Broken assembled session flow**: that a real user can _start_ a drill, _advance_
through every exercise, hit _auto-finish_, see the _summary_, and have the
session _saved_ — all in a real browser, where green unit/integration suites do
not prove the wired-together flow completes.

The deliverable is a single deterministic DOM-snapshot Playwright spec (driven by
`/10x-e2e`), preceded by a small production a11y fix that makes the one
un-addressable control reachable by role+name, followed by a CI gate that blocks
deploy on a broken completion flow, and closed by the §6.3 cookbook entry.

## Current State Analysis

- **The flow is a single React island with a synchronous state machine** —
  `DrillSession.tsx` drives `setup → active → finished`, **no auto-advance
  timers anywhere** (`research.md` §A). Every transition is a click. This is why
  DOM-snapshot e2e is the right tool: nothing to wait out; wait for the _result_
  of each click. `waitForTimeout` is never needed and is banned (CLAUDE.md).
- **Playwright is already fully configured** — `playwright.config.ts` (testDir
  `./e2e`, baseURL `:4321`, `chromium` project depends on a `setup` project,
  `webServer: npm run dev` with `reuseExistingServer: !CI`), storage-state auth
  in `e2e/auth.setup.ts` (signs in via `getByLabel("E-mail")` / `getByLabel("Hasło")`
  / `getByRole("button", { name: "Zaloguj się" })`, saves to
  `playwright/.auth/user.json`). `@playwright/test ^1.60.0`; `npm run test:e2e`
  → `playwright test`. **No e2e specs exist yet** — only `auth.setup.ts`.
- **`/drill` is a protected route** (`middleware.ts` `PROTECTED_ROUTES`), so the
  storage-state setup makes the spec signed-in automatically. Auth flow itself is
  out of test scope (`test-plan.md` §7) — we depend on the existing setup, we do
  not re-test sign-in.
- **One locator gap (the only one in the drill UI):** the letter→note option
  buttons wrap only `<Staff>` SVG with no accessible name
  (`LetterToNoteExercise.tsx:75-86`), so they cannot be targeted by role+name.
- **CI** (`.github/workflows/ci.yml`) runs on push/PR to `main`: a `ci` job
  (checkout → setup-node 22 → `npm ci` → `astro sync` → `lint` → `build` with
  `SUPABASE_URL`/`SUPABASE_KEY` secrets) and a `deploy` job that `needs: ci` and
  runs only on push to `main`. There is no test or e2e step today.
- **The integration suite (Phase 2) already owns persistence (Risk #3).** A 200
  from `POST /api/sessions` is **not** proof of persistence — `ignoreDuplicates:
  true` + non-transactional upserts make a silent partial write representable
  (`lessons.md`, `sessions.integration.test.ts`). The e2e must not re-litigate
  this beyond asserting the in-DOM "Zapisano" indicator.

### Key Discoveries

- **The single most likely way to write this e2e wrong:** auto-finish fires on
  the **"Dalej" press of the _last_ exercise, not on the last answer tap**.
  `handleNext` gates finish on `answers.length >= exerciseCount`
  (`DrillSession.tsx:126-140`). A test that stops after tapping the final answer
  never reaches the summary. The last "Dalej" is what advances to "Koniec sesji!".
- **Save is fire-and-forget and decoupled from the summary** — the summary
  renders immediately; the `POST /api/sessions` resolves in the background and
  surfaces only as "Zapisywanie…" → "Zapisano" (`SessionResults.tsx:77-94`).
  Assert "Zapisano" (or `waitForResponse` on the POST); never treat the summary
  appearing as proof of save.
- **Sessions interleave both exercise types** (balanced ceil/floor split — for
  count 5 that is 3/2), so a 5-card session always exercises both
  `note_to_letter` and `letter_to_note`. The loop must branch per card.
- **Locators are grounded** (`research.md` §E): count buttons
  `getByRole("button", { name: "5" })`; progress `getByText(/Ćwiczenie \d+ z \d+/)`;
  note→letter answers `getByRole("button", { name: "C"|"D"|"E"|"F"|"G"|"A"|"H" })`
  (note **`H`**, not `B`); advance `getByRole("button", { name: "Dalej" })`;
  summary `getByText("Koniec sesji!")`; accuracy `getByText(/\d+%/)` +
  `getByText("celność")`; per-type `getByText(/NUTA → LITERA/)` +
  `getByText(/LITERA → NUTA/)`; save `getByText("Zapisano")`; exit
  `getByRole("button", { name: "Gotowe" })` (→ `/dashboard`).

## Desired End State

`npm run test:e2e` runs a single drill-completion spec that signs in (via the
existing setup), starts a 5-exercise session, advances through all five branching
per card type, triggers auto-finish on the final "Dalej", asserts the summary
(heading, accuracy %, both per-type blocks) and the "Zapisano" save indicator,
exits via "Gotowe" to `/dashboard`, and cleans up the persisted session row in
`afterEach`. The letter→note option buttons carry a positional accessible name.
CI runs this spec on every PR to `main` and blocks `deploy` if it fails. `test-plan.md`
§6.3 documents how to add the next e2e test.

Verify: `npm run test:e2e` green locally and on a PR; the spec re-runs green
back-to-back (no residual rows, no collisions); `astro check` + `npm run lint`
clean after the component edit; the e2e check appears as a required gate on a PR.

### Key Discoveries

- Auto-finish requires the final **"Dalej"** click — see `DrillSession.tsx:126-140`.
- Save indicator text: `"Zapisywanie…"` → `"Zapisano"` (`SessionResults.tsx:77-94`).
- Per-test cleanup mirrors the integration pattern: service-role delete + FK
  cascade on `answers.session_id` (`test-plan.md` §6.2; `supabase-it.ts`).

## What We're NOT Doing

- **Not testing exercise correctness.** Click _any_ valid option to advance;
  never assert the answer was correct (that is Risk #1/#2/#4, covered at unit
  level — re-testing it here is the brittle anti-pattern in `test-plan.md` §2 #7).
- **Not re-covering persistence (Risk #3).** No `/history` round-trip, no DB
  read-back assertion in the e2e. We assert "Zapisano" only. Phase 2's
  integration suite owns the persistence schema gap.
- **Not re-testing the auth/sign-in flow** (`test-plan.md` §7). We consume the
  existing storage-state setup.
- **Not covering replay ("Jeszcze raz") or counts 10/20.** One happy path at
  count 5 (smallest, fastest, still hits both exercise types).
- **Not adding vision/multimodal review.** The flow is deterministic DOM; vision
  adds no signal here (CLAUDE.md DOM-is-default).
- **Not generalizing the a11y fix** beyond the letter→note option buttons. Other
  controls already have accessible names.

## Implementation Approach

Four phases, smallest-blast-radius first. Phase 1 (a11y fix) is a production
component edit that unblocks clean role+name locators and closes a real a11y
hole — it ships via `/10x-implement`. Phase 2 (the spec) is authored and verified
via **`/10x-e2e`** (the project's single source of truth for e2e workflow —
risk → seed test + rules → generate → review against the five anti-patterns →
re-prompt → verify), not `/10x-implement`. Phase 3 (CI gate) and Phase 4
(cookbook) ship via `/10x-implement`.

## Critical Implementation Details

**Timing & lifecycle (the load-bearing fact).** The auto-finish branch in
`handleNext` only fires on a "Dalej" click _after_ `answers.length` has reached
`exerciseCount`. The spec's loop must, for each of the 5 cards: detect type →
click an option → wait for "Dalej" to appear → click "Dalej". On the 5th card the
same "Dalej" click transitions to `finished`. Do not special-case the last card
by skipping its "Dalej"; the loop is uniform and the threshold does the work.

**a11y label must not leak the answer.** The letter→note exercise asks the child
to read a pitch off the staff. An `aria-label` containing the pitch (e.g. `"C4"`)
would speak the answer to screen-reader users, defeating the exercise. The label
must be **positional** (`"Nutka 1"`, `"Nutka 2"`, `"Nutka 3"`) — addressable and
honest, without revealing which card is correct.

---

## Phase 1: A11y locator fix (letter→note options)

### Overview

Give the three letter→note option buttons a positional accessible name so they
are reachable by role+name (and close the a11y hole), without leaking the
correct pitch.

### Changes Required:

#### 1. Letter→note option buttons

**File**: `src/components/drill/LetterToNoteExercise.tsx`

**Intent**: Add a positional `aria-label` to each option button so screen
readers and Playwright can address it by role+name, while keeping the exercise's
answer hidden.

**Contract**: In the `options.map(...)` callback (currently
`options.map((option) => …)` at line 57), add the index parameter and set
`aria-label={`Nutka ${i + 1}`}` on the `<button>` (line 75). The label is
positional (1-based), never the pitch or its letter. No other markup or styling
changes. Must satisfy `eslint-plugin-jsx-a11y` and `eslint-plugin-react-compiler`
(pure render — no new state, no side effects).

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type/build check passes: `npx astro sync && npm run build`
- Existing unit tests stay green: `npm run test`

#### Manual Verification:

- The three letter→note cards expose accessible names "Nutka 1/2/3" (verify in
  browser a11y inspector or VoiceOver) and none of the labels speak the pitch.
- The drill still renders and plays identically (no visual/behavioral change).

**Implementation Note**: After automated verification passes, pause for human
confirmation of the manual checks before Phase 2.

---

## Phase 2: Drill-completion e2e spec (via `/10x-e2e`)

### Overview

Author the single critical-flow spec that proves Risk #7. Generated, reviewed
against the five anti-patterns, and verified through `/10x-e2e` — not
`/10x-implement`.

### Changes Required:

#### 1. The spec

**File**: `e2e/drill-completion.spec.ts` (new)

**Intent**: Encode the start → advance → auto-finish → summary → save flow at
count 5, branching per card type, clicking any valid option (correctness out of
scope), and asserting the completion + "Zapisano".

**Contract**: One `test` in the `chromium` project (inherits storage-state auth).
Flow:

1. `await page.goto("/drill")`.
2. Click `getByRole("button", { name: "5" })`; wait for the first
   `getByText(/Ćwiczenie \d+ z \d+/)`.
3. Loop 5×: detect card type — `note_to_letter` if a letter button
   (`getByRole("button", { name: /^[CDEFGAH]$/ })`) is visible, else
   `letter_to_note` (caption `getByText("Znajdź tę nutkę")`, options now
   `getByRole("button", { name: /^Nutka [123]$/ })`). Click one valid option →
   `await expect(getByRole("button", { name: "Dalej" })).toBeVisible()` →
   click "Dalej".
4. Assert `getByText("Koniec sesji!")` visible, accuracy `getByText(/\d+%/)` +
   `getByText("celność")`, and **both** per-type blocks
   (`getByText(/NUTA → LITERA/)`, `getByText(/LITERA → NUTA/)`).
5. Assert `getByText("Zapisano")` (the save indicator; do not read `/history`).
6. Click `getByRole("button", { name: "Gotowe" })`; `await
   page.waitForURL("/dashboard")`.

Locators are role/label/text only — no CSS, XPath, or testid (CLAUDE.md). Never
`page.waitForTimeout`; wait on `toBeVisible` / `waitForURL` / `waitForResponse`.
Unique-by-nature: the session id is generated client-side per run, so parallel
runs and re-runs do not collide.

#### 2. Per-test cleanup

**File**: `e2e/drill-completion.spec.ts` (same file) + a small service-role
helper.

**Intent**: Delete the persisted session row after each run so the spec is
independent and leaves no residue (FK cascade removes its answers).

**Contract**: Capture the saved session id — either via
`page.waitForResponse` on `POST /api/sessions` and reading the request payload's
`id`, or by intercepting `crypto.randomUUID` is **not** available cross-process;
prefer the response/request route. In `afterEach`, delete that id with a
service-role Supabase client (reuse the `serviceClient()` factory from
`src/test/supabase-it.ts`, or a thin e2e-local equivalent reading
`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). Mirror the §6.2 isolation pattern:
register the id before asserting so cleanup runs even on assertion failure.

### Success Criteria:

#### Automated Verification:

- E2E passes locally: `npm run test:e2e` (with `E2E_EMAIL` / `E2E_PASSWORD` set
  and local Supabase reachable).
- Re-run is green back-to-back (`npm run test:e2e` twice) — proves cleanup +
  unique-id independence.
- Lint passes on the new spec: `npm run lint`.

#### Manual Verification:

- `/10x-e2e` review confirms the spec is clean against all five anti-patterns
  (no correctness assertions, no `waitForTimeout`, role/label/text locators, test
  independence + cleanup, no persistence re-litigation beyond "Zapisano").
- After a run, the DB has no leftover test session row (cleanup verified).
- Deliberately breaking the flow (e.g. temporarily skipping the final "Dalej")
  makes the spec fail — confirming it actually guards the completion path.

**Implementation Note**: Drive this phase with `/10x-e2e`, not `/10x-implement`.
Pause for human confirmation of the manual checks before Phase 3.

---

## Phase 3: CI e2e gate

### Overview

Run the drill-completion spec on every PR to `main` and block `deploy` on it.

### Changes Required:

#### 1. E2E job in CI

**File**: `.github/workflows/ci.yml`

**Intent**: Add an `e2e` job that installs Playwright browsers and runs the spec,
and make `deploy` depend on it so a broken completion flow blocks production.

**Contract**: New job `e2e` (Ubuntu, node 22, `npm ci`): step
`npx playwright install --with-deps chromium`, then `npm run test:e2e`. Env: the
Supabase vars the dev server needs (`SUPABASE_URL`, `SUPABASE_KEY`) plus
`E2E_EMAIL`, `E2E_PASSWORD`, and `SUPABASE_SERVICE_ROLE_KEY` (for `afterEach`
cleanup) — all from `secrets`. Update `deploy.needs` to `[ci, e2e]`. Upload the
Playwright HTML report as an artifact on failure (`actions/upload-artifact`,
`if: failure()`). Do **not** touch the existing `ci`/`deploy` Supabase secret
wiring beyond adding the new job. The `webServer` in `playwright.config.ts`
auto-starts `npm run dev` (with `reuseExistingServer: false` under CI), so no
separate server step is needed.

**Supabase-target decision (must be resolved before this job runs):** the e2e
`webServer` talks to whatever `SUPABASE_URL`/`KEY` point at. To avoid creating
and deleting rows in **production**, point the e2e job at a non-prod Supabase —
either a dedicated staging project (new secrets) or a local Supabase started in
the job (`supabase/setup-cli` + `supabase start`, matching the integration
tests' local-schema approach). The seeded test user (`E2E_EMAIL`/`E2E_PASSWORD`)
must exist there. Default recommendation: **local Supabase in CI** (no prod
pollution, consistent with §6.2), accepting the added job time. This is the
Phase 5 / infra boundary the test-plan flagged; we wire it here per the chosen
scope, but it depends on the seeded-user + Supabase-target setup being in place.

### Success Criteria:

#### Automated Verification:

- The workflow is valid YAML and the `e2e` job is reachable (push a branch / open
  a draft PR and observe the job run).
- On a PR, the `e2e` job runs `npm run test:e2e` and reports pass/fail.
- `deploy` lists both `ci` and `e2e` in `needs` and does not run when `e2e` fails.

#### Manual Verification:

- A PR shows the e2e check; a deliberately-broken flow turns the PR check red and
  blocks merge/deploy.
- The Playwright HTML report is downloadable from a failed run's artifacts.
- No test session rows accumulate in the targeted Supabase across CI runs.

**Implementation Note**: After automated verification passes, pause for human
confirmation that the secrets + Supabase target are correctly configured before
Phase 4.

---

## Phase 4: Cookbook + rollout note

### Overview

Fill the §6.3 e2e cookbook entry (currently `TBD`) and add the per-phase note so
the next contributor can add an e2e test without rediscovering the gotchas.

### Changes Required:

#### 1. §6.3 e2e cookbook entry

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.3 `TBD` with the concrete e2e pattern this phase
established.

**Contract**: Under §6.3, document: **when to use** (one critical user flow that
green unit/integration can't prove completes); **location/naming**
(`e2e/*.spec.ts`, storage-state auth via `e2e/auth.setup.ts`); **the auto-finish
gotcha** (advance via the final "Dalej", not the last answer tap); **locator
rule** (role/label/text only; the positional "Nutka N" labels from Phase 1);
**save-assertion boundary** ("Zapisano" only — no `/history`, persistence is
§6.2's job); **cleanup pattern** (service-role `afterEach` delete + FK cascade,
unique client-side ids); **run command** (`npm run test:e2e`; needs `E2E_EMAIL`/
`E2E_PASSWORD` + reachable Supabase); **reference test**
(`e2e/drill-completion.spec.ts`). Add a one-line §6.6 entry noting Phase 3 landed
the critical-flow e2e + CI gate.

### Success Criteria:

#### Automated Verification:

- Markdown formats cleanly: `npx prettier --check context/foundation/test-plan.md`
  (or `--write`).

#### Manual Verification:

- §6.3 no longer reads "TBD" and accurately describes
  `e2e/drill-completion.spec.ts` as the reference.
- A reader following §6.3 alone could add a second e2e test without re-reading
  this plan.

**Implementation Note**: After this phase, the §3 Phase 3 row is fully `[x]`;
mark it `complete` and let the orchestrator advance to Phase 4 (wedge + abuse).

---

## Testing Strategy

### Unit Tests

- None added. Phase 1's component edit must keep the existing
  `exercises.test.ts` / `pitch.test.ts` suites green (`npm run test`).

### Integration Tests

- None added. Persistence (Risk #3) stays owned by the Phase 2 integration suite;
  the e2e deliberately does not duplicate it.

### Manual Testing Steps

1. Run `npm run test:e2e` locally (with `E2E_EMAIL`/`E2E_PASSWORD` and local
   Supabase up) — spec passes; summary + "Zapisano" asserted; lands on
   `/dashboard`.
2. Run it again immediately — still green (cleanup + unique ids).
3. Temporarily skip the final "Dalej" in the spec → it fails (guards the
   completion path), then restore.
4. Inspect the targeted Supabase after a run — no leftover test session.
5. Open a PR — the `e2e` check runs; break the flow to confirm it blocks deploy.

## Performance Considerations

Count 5 keeps the spec to ~5 click→assert cycles with no timers — fast and
deterministic. CI `retries: 2` + `workers: 1` (already in
`playwright.config.ts`) absorb transient flake. Playwright browser install is the
main CI time cost; scoping to `chromium` keeps it minimal.

## Migration Notes

None. No schema or data changes. Phase 1 is a non-behavioral markup addition.

## References

- Research: `context/changes/critical-flow-e2e/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (Risk #7), §3 (Phase 3), §6.3
- Lessons: `context/foundation/lessons.md` (Risk #3 structural gap — why a 200 ≠ persisted)
- E2E workflow: `/10x-e2e` skill (five anti-patterns, seed pattern, prompt template)
- Auto-finish trigger: `src/components/drill/DrillSession.tsx:126-140`
- Save indicator: `src/components/drill/SessionResults.tsx:77-94`
- a11y target: `src/components/drill/LetterToNoteExercise.tsx:75-86`
- Existing e2e infra: `playwright.config.ts`, `e2e/auth.setup.ts`
- CI: `.github/workflows/ci.yml`
- Cleanup helper: `src/test/supabase-it.ts` (`serviceClient()`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: A11y locator fix (letter→note options)

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 0d86415
- [x] 1.2 Type/build check passes: `npx astro sync && npm run build` — 0d86415
- [x] 1.3 Existing unit tests stay green: `npm run test` — 0d86415

#### Manual

- [x] 1.4 Cards expose "Nutka 1/2/3" accessible names; none speak the pitch — 0d86415
- [x] 1.5 Drill renders and plays identically (no visual/behavioral change) — 0d86415

### Phase 2: Drill-completion e2e spec (via /10x-e2e)

#### Automated

- [x] 2.1 E2E passes locally: `npm run test:e2e`
- [x] 2.2 Re-run green back-to-back (cleanup + unique-id independence)
- [x] 2.3 Lint passes on the new spec: `npm run lint`

#### Manual

- [x] 2.4 `/10x-e2e` review confirms clean against all five anti-patterns
- [x] 2.5 No leftover test session row in the DB after a run
- [x] 2.6 Breaking the flow (skip final "Dalej") makes the spec fail

### Phase 3: CI e2e gate

#### Automated

- [ ] 3.1 Workflow valid; `e2e` job reachable and runs on a PR
- [ ] 3.2 `e2e` job runs `npm run test:e2e` and reports pass/fail
- [ ] 3.3 `deploy.needs` includes `ci` and `e2e`; deploy blocked when e2e fails

#### Manual

- [ ] 3.4 PR check goes red on a broken flow and blocks merge/deploy
- [ ] 3.5 Playwright HTML report downloadable from a failed run
- [ ] 3.6 No test session rows accumulate in the targeted Supabase

### Phase 4: Cookbook + rollout note

#### Automated

- [ ] 4.1 Markdown formats cleanly: `npx prettier --check context/foundation/test-plan.md`

#### Manual

- [ ] 4.2 §6.3 no longer reads "TBD" and names `drill-completion.spec.ts` as reference
- [ ] 4.3 A reader could add a second e2e test from §6.3 alone
