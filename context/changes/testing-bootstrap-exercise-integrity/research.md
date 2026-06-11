---
date: 2026-06-11T00:00:00+02:00
researcher: Marcstee
git_commit: 019878d5196c2e4675c7e0f585d4365c7c4b935d
branch: main
repository: nuteczki
topic: "Phase 1 — Bootstrap Vitest + cover exercise winnability (Risk #1) and pitch-position integrity (Risk #2)"
tags: [research, codebase, testing, vitest, drill, staff, exercise-generator, pitch-mapping]
status: complete
last_updated: 2026-06-11
last_updated_by: Marcstee
---

# Research: Phase 1 — Bootstrap Vitest + exercise winnability & pitch-position integrity

**Date**: 2026-06-11T00:00:00+02:00
**Researcher**: Marcstee
**Git Commit**: 019878d5196c2e4675c7e0f585d4365c7c4b935d
**Branch**: main
**Repository**: nuteczki

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` ("Bootstrap + exercise
integrity") against the live code. Two risks to verify with the cheapest layer that
gives a real signal — both hypothesised as pure unit tests:

- **Risk #1 — Dead-end exercise**: prove that for *every* generated exercise the
  correct answer is present in the options **and** consistent with the rendered note
  descriptor (the winnability invariant). Oracle from the music domain, never from the
  generator's own output.
- **Risk #2 — Musically wrong note**: prove a known note maps to its musically-correct
  treble-clef staff position across the beginner range (first lower to first upper
  ledger line). Oracle from music theory, not the code.

This phase also stands up the test runner — the project has **0 test files and no test
dependencies** today.

## Summary

Both risk surfaces are **pure, DOM-free, and seedable** — the cheapest-layer hypothesis
holds completely. No React, no Astro, no browser, no DB is needed for either; a plain
`environment: "node"` Vitest config reaches every function directly.

- **Risk #1** lives in [`src/components/drill/exercises.ts`](src/components/drill/exercises.ts).
  The generator `buildSession(count, weights, rng)` takes an **injectable RNG**, so the
  test can drive it deterministically and **sample across seeds**. There are **two
  exercise directions** with asymmetric shapes — only one (`letter_to_note`) carries an
  explicit `options` array; the other (`note_to_letter`) has an *implicit* 7-letter
  option set. The correct answer is **structurally guaranteed** to be in the options for
  `letter_to_note` (the target pitch is spread into the array), but the *labelling*
  oracle `PITCH_LETTER` is the load-bearing table that a wrong row could break — so the
  test must encode an **independent** note-name oracle, not call `pitchToLetter`.
- **Risk #2** lives in [`src/components/staff/pitch.ts`](src/components/staff/pitch.ts)
  (+ [`geometry.ts`](src/components/staff/geometry.ts)). The pitch→position chain is two
  pure stages: `pitchToStaffStep` (a hand-written lookup table) → `stepToY` (linear
  math). The table **matches standard treble-clef theory exactly** (lines E-G-B-D-F,
  spaces F-A-C-E, middle C one ledger below). The math is the right thing to test; an
  SVG snapshot is the wrong (brittle) layer and is not needed.
- **Bootstrap**: Astro v6.3.1 / React 19.2.6 / Vite 7.3.3 (transitive) / TS 5.9.3 strict,
  path alias `@/* → ./src/*`. No `vitest`, no config, no `test` script, no test files.
  CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) targets **`main`** (not
  `master` as the README implies) and runs `lint` → `build`; a `test` step slots in after
  `npx astro sync`.

**The single most important design note for the plan**: both risks share one oracle —
the note-name / staff-position mapping must be **hand-written from music theory in the
test file**. Re-reading the production tables (`PITCH_LETTER`, `STAFF_STEP`) as the
expected value would make the test a tautology (the §2 anti-pattern). The tables are
*total `Record<Pitch, …>`* types, so TypeScript already guarantees completeness — the
test's job is to catch a **wrong literal**, which only an independent oracle can do.

## Detailed Findings

### Risk #1 — Exercise winnability ([`src/components/drill/exercises.ts`](src/components/drill/exercises.ts))

**Entry point — pure & seedable** (`exercises.ts:237-278`):

```ts
export function buildSession(
  count: 5 | 10 | 20,
  weights: NoteWeights = EMPTY_WEIGHTS,
  rng: () => number = Math.random,
): Exercise[]
```

The module header (`exercises.ts:1-13`) states it is "pure and render-free … so the
accuracy-critical pieces can be audited and unit-tested later without a runner." RNG is
dependency-injected — pass a seeded PRNG to reproduce failures. Supporting pure helpers
(all `rng`-injected): `weightedNextPitch` (`:100-114`), `nextPitch` (`:123-125`),
`letterToNoteOptions` (`:203-214`, **module-private**), `shuffle` (Fisher-Yates,
`:186-193`), `pitchToLetter` (`:86-88`, exported).

**Exercise shape — a discriminated union** (`exercises.ts:154-161`):

```ts
export type Exercise =
  | { type: typeof EXERCISE_TYPE_NOTE_TO_LETTER; pitch: Pitch }
  | {
      type: typeof EXERCISE_TYPE_LETTER_TO_NOTE;
      promptLetter: Letter;
      targetPitch: Pitch;
      options: readonly Pitch[];
    };
```

The two directions are **asymmetric** — this is the key fact for writing the invariant:

| | `note_to_letter` | `letter_to_note` |
|---|---|---|
| Rendered descriptor (staff draws) | `pitch` | each `Pitch` in `options[]` (3 mini-staves) |
| Correct answer | *derived* `pitchToLetter(pitch)` — not stored | `targetPitch` |
| Options array | *implicit* — the fixed 7-button `LETTERS` (`:21`), rendered in [`NoteToLetterExercise.tsx:48`](src/components/drill/NoteToLetterExercise.tsx) | explicit `options` (3 pitches), `:160` |

A built deck mixes both: `ceil(count/2)` note→letter + `floor(count/2)` letter→note
(`exercises.ts:242-247`).

**How correct answer & options relate** — `letterToNoteOptions` (`exercises.ts:203-214`):

```ts
function letterToNoteOptions(targetPitch: Pitch, rng: () => number): readonly Pitch[] {
  const promptLetter = pitchToLetter(targetPitch);
  const distractorLetters = shuffle(
    LETTERS.filter((letter) => letter !== promptLetter),
    rng,
  ).slice(0, 2);
  const distractors = distractorLetters.map((letter) => {
    const pool = PITCHES.filter((pitch) => pitchToLetter(pitch) === letter);
    return pool[Math.floor(rng() * pool.length)];
  });
  return shuffle([targetPitch, ...distractors], rng);
}
```

- The correct answer is **structurally guaranteed** present: `targetPitch` is spread into
  the returned array (`:213`); shuffle is a permutation, no dedup can drop it.
- `promptLetter` = `pitchToLetter(targetPitch)` (`:204`) and the exercise stores
  `promptLetter: pitchToLetter(targetPitch)` (`:270`) — same call → prompt/target
  consistent by construction.
- Distractor letters exclude `promptLetter` and are mutually distinct (`.filter(≠) →
  shuffle → slice(0,2)`), so **exactly one** option satisfies
  `pitchToLetter(option) === promptLetter`. The "exactly one correct" property is flagged
  accuracy-critical at `exercises.ts:198-201`.

**The note-name domain (the oracle)** — Polish/German naming, `H` not `B`:
- `PITCHES` (render domain, 13 scientific pitches, **`B4` never `H4`**):
  `["C4","D4","E4","F4","G4","A4","B4","C5","D5","E5","F5","G5","A5"]` —
  [`pitch.ts:19`](src/components/staff/pitch.ts), type at `pitch.ts:16`.
- `LETTERS` (answer alphabet, 7 names): `["C","D","E","F","G","A","H"]` — `exercises.ts:21`.
- The mapping oracle `PITCH_LETTER` (`exercises.ts:69-83`) — a **total** `Record<Pitch,
  Letter>`; the single `B4 → "H"` row lives at `:76`, every other pitch maps to its first
  character. `pitchToLetter` (`:86-88`) just reads this table.

> **Oracle discipline (from §2 of the test-plan):** the test must hard-code the expected
> 13-row pitch→letter table itself (first char, except `B4 → H`). Calling `pitchToLetter`
> as the expected value would mirror the implementation and miss a wrong row — the exact
> anti-pattern the risk warns against.

**Scoring uses the same oracle in two independent places** (worth knowing the invariant
protects the real path):
- note→letter: `correctLetter = pitchToLetter(pitch)`
  ([`NoteToLetterExercise.tsx:29`](src/components/drill/NoteToLetterExercise.tsx));
  `isCorrect = letter === pitchToLetter(current.pitch)`
  ([`DrillSession.tsx:108`](src/components/drill/DrillSession.tsx)).
- letter→note: `isAnswerOption = pitchToLetter(option) === promptLetter`
  ([`LetterToNoteExercise.tsx:58`](src/components/drill/LetterToNoteExercise.tsx));
  `isCorrect = pitchToLetter(pitch) === current.promptLetter`
  ([`DrillSession.tsx:117`](src/components/drill/DrillSession.tsx)).

**Inputs & enumeration** (`buildSession`, `:237-240`):
- `count`: literal union **`5 | 10 | 20`** — only 3 values, fully enumerable.
- `weights`: `NoteWeights` (`:47-50`), default `EMPTY_WEIGHTS` (`:58-61`). Affects
  *probability* only, never *winnability* — every in-range pitch keeps weight ≥ 1
  (`weightedNextPitch` `+1` baseline, `:106`). Still worth running with non-empty weights
  to prove independence.
- `rng`: injectable. **Outcome space is RNG-driven → sample across many seeds** per
  `count`. Additionally, `letterToNoteOptions` over **all 13 target pitches** is directly
  enumerable on the target axis (decide in the plan whether to export it or reach it via
  `buildSession`).

**Plausible break points to target** (the test should *fail* if any regresses):
1. A wrong row in `PITCH_LETTER` (`:69-83`) — e.g. `B4 → "B"` (not in `LETTERS`).
   Caught only by an independent oracle.
2. Distractor collision in `letterToNoteOptions` (`:205-212`) — if the `≠ promptLetter`
   exclusion or `.slice(0,2)` distinctness regresses, a second option could share the
   prompt letter. Assert **exactly one** match.
3. Short/empty options — `letter_to_note` must always be `options.length === 3` with 3
   distinct pitches and 3 distinct letters. A `.slice(0,1)` or empty-`pool` regression
   surfaces here. (`pool` is non-empty for all 7 letters in C4–A5.)
4. `promptLetter` ↔ `targetPitch` consistency (`:270` vs `:204`) — assert it survives a
   future refactor.

### Risk #2 — Pitch → staff position ([`src/components/staff/pitch.ts`](src/components/staff/pitch.ts), [`geometry.ts`](src/components/staff/geometry.ts))

**Two pure stages, both exported & DOM-free.**

Stage 1 — pitch → staff step (`pitch.ts:44-46`):

```ts
export function pitchToStaffStep(pitch: Pitch): number {
  return STAFF_STEP[pitch];
}
```

Backed by a deliberately non-arithmetic lookup table (`pitch.ts:27-41`):

```ts
const STAFF_STEP: Record<Pitch, number> = {
  C4: -2, // ledger line below staff (middle C)
  D4: -1, // space below bottom line
  E4: 0,  // bottom line
  F4: 1,  // 1st space
  G4: 2,  // 2nd line (the treble-clef G line)
  A4: 3,  // 2nd space
  B4: 4,  // middle line
  C5: 5,  // 3rd space
  D5: 6,  // 4th line
  E5: 7,  // top space
  F5: 8,  // top line
  G5: 9,  // space above top line
  A5: 10, // ledger line above staff
};
```

Stage 2 — step → Y (`geometry.ts:25-27`), with constants `LINE_GAP = 12`,
`BASELINE_Y = 80` (`geometry.ts:14,17`):

```ts
export function stepToY(step: number): number {
  return BASELINE_Y - step * (LINE_GAP / 2);
}
```

Each +1 step moves **up** by 6 SVG units (Y grows downward). So `stepToY(0)=80` (E4,
bottom line), `stepToY(2)=68` (G4 line), `stepToY(4)=56` (B4, middle line),
`stepToY(8)=32` (F5, top line). The five staff lines are the even steps `[8,6,4,2,0]`
([`Staff.tsx:41`](src/components/staff/Staff.tsx)).

**Beginner range** = exactly **C4 → A5** (13 pitches), documented "one ledger line below
the staff to one ledger line above" (`pitch.ts:13-16`, restated `Staff.tsx:56`). Lowest
C4 = step −2 (middle C, first lower ledger); highest A5 = step 10 (first upper ledger).
The five-line staff spans steps `[0,8]` = E4→F5.

**Treble-clef anchor & theory agreement.** The clef registers on the **G4 line (step 2)**
— `translate(${CLEF_LEFT_X} ${stepToY(2)})` ([`Staff.tsx:89`](src/components/staff/Staff.tsx)),
documented "on the G line" ([`treble-clef.ts:24`](src/components/staff/treble-clef.ts)).
Cross-checking every row against the canonical treble staff: bottom line E4 ✓, lines
E-G-B-D-F ✓, spaces F-A-C-E ✓, top line F5 ✓, middle C one ledger below ✓, A5 one ledger
above ✓. **The mapping is musically correct.** As with Risk #1, the test's *expected*
values must be a hand-written music-theory table, not a re-read of `STAFF_STEP`.

**Test the math, not a snapshot.** The pure core (`pitchToStaffStep` + `stepToY`) is fully
isolated from rendering; [`Staff.tsx:63-64`](src/components/staff/Staff.tsx) consumes them
(`const step = pitchToStaffStep(note); const noteY = stepToY(step);`) and feeds `noteY`
into `<ellipse cy>` / ledger / stem (`Staff.tsx:99,111,121`). A deterministic SVG snapshot
adds cost and brittleness without catching anything the math test misses (test-plan §2
anti-pattern: "a golden snapshot nobody verified is musically correct").

**Off-by-one / edge points to assert:**
- Monotonicity: for every adjacent pair in `PITCHES`, `stepToY` strictly **decreases**
  (higher pitch → smaller Y) — catches any line/space inversion purely.
- Line/space parity: even step = line, odd = space (`pitch.ts:23-24`, `geometry.ts:10`).
- Ledger-line bounds — `needsLedgerLine` (`pitch.ts:56-58`):
  ```ts
  export function needsLedgerLine(step: number): boolean {
    return step % 2 === 0 && (step < 0 || step > 8);
  }
  ```
  Must be true for **exactly** `{C4 (−2), A5 (10)}` and false for the 11 others. The `> 8`
  (not `>= 8`, which would wrongly ledger top-line F5) is the precise boundary to guard.
- No octave arithmetic exists — the only failure mode is a wrong table literal, which the
  theory oracle catches directly. (`% 2` on negatives is fine in JS: `-2 % 2 === 0`.)

### Bootstrap surface — standing up Vitest

Current state (all confirmed absent): no `vitest`/`vite.config`/`vitest.config`, no
`vitest.setup`, no `test` script, **zero** `*.test.*` / `*.spec.*` / `__tests__/` files.

| Item | Value | Source |
|------|-------|--------|
| Astro | `^6.3.1` — exports `getViteConfig()` from `astro/config` | [`package.json:28`](package.json), [`astro.config.mjs`](astro.config.mjs) |
| React | `^19.2.6`, `@astrojs/react ^5.0.4` active | [`package.json:33,19`](package.json) |
| Vite | `7.3.3` (transitive; override `^7.3.2` at `package.json:61`) | `npm list vite` |
| TypeScript | `^5.9.3`, extends `astro/tsconfigs/strict` | [`tsconfig.json`](tsconfig.json) |
| Path alias | `@/* → ./src/*`, `baseUrl: "."` | [`tsconfig.json:9-11`](tsconfig.json) |
| CI branch | **`main`** (README says `master` — stale) | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |
| CI steps | `npm ci` → `npx astro sync` → `npm run lint` → `npm run build` | [`ci.yml:18-21`](.github/workflows/ci.yml) |

- **Vite config is embedded in [`astro.config.mjs`](astro.config.mjs)** (`vite.plugins:
  [tailwindcss()]`). A standalone `vitest.config.ts` is needed; Astro v6's
  `getViteConfig()` is the idiomatic way to inherit the alias + plugins, **or** a minimal
  config re-declaring the `@/*` alias suffices since the Phase-1 targets need no Astro/Vite
  plugins.
- **Environment = `node`.** All four target files
  ([`exercises.ts`](src/components/drill/exercises.ts),
  [`pitch.ts`](src/components/staff/pitch.ts), [`geometry.ts`](src/components/staff/geometry.ts),
  [`treble-clef.ts`](src/components/staff/treble-clef.ts)) import nothing browser/React/Astro.
  `exercises.ts` imports only `@/components/staff/pitch` (`exercises.ts:15`) — so the path
  alias must resolve in the Vitest config. No happy-dom/jsdom needed for Phase 1.
- **Lint impact**: [`eslint.config.js`](eslint.config.js) has no test-file override.
  `no-console` is `warn` (won't block). `react-compiler/react-compiler: error` applies to
  all `.ts`/`.tsx` but pure-math test files pass trivially. Vitest globals (`describe`,
  `it`) under the strict config either need `globals: true` + an env entry, or explicit
  imports from `vitest` — a plan decision (explicit imports avoid an ESLint globals
  override).
- **CI step placement**: a `npm run test` step slots in after `npx astro sync`
  (`ci.yml:19`), before or after `lint`. Wiring the gate is **§3 Phase 5** per the
  test-plan; Phase 1 only needs the local runner + `test` script.

## Code References

- `src/components/drill/exercises.ts:237-278` — `buildSession`, the seedable generator entry point
- `src/components/drill/exercises.ts:154-161` — `Exercise` discriminated union (two directions)
- `src/components/drill/exercises.ts:203-214` — `letterToNoteOptions` (distractor + correct-answer logic)
- `src/components/drill/exercises.ts:69-88` — `PITCH_LETTER` table + `pitchToLetter` (the labelling oracle)
- `src/components/drill/exercises.ts:21` — `LETTERS` (`C D E F G A H`, the answer alphabet)
- `src/components/drill/exercises.ts:242-247` — deck composition (half each direction)
- `src/components/drill/DrillSession.tsx:108,117` — scoring (both directions) using the same oracle
- `src/components/staff/pitch.ts:16-19` — `Pitch` type + `PITCHES` (beginner range C4–A5)
- `src/components/staff/pitch.ts:27-46` — `STAFF_STEP` table + `pitchToStaffStep`
- `src/components/staff/pitch.ts:56-58` — `needsLedgerLine` (ledger bounds, off-by-one guard)
- `src/components/staff/geometry.ts:14-27` — `LINE_GAP`, `BASELINE_Y`, `stepToY`
- `src/components/staff/Staff.tsx:63-64,89` — render boundary consuming the pure math (clef on G line)
- `package.json:5-14` — scripts (no `test` yet); `:16-61` deps (no vitest)
- `astro.config.mjs` — embedded Vite config (`tailwindcss()` plugin), Cloudflare adapter
- `tsconfig.json:9-11` — `@/*` path alias
- `.github/workflows/ci.yml:18-21` — CI gate (targets `main`)

## Architecture Insights

- **Deliberate purity for testability.** Both risk surfaces were written render-free with
  injectable RNG — the `exercises.ts` header explicitly anticipates "audit and unit-test
  later without a runner." The accuracy-critical logic is already isolated from React; the
  plan's job is to honour that seam, not break into the components.
- **Lookup tables over arithmetic.** Both `PITCH_LETTER` and `STAFF_STEP` are total
  `Record<Pitch, …>` tables rather than computed mappings. This makes octave-wrap / modulo
  bugs structurally impossible and reduces the failure mode to a *single wrong literal* —
  which is precisely what an independent music-theory oracle catches and an
  implementation-mirroring test does not.
- **One oracle, two risks.** The note-name alphabet and the staff-position table are the
  same musical knowledge viewed two ways. A shared, hand-written test fixture (the 13-pitch
  table: name, letter, staff step, expected Y, ledger?) cleanly serves both invariants
  without duplicating the production tables.
- **Asymmetric exercise shape is the subtle trap.** `note_to_letter` has no `options`
  field — its winnability reduces to "`pitchToLetter(pitch) ∈ LETTERS`", whereas
  `letter_to_note` needs the full "target ∈ options, exactly one correct, 3 distinct"
  invariant. A naive test that only checks `.options` would skip half the deck.

## Historical Context (from prior changes)

- [`context/foundation/lessons.md`](context/foundation/lessons.md) — two standing rules,
  both about the *rendering* layer (Tailwind v4 `text-[length:var(...)]` hint; Cloudflare
  `.html`-stripping SW precache). Neither touches the pure pitch/exercise math under test
  here, but both reinforce that this project's burns came from the deploy/render boundary —
  the §3 later phases (integration, e2e) carry the higher historical risk.
- [`context/foundation/test-plan.md`](context/foundation/test-plan.md) §2 risk-response —
  the anti-patterns are now grounded: for #1 "asserting the option set equals what the
  generator returns" is avoided by the independent letter oracle; for #2 "a golden snapshot
  nobody verified" is avoided by testing the pure math against a theory table.
- `context/archive/2026-06-10-session-history-ux/` (referenced by test-plan Risk #6) —
  delete as first destructive action; out of scope for Phase 1 but confirms the
  persistence/ownership risks belong to later phases, not here.

## Related Research

- None yet — this is the first `research.md` under `context/changes/`. Phase 2
  (session-boundary regression net) and Phase 3 (e2e) will produce their own.

## Open Questions

These are **plan decisions** for `/10x-plan`, not unknowns about the code:

1. **Export `letterToNoteOptions`** (currently module-private, `exercises.ts:203`) for
   direct enumeration over all 13 pitches, **or** reach it only through `buildSession`?
   Exporting buys a cleaner enumerable test; not exporting keeps the public surface minimal
   and tests the real composed path.
2. **Vitest config style**: `getViteConfig()` from `astro/config` (inherits alias +
   plugins, heavier) vs a minimal hand-written `vitest.config.ts` re-declaring only the
   `@/*` alias (lighter; sufficient since Phase-1 targets need no plugins). Lean minimal.
3. **Globals vs explicit imports**: `globals: true` (needs an ESLint env/globals entry) vs
   `import { describe, it, expect } from "vitest"` (no lint change). Explicit imports avoid
   touching `eslint.config.js`.
4. **Sample budget**: how many seeds × `{5,10,20}` counts is "enough" for the winnability
   property? (e.g. a fixed seeded PRNG, N≈500–1000 exercises) — pick a deterministic,
   reproducible number so CI is stable.
5. **Cookbook §6.1**: the plan's final sub-phase should fill in `test-plan.md` §6.1
   (location: co-located `*.test.ts` next to source vs a `test/` dir; naming; the
   winnability + pitch-position reference tests; `npm run test` command).
