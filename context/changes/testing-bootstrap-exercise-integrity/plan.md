# Bootstrap Vitest + Exercise Integrity Implementation Plan

## Overview

Stand up the project's first test runner (Vitest) and lock the two
music-correctness invariants the product cannot ship without:

- **Risk #1 — Dead-end exercise**: every generated exercise is *winnable* — the
  correct answer is present in the options **and** consistent with the rendered
  note descriptor.
- **Risk #2 — Musically wrong note**: every beginner-range pitch maps to its
  musically-correct treble-clef staff position.

Both surfaces are pure, DOM-free, and seedable, so the cheapest layer (unit) is
the right layer. The defining constraint is **oracle discipline**: the expected
values come from a hand-written music-theory table in the test tree, never from
re-reading the production lookup tables (`PITCH_LETTER`, `STAFF_STEP`) — that
would make the test a tautology (test-plan §2 anti-pattern).

This is rollout Phase 1 of `context/foundation/test-plan.md`.

## Current State Analysis

- The project has **0 test files and no test dependencies** — no `vitest`, no
  config, no `test` script. Confirmed in `research.md`.
- Risk #1 lives in [`src/components/drill/exercises.ts`](src/components/drill/exercises.ts);
  the generator `buildSession(count, weights, rng)` (`exercises.ts:237`) takes an
  **injectable RNG**, so tests can drive it deterministically and sample across
  seeds. The two exercise directions are asymmetric: `letter_to_note` carries an
  explicit `options[]`; `note_to_letter` has an *implicit* 7-letter option set.
- Risk #2 lives in [`src/components/staff/pitch.ts`](src/components/staff/pitch.ts)
  + [`geometry.ts`](src/components/staff/geometry.ts). The chain is two pure
  stages: `pitchToStaffStep` (lookup table, `pitch.ts:44`) → `stepToY` (linear
  math, `geometry.ts:25`). `needsLedgerLine` (`pitch.ts:56`) bounds the ledger
  range.
- Both production mappings are **total `Record<Pitch, …>` tables** — TypeScript
  already guarantees completeness, so the only failure mode is a *wrong literal*,
  which only an independent oracle catches.
- Astro v6.3.1 exports `getViteConfig()` from `astro/config`; the app's Vite
  config (the `@/*` alias + `tailwindcss()` plugin) is embedded in
  [`astro.config.mjs`](astro.config.mjs). `tsconfig.json:9-11` defines `@/* →
  ./src/*`. CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) targets
  `main` and runs `astro sync` → `lint` → `build`.

## Desired End State

`npm run test` runs a green Vitest suite that fails if either music invariant
regresses. Specifically:

- A wrong row in `STAFF_STEP` or `PITCH_LETTER`, an inverted line/space, a ledger
  off-by-one, a distractor collision, or a too-short option set all make the suite
  go red — caught by an **independent** music-theory oracle, not a mirror of the
  code under test.
- The runner is wired through `getViteConfig()` so the `@/*` alias resolves and
  future phases can reach Astro/React modules without re-tooling.
- `test-plan.md` §6.1 is filled in as the canonical "how to add a unit test here"
  reference; the CI gate itself stays deferred to §3 Phase 5.

### Key Discoveries:

- `buildSession` is seedable via an injected `rng: () => number` — drive it with a
  fixed-seed PRNG for reproducible sampling (`exercises.ts:237`).
- The correct answer for `letter_to_note` is **structurally** spread into the
  options (`exercises.ts:213`); the test asserts the *invariant*, not the
  implementation, and additionally guards "exactly one correct" (`exercises.ts:198`).
- `note_to_letter` has no `options` field — its winnability reduces to
  `pitchToLetter(pitch) ∈ LETTERS`. A test that only inspects `.options` skips
  half the deck (`research.md` Architecture Insights).
- `STAFF_STEP` matches canonical treble theory exactly (lines E-G-B-D-F, spaces
  F-A-C-E, middle C one ledger below); `needsLedgerLine` uses `> 8` (not `>= 8`)
  so top-line F5 is correctly *not* ledgered (`pitch.ts:56`).
