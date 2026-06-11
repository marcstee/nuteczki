# Bootstrap Vitest + Exercise Integrity — Plan Brief

> Full plan: `context/changes/testing-bootstrap-exercise-integrity/plan.md`
> Research: `context/changes/testing-bootstrap-exercise-integrity/research.md`

## What & Why

Stand up the project's first test runner (Vitest) and lock the two
music-correctness invariants the app cannot ship without: **every generated
exercise is winnable** (Risk #1) and **every beginner-range pitch renders at its
musically-correct staff position** (Risk #2). These are the High-impact risks the
PRD guardrail ("musical accuracy is non-negotiable") and the interview both
flagged. This is rollout Phase 1 of `context/foundation/test-plan.md`.

## Starting Point

The project has **0 test files and no test dependencies** today. Both risk
surfaces are already written pure and render-free with an injectable RNG
(`buildSession`) — the accuracy-critical logic is isolated from React/Astro, so
the cheapest layer (unit) reaches everything with no DOM, DB, or browser.

## Desired End State

`npm run test` runs a green, sub-second Vitest suite that goes **red** if any
music literal regresses — a wrong staff-step, an inverted line/space, a ledger
off-by-one, a missing/colliding option, or a broken prompt↔answer mapping. The
expected values come from an independent, hand-written music-theory oracle, so
the tests catch real bugs rather than mirroring the code. The cookbook (§6.1)
documents the pattern for every future unit test.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Reach option-gen logic | Through `buildSession` only | Tests the real composed path; keeps `exercises.ts` public surface minimal | Plan |
| Vitest config style | `getViteConfig()` from `astro/config` | Inherits the app's `@/*` alias + plugins; future island tests get them free | Plan |
| Vitest globals | Explicit `vitest` imports | No `eslint.config.js` globals override needed | Plan |
| Test file layout | Co-located `*.test.ts`; shared fixtures in `src/test/` | Idiomatic Vitest; test sits beside the code it guards | Plan |
| Sample budget | Fixed-seed PRNG, ~1000 exercises + coverage assertion | Reproducible; coverage assertion makes "all 13 pitches hit" guaranteed, not lucky | Plan |
| Oracle discipline | Hand-written music-theory table | Re-reading `PITCH_LETTER`/`STAFF_STEP` would make the test a tautology (§2 anti-pattern) | Research |

## Scope

**In scope:** Vitest bootstrap (dep, `vitest.config.ts`, `test` script); Risk #2
pitch-position unit tests; Risk #1 winnability unit tests; shared music-theory
oracle fixture; cookbook §6.1.

**Out of scope:** DB/integration (Phase 2), e2e (Phase 3), adaptive weighting
(Phase 4), CI `test`-step wiring (Phase 5), React/component DOM tests, SVG
snapshots, exporting `letterToNoteOptions`, `eslint.config.js` edits.

## Architecture / Approach

One shared hand-written oracle table (13 pitches: name, letter, staff step,
expected Y, ledger?) lives in `src/test/music-oracle.ts` and feeds both test
files. Phase 2 (pitch) builds it; Phase 3 (winnability) reuses its `letter`
column. A seeded mulberry32-style PRNG drives `buildSession` deterministically.
Neither test imports the production lookup tables as expected values.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Bootstrap runner | `vitest.config.ts` via `getViteConfig()`, `test` script, green empty run | `getViteConfig()` async wiring / alias resolution |
| 2. Risk #2 pitch-position | Shared oracle + pitch→step→Y + ledger tests | Oracle accidentally mirroring `STAFF_STEP` |
| 3. Risk #1 winnability | ~1000 seeded exercises, both directions, coverage assertion | Sampling missing a target pitch (mitigated by coverage assert) |
| 4. Cookbook §6.1 | Canonical "add a unit test here" doc + change close-out | Doc drifting from the actual convention |

**Prerequisites:** None beyond the current repo state (research complete, runner absent).
**Estimated effort:** ~1 session across 4 small phases.

## Open Risks & Assumptions

- `getViteConfig()` returns a Promise in Astro v6 — exported directly as default;
  if the inherited Tailwind plugin causes startup friction, fall back to a minimal
  alias-only config (research's original lean recommendation).
- The coverage assertion couples the test to the generator's reachability; a
  legitimate future weighting change that starves a pitch would fail it loudly —
  treated as signal, not flake.

## Success Criteria (Summary)

- `npm run test` is green, deterministic, and sub-second.
- Flipping any single `STAFF_STEP` or `PITCH_LETTER` literal turns the suite red.
- A contributor can add a new unit test from §6.1 alone.