- The beginner range is exactly C4→A5 (13 pitches); `PITCHES` uses `B4`, the
  answer alphabet `LETTERS` uses `H` (Polish/German naming) — the single
  `B4 → "H"` row is the load-bearing oracle entry (`exercises.ts:76`).

## What We're NOT Doing

- No DB, no Supabase, no integration test — that is §3 Phase 2 (Risks #3/#4).
- No e2e / Playwright — that is §3 Phase 3 (Risk #7).
- No adaptive-weighting distribution test — that is §3 Phase 4 (Risk #5).
- No React/component (DOM) tests — Phase 1 surfaces are pure; no happy-dom/jsdom.
- No SVG snapshot of the staff — the pure math test is the cheaper, meaningful
  layer (test-plan §2 / §7).
- **No CI `test` step wiring** — naming the gate is done; *configuring* it is §3
  Phase 5. Phase 1 stops at the local runner + `test` script.
- No exporting of `letterToNoteOptions` — winnability is asserted through the real
  composed `buildSession` path (decision below).
- No edits to `eslint.config.js` — explicit `vitest` imports avoid a globals
  override.

## Implementation Approach

Four phases, each independently verifiable. Bootstrap the runner first
(verifiable green with zero tests), then land the simpler pure-math surface
(Risk #2) which *builds the shared music-theory oracle fixture*, then the more
involved seeded winnability surface (Risk #1) which *reuses* that oracle, then
fill in the cookbook.

**Key decisions (from research's open questions, confirmed by the user):**

| Decision | Choice |
|---|---|
| Reach option-gen logic | Through `buildSession` only — no new export |
| Vitest config style | `getViteConfig()` from `astro/config` |
| Vitest globals | Explicit `import { describe, it, expect } from "vitest"` |
| Test file layout | Co-located `*.test.ts` next to source |
| Sample budget | Fixed-seed PRNG, ~1000 exercises, + an all-13-pitches coverage assertion |

Because winnability is asserted through `buildSession` only (no direct
per-pitch enumeration), sampling is the *sole* path to every target pitch — so
the plan adds an explicit **coverage assertion** that every in-range pitch was
generated at least once, turning "all targets hit" from luck into a guarded
property.

The shared music-theory oracle is a single hand-written table living in a
test-support module (`src/test/music-oracle.ts`) — name, letter, staff step,
expected Y, ledger? — serving both risks without duplicating the production
tables. Test files co-locate; shared fixtures live under `src/test/`. This split
is documented in the cookbook so it's a convention, not an accident.

## Critical Implementation Details

- **`getViteConfig` test wiring.** `getViteConfig()` (from `astro/config`)
  resolves Astro's Vite config and accepts a Vitest `test` block. The non-obvious
  part is that it is async/Promise-returning in Astro v6 — export its result as
  the default; do not spread it synchronously. The Phase-1 targets only need
  `test.environment: "node"`; the `@/*` alias comes for free via the inherited
  Astro config.
- **Deterministic PRNG.** `buildSession`'s `rng` parameter is `() => number` in
  `[0,1)`. The test must supply a *seeded, reproducible* generator (a small pure
  PRNG such as mulberry32) so a failure is reproducible from the seed — never
  `Math.random`. This generator lives in the test-support tree, not production.
- **Bootstrap verification with no tests.** Phase 1 lands the config + script
  before any test exists; verify the runner with `npx vitest run
  --passWithNoTests` (exits 0, proves config + alias resolve). The committed
  `test` script is plain `vitest run` — once Phase 2 adds real tests the flag is
  unnecessary.

## Phase 1: Bootstrap the test runner

### Overview

Install Vitest, add a `vitest.config.ts` via `getViteConfig()`, add the `test`
script, and prove the runner executes and resolves the `@/*` alias — with no
test files yet.

### Changes Required:

#### 1. Test dependencies

**File**: `package.json`

**Intent**: Add Vitest as a dev dependency so the runner exists. No component
testing libraries yet (Phase 1 is pure-function only).

**Contract**: `vitest` appears under `devDependencies` at a version compatible
with Vite 7 (the project's transitive Vite). Lockfile updated.

#### 2. Vitest configuration

**File**: `vitest.config.ts` (new, repo root)

**Intent**: Wire Vitest through Astro's resolved Vite config so the `@/*` alias
and plugins are inherited; set the Node environment for pure-function tests.

**Contract**: Default-exports the result of `getViteConfig({ test: { environment:
"node" } })` from `astro/config`. The async return is exported directly.

```ts
import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: { environment: "node" },
});
```

#### 3. Test script

**File**: `package.json`

**Intent**: Provide the canonical `npm run test` entry point used by the cookbook
and (later) the CI gate.

**Contract**: `"test": "vitest run"` under `scripts`. (Watch mode is left to the
developer via `npx vitest`.)

### Success Criteria:

#### Automated Verification:

- Vitest installs cleanly: `npm install` succeeds
- Runner executes with no tests and resolves config: `npx vitest run --passWithNoTests` exits 0
- `npm run test` script is invokable (same command; with `--passWithNoTests` until Phase 2 adds tests)
- No build/type regression: `npx astro sync && npm run build` passes
- Lint passes: `npm run lint`

#### Manual Verification:

- Reviewer confirms `vitest.config.ts` uses `getViteConfig()` and that the `@/*`
  alias is inherited (not re-declared by hand)
- `.env` / `.dev.vars` are untouched and unreferenced by the test config

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Risk #2 — pitch-position integrity (+ shared oracle)

### Overview

Build the shared hand-written music-theory oracle and assert that every
beginner-range pitch maps to its musically-correct staff position and Y
coordinate, with correct ledger-line bounds.

### Changes Required:

#### 1. Shared music-theory oracle fixture

**File**: `src/test/music-oracle.ts` (new)

**Intent**: One independent, hand-written source of musical truth for the 13
beginner-range pitches, serving both risks. Written from music theory, **not**
copied from `STAFF_STEP` or `PITCH_LETTER`.

**Contract**: Exports a readonly table of 13 rows keyed by/ordered as `PITCHES`
(C4…A5), each row carrying: `pitch`, `letter` (note name, `H` for B4), `staffStep`
(theory value), `expectedY` (computed from the documented geometry constants, or
hand-stated), and `ledger` (boolean — true only for C4 and A5). Also exports the
seeded PRNG helper (mulberry32-style) used by Phase 3. The values are literal and
auditable; a reviewer can verify each against a treble staff.

#### 2. Pitch-position tests

**File**: `src/components/staff/pitch.test.ts` (new, co-located)

**Intent**: Prove `pitchToStaffStep` → `stepToY` produce the musically-correct
position for every beginner-range pitch, and that ledger bounds are exact.

**Contract**: Imports `{ describe, it, expect } from "vitest"`, the oracle, and
the functions under test (`pitchToStaffStep`, `stepToY`, `needsLedgerLine`).
Assertions:
- For each oracle row: `pitchToStaffStep(pitch) === row.staffStep` and
  `stepToY(pitchToStaffStep(pitch)) === row.expectedY`.
- Monotonicity: across adjacent `PITCHES`, `stepToY` strictly decreases (higher
  pitch → smaller Y) — catches any line/space inversion.
- Line/space parity: even step = line, odd = space.
- Ledger bounds: `needsLedgerLine(step)` is true for **exactly** C4 (−2) and
  A5 (10), false for the other 11 — guards the `> 8` (not `>= 8`) boundary.

### Success Criteria:

#### Automated Verification:

- Pitch suite runs green: `npm run test`
- Typecheck passes: `npx astro check` (or `npm run build`)
- Lint passes: `npm run lint`

#### Manual Verification:

- Reviewer confirms the oracle table is hand-written from music theory, not
  imported from `STAFF_STEP`/`PITCH_LETTER`
- Mutation sanity: temporarily flipping one `STAFF_STEP` literal (e.g. `G4: 3`)
  turns the suite red; revert after checking
- Reviewer confirms the ledger assertion fails if `> 8` is changed to `>= 8`

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 3: Risk #1 — exercise winnability

### Overview

Drive the real `buildSession` generator deterministically across `{5,10,20}`
counts to ~1000 exercises and assert every exercise is winnable, in both
directions, reusing the Phase-2 oracle for the independent letter mapping.

### Changes Required:

#### 1. Winnability tests

**File**: `src/components/drill/exercises.test.ts` (new, co-located)

**Intent**: Prove the winnability invariant holds for every generated exercise,
guard the "exactly one correct" and option-shape properties, and assert that
sampling reached every in-range pitch.

**Contract**: Imports `{ describe, it, expect } from "vitest"`, the oracle + seeded
PRNG, and `buildSession` + the exported domain constants (`PITCHES`, `LETTERS`,
`pitchToLetter`). The oracle's `letter` column — not `pitchToLetter` — is the
expected value for note naming. Driven with a fixed seed, ~1000 exercises total
across `{5,10,20}`. Per generated exercise:
- `note_to_letter`: the independent oracle letter for `pitch` is in `LETTERS`
  (i.e. the implicit 7-button set is answerable).
- `letter_to_note`: `options.length === 3`, 3 distinct pitches, 3 distinct
  letters (by oracle); `targetPitch ∈ options`; **exactly one** option has oracle
  letter `=== promptLetter`; `promptLetter` equals the oracle letter of
  `targetPitch` (prompt↔target consistency).
- **Coverage assertion**: the union of all targeted/rendered pitches across the
  ~1000-exercise sample equals all 13 `PITCHES` — fail if any pitch was never
  generated.

Run additionally with a non-empty `NoteWeights` to prove weighting changes
probability but never winnability.

### Success Criteria:

#### Automated Verification:

- Winnability suite runs green and deterministically: `npm run test` (stable
  across repeated runs — fixed seed)
- Full suite (Phase 2 + 3) under ~1s
- Typecheck passes: `npx astro check` (or `npm run build`)
- Lint passes: `npm run lint`

#### Manual Verification:

- Reviewer confirms the letter oracle is independent (the test does **not** call
  `pitchToLetter` for the expected value)
- Mutation sanity: a wrong `PITCH_LETTER` row (e.g. `B4 → "B"`) and a distractor
  regression (e.g. `.slice(0,1)`) each turn the suite red; revert after checking
- Reviewer confirms the coverage assertion fails if the sample budget is cut so a
  pitch is missed

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 4: Cookbook §6.1 + wrap-up

### Overview

Capture the conventions established above as the canonical "how to add a unit
test here" reference and close out the change.

### Changes Required:

#### 1. Cookbook §6.1

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `§6.1` "TBD" placeholder with the real pattern so future
contributors (and `/10x-tdd` in Lesson 2) can add a unit test without rediscovery.

**Contract**: §6.1 documents: location (co-located `*.test.ts`; shared fixtures
under `src/test/`), the explicit-`vitest`-import convention, the
oracle-discipline rule (hand-written music-theory table, never re-read the
production lookup), the winnability + pitch-position reference tests as exemplars,
and the `npm run test` command. The `§3 Phase 5` CI-gate deferral is noted.

#### 2. Change status

**File**: `context/changes/testing-bootstrap-exercise-integrity/change.md`

**Intent**: Reflect completion in the change identity file.

**Contract**: `status` and `updated` advanced per the change lifecycle.

### Success Criteria:

#### Automated Verification:

- §6.1 no longer contains "TBD — see §3 Phase 1": `grep -q "TBD — see §3 Phase 1" context/foundation/test-plan.md` returns non-zero
- Full suite still green: `npm run test`

#### Manual Verification:

- A reviewer can add a new unit test for a different pure function using §6.1
  alone, without reading this plan
- Reviewer confirms the oracle-discipline rule is stated explicitly in §6.1

**Implementation Note**: Final phase — confirm the full rollout-phase artifacts
are consistent before marking §3 Phase 1 `complete`.

---

## Testing Strategy

This change *is* the testing work; the "tests" here are the deliverables. The
meta-strategy:

### Unit Tests:

- Pitch-position: every beginner-range pitch → correct staff step + Y; monotonic
  ordering; line/space parity; exact ledger bounds (C4, A5 only).
- Winnability: ~1000 seeded exercises, both directions; target ∈ options; exactly
  one correct; 3-distinct option shape; prompt↔target consistency; all-13-pitches
  coverage; weighting-independence.

### Integration Tests:

- None in this phase (DB/persistence is §3 Phase 2).

### Manual Testing Steps:

1. Run `npm run test` twice — confirm identical green output (determinism).
2. Mutate one `STAFF_STEP` and one `PITCH_LETTER` literal — confirm each turns the
   relevant suite red, then revert.
3. Read §6.1 cold and add a throwaway unit test for another pure helper to confirm
   the cookbook is sufficient; discard it.

## Performance Considerations

The full suite must stay well under ~1s so the (later, §3 Phase 5) post-edit hook
and CI gate are cheap. The ~1000-exercise sample is fixed and deterministic — no
unbounded loops, no `Math.random`.

## Migration Notes

None — additive only (new dev dep, new config, new test files, one doc edit). No
production code, schema, or env changes.

## References

- Research: `context/changes/testing-bootstrap-exercise-integrity/research.md`
- Test plan (risks #1/#2, §2 anti-patterns, §6.1 cookbook target):
  `context/foundation/test-plan.md`
- Risk #1 surface: `src/components/drill/exercises.ts:237` (`buildSession`),
  `:203` (`letterToNoteOptions`), `:69-88` (`PITCH_LETTER`/`pitchToLetter`)
- Risk #2 surface: `src/components/staff/pitch.ts:27-58`,
  `src/components/staff/geometry.ts:14-27`
- Config inputs: `astro.config.mjs`, `tsconfig.json:9-11`,
  `.github/workflows/ci.yml`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Bootstrap the test runner

#### Automated

- [x] 1.1 Vitest installs cleanly (`npm install`) — e66b194
- [x] 1.2 Runner executes with no tests (`npx vitest run --passWithNoTests` exits 0) — e66b194
- [x] 1.3 `npm run test` script invokable — e66b194
- [x] 1.4 No build/type regression (`npx astro sync && npm run build`) — e66b194
- [x] 1.5 Lint passes (`npm run lint`) — e66b194

#### Manual

- [x] 1.6 Reviewer confirms `getViteConfig()` wiring + inherited `@/*` alias — e66b194
- [x] 1.7 `.env` / `.dev.vars` untouched by test config — e66b194

### Phase 2: Risk #2 — pitch-position integrity (+ shared oracle)

#### Automated

- [x] 2.1 Pitch suite runs green (`npm run test`) — b85692b
- [x] 2.2 Typecheck passes (`npx astro check` / build) — b85692b
- [x] 2.3 Lint passes (`npm run lint`) — b85692b

#### Manual

- [x] 2.4 Reviewer confirms oracle is hand-written, not imported from production tables — b85692b
- [x] 2.5 Mutation sanity: flipping a `STAFF_STEP` literal turns the suite red — b85692b
- [x] 2.6 Ledger assertion fails if `> 8` becomes `>= 8` — b85692b

### Phase 3: Risk #1 — exercise winnability

#### Automated

- [x] 3.1 Winnability suite green and deterministic (`npm run test`, stable on rerun) — fb35a63
- [x] 3.2 Full suite under ~1s — fb35a63
- [x] 3.3 Typecheck passes (`npx astro check` / build) — fb35a63
- [x] 3.4 Lint passes (`npm run lint`) — fb35a63

#### Manual

- [x] 3.5 Reviewer confirms letter oracle is independent (no `pitchToLetter` as expected value) — fb35a63
- [x] 3.6 Mutation sanity: wrong `PITCH_LETTER` row and distractor regression each turn suite red — fb35a63
- [x] 3.7 Coverage assertion fails if a pitch is starved from the sample — fb35a63

### Phase 4: Cookbook §6.1 + wrap-up

#### Automated

- [x] 4.1 §6.1 no longer contains "TBD — see §3 Phase 1"
- [x] 4.2 Full suite still green (`npm run test`)

#### Manual

- [x] 4.3 Reviewer can add a new unit test from §6.1 alone
- [x] 4.4 Oracle-discipline rule stated explicitly in §6.1
