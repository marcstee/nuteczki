# Adaptive Exercise Selection Implementation Plan

## Overview

Replace the uniform-random target-pitch selection in the drill with adaptive weighting toward notes the child misses most. Each new session draws roughly 70% of its exercises from the child's weakest notes (per exercise type) and 30% at random for variety. This is the product wedge from the roadmap (S-03) and satisfies FR-003 / US-01.

The data layer already exists: F-01 shipped the `note_error_stats` view, which exposes per-`(note, exercise_type)` `error_count` / `total_count` across each user's last 5 completed sessions. This plan does **not** touch the schema. It adds the selection algorithm (pure, in `exercises.ts`) and a server-side seam that feeds the view's data into that algorithm as a prop.

## Current State Analysis

- **Selection is uniform random.** [`buildSession(count, rng)`](src/components/drill/exercises.ts:175) builds a balanced deck (`ceil(count/2)` note→letter + `floor(count/2)` letter→note), shuffles the types, and picks each target pitch via [`nextPitch(previous, rng)`](src/components/drill/exercises.ts:68) — a uniform draw from `PITCHES` that only excludes the immediately-previous note (no back-to-back repeats). There is no weighting.
- **The algorithm seam is clean and pure.** `exercises.ts` is render-free, RNG-injectable, and is the single source of domain truth. All selection logic belongs here.
- **`answers.note` stores the target pitch** for both exercise types (see [exercises.ts:118](src/components/drill/exercises.ts) `AnswerRecord` and [api/sessions.ts](src/pages/api/sessions.ts)). So the view's `note` column maps directly back to the `Pitch` values `buildSession` chooses.
- **The view is built for this and already typed.** [`note_error_stats`](supabase/migrations/20260528214850_create_session_tables.sql:52) is `security_invoker` (base-table RLS applies, so a query returns only the caller's rows) and present in [database.types.ts:104](src/db/database.types.ts) as `{ user_id, note, exercise_type, error_count, total_count }` (all columns nullable per the generated view type).
- **The island does no data fetching.** [`DrillSession`](src/components/drill/DrillSession.tsx) calls `buildSession(count)` synchronously inside the `handleStart` event handler. All Supabase access in the app is server-side: the API route and middleware use [`createClient(headers, cookies)`](src/lib/supabase.ts). There is no browser Supabase client.
- **`/drill` is a protected route** ([middleware.ts:4](src/middleware.ts)); `context.locals.user` holds the authenticated user by the time the page renders.
- **No test framework is installed** (`package.json` has no vitest/jest). The domain modules were written "to be unit-tested later." Per the Module 2 L5 lesson boundary, formal testing is deferred to Module 3.

## Desired End State

A child who has completed sessions sees a new drill in which notes they recently got wrong recur noticeably more often than notes they've mastered — about 70% of the deck targets weak notes (per exercise type), 30% is random. A brand-new user (no completed sessions) sees exactly today's uniform-random drill. The child never sees the mechanism; the deck simply "feels relevant."

Verify by: completing several drills while deliberately missing two or three specific notes, then starting a new drill (full page load) and confirming those notes appear disproportionately often; and confirming a fresh account still gets a varied, non-degenerate drill.

### Key Discoveries:

- The view does the heavy lifting — no migration, no DB types regen ([note_error_stats](supabase/migrations/20260528214850_create_session_tables.sql:52)).
- The whole behavior change funnels through one pure function: `buildSession` in [exercises.ts:175](src/components/drill/exercises.ts).
- `security_invoker` means a plain `select` from the view is already user-scoped — no manual `user_id` filter required for correctness.
- The `+1` baseline weight makes cold start a no-op: zero error data ⇒ every note weight 1 ⇒ the weighted draw is uniform ⇒ identical to today. No special-case branch needed.
- Astro→React island props are JSON-serialized, so the weights map must be a plain nested object of numbers (no `Map`).

## What We're NOT Doing

- **No schema or view change.** The session window stays at the last 5 completed sessions; no recency decay inside the window.
- **No new API route and no browser Supabase client.** Weights are delivered as an SSR prop.
- **No test framework.** Formal unit tests are deferred to Module 3; the selection function stays pure and RNG-injectable so they can be added cold later.
- **No re-fetch on "play again."** After an in-page "play again," weights are reused from the page-load prop (stale by at most one session); the next full page load catches up. Accepted for MVP.
- **No change to the type balance.** Adaptivity governs *which pitch* a slot targets, not the note→letter/letter→note split, which stays `ceil`/`floor`.
- **No surfacing of the algorithm to the user** (PRD: the child does not see it).
- **No miss-rate weighting.** Weight is raw `error_count + 1`, not `error_count / total_count`, matching PRD's "wrong most often." A weak note can stay over-weighted within the 5-session window even as the child improves (a mild self-reinforcing loop, bounded by the window). **Accepted for the MVP**; revisit with a rate-based formula only if the loop proves noticeable.

## Implementation Approach

Extend `buildSession` to accept a `NoteWeights` map and partition its slots into a weighted majority and a random minority. Weighted slots pick the target pitch in proportion to `error_count + 1` for that slot's exercise type; random slots keep the current uniform draw. Both honor the existing no-consecutive-repeat rule. With an empty weights map (the default), every weight collapses to the `+1` baseline and the function reproduces today's behavior exactly — so Phase 1 lands without changing any user-visible behavior. Phase 2 then queries the view in `drill.astro`, shapes the rows into the weights map, and passes it to the island, turning adaptivity on.

## Critical Implementation Details

- **Cold-start correctness is structural, not conditional.** Apply the `+1` baseline across the *full* `PITCHES` pool inside the weighted picker (every in-range pitch is a candidate with at least weight 1), rather than only over notes that appear in the weights map. This is what makes an empty map degrade to a uniform draw and keeps mastered notes from ever dropping to zero probability.
- **Debug & observability (manual verification).** Because formal tests are deferred, the only way to confirm the ~70/30 ratio and the weighting bias is observation. During Phase 2 dev, temporarily log each built deck's per-slot `{ pitch, weighted | random }` designation (or the realized weighted-slot count) to confirm the partition and bias, then remove it before commit — `no-console` is a lint warning and the CI gate / pre-commit hook will flag a leftover `console.log`.

## Phase 1: Adaptive selection algorithm (pure domain)

### Overview

Add the weighting types and logic to `exercises.ts` and partition `buildSession`. Default-empty weights make this inert — existing callers and behavior are unchanged until Phase 2 wires real data.

### Changes Required:

#### 1. Weights type and empty default

**File**: `src/components/drill/exercises.ts`

**Intent**: Define the data shape the algorithm consumes and a canonical empty value so the cold-start / un-wired path is the default.

**Contract**: A `NoteWeights` type keyed by exercise type, each mapping a subset of `Pitch` to its raw `error_count` (a non-negative integer; absent pitches mean "no recorded errors"). Plus an exported `EMPTY_WEIGHTS` constant. Must be a plain JSON-serializable object (no `Map`), since it crosses the Astro→React island boundary.

```ts
export type NoteWeights = Record<
  typeof EXERCISE_TYPE_NOTE_TO_LETTER | typeof EXERCISE_TYPE_LETTER_TO_NOTE,
  Partial<Record<Pitch, number>> // value = raw error_count from the view
>;
export const EMPTY_WEIGHTS: NoteWeights = {
  [EXERCISE_TYPE_NOTE_TO_LETTER]: {},
  [EXERCISE_TYPE_LETTER_TO_NOTE]: {},
};
```

#### 2. Weighted pitch picker

**File**: `src/components/drill/exercises.ts`

**Intent**: Add a pure, RNG-injectable picker that chooses a target pitch in proportion to `error_count + 1`, excluding the previous pitch (preserving the no-back-to-back-repeat invariant). This sits alongside `nextPitch`, which it generalizes.

**Contract**: `weightedNextPitch(previous: Pitch | null, errorCounts: Partial<Record<Pitch, number>>, rng = Math.random): Pitch`. Builds the candidate pool from `PITCHES` minus `previous`; assigns each candidate weight `(errorCounts[pitch] ?? 0) + 1`; draws proportionally via a cumulative-weight walk over `rng() * totalWeight`. With all-zero/absent counts this is exactly uniform, so the uniform draw is implemented **once** here. Reduce `nextPitch` to a one-line wrapper — `nextPitch(prev, rng) = weightedNextPitch(prev, {}, rng)` — so its single internal caller ([exercises.ts:186](src/components/drill/exercises.ts)) and the random slots in `buildSession` both route through one draw implementation. (`nextPitch` has no external importers — grep-confirmed — so collapsing it is safe; keeping the named wrapper keeps the random-slot call site self-documenting.)

#### 3. Partition `buildSession`

**File**: `src/components/drill/exercises.ts`

**Intent**: Make `buildSession` accept weights and split its slots into a weighted majority and a random minority, choosing each slot's target pitch accordingly while keeping the type balance, shuffle, and no-consecutive-repeat behavior intact.

**Contract**: New signature `buildSession(count: 5 | 10 | 20, weights: NoteWeights = EMPTY_WEIGHTS, rng = Math.random): Exercise[]`. Exactly `Math.round(0.7 * count)` slots are "weighted" (5→4, 10→7, 20→14), the remainder "random"; the weighted/random designation is shuffled across the deck so it doesn't correlate with position or type. Weighted slots call `weightedNextPitch(previousTarget, weights[slotType], rng)`; random slots call `nextPitch(previousTarget, rng)`. Letter→note option generation and the per-slot `previousTarget` threading are unchanged. With `EMPTY_WEIGHTS`, output is distributionally identical to the current implementation.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Existing drill is unchanged when run without weights: start a session from `/drill`, confirm exercises still appear varied and no two consecutive exercises share the same note (Phase 1 is inert by design).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 2. Phase blocks use plain bullets — the `- [ ]` checkboxes live in the `## Progress` section.

---

## Phase 2: Activate via SSR weights

### Overview

Query `note_error_stats` in `drill.astro`, shape the rows into a `NoteWeights` map, pass it to the island as a prop, and have `DrillSession` feed it into `buildSession`. Adaptivity goes live, with graceful fallback to `EMPTY_WEIGHTS`.

### Changes Required:

#### 1. Query the view and pass weights as a prop

**File**: `src/pages/drill.astro`

**Intent**: In the page frontmatter, fetch the current user's per-note error counts and hand them to the island so the deck can be weighted at build time.

**Contract**: Use `createClient(Astro.request.headers, Astro.cookies)` (same pattern as [api/sessions.ts](src/pages/api/sessions.ts)); the user is guaranteed present by the protected-route middleware. `select("note, exercise_type, error_count")` from `note_error_stats`, then reduce rows into a `NoteWeights` object (group by `exercise_type`, key by `note`, value = `error_count`), guarding the view's nullable columns and ignoring any `note` outside `PITCHES`. Render `<DrillSession client:load weights={weights} />`. On `createClient` returning `null`, a query error, or no rows, pass `EMPTY_WEIGHTS` (uniform fallback). No `set:html`, no new client dependency.

#### 2. Consume the weights prop

**File**: `src/components/drill/DrillSession.tsx`

**Intent**: Accept the weights prop and thread it into deck construction; everything else about the island is unchanged.

**Contract**: Add a `weights: NoteWeights` prop (default `EMPTY_WEIGHTS` so the component is still valid if rendered without it). In `handleStart`, call `buildSession(count, weights)` instead of `buildSession(count)`. The same prop value is reused across in-session "play again" (accepted stale-by-one). No change to the state machine, save path, or results UI.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build passes: `npm run build`
- No leftover `console.log` (debug instrumentation removed): `npm run lint` reports no `no-console` warnings

#### Manual Verification:

- **Adaptivity is observable**: run this at **count=20** (14 weighted slots — count=5 has only 4, too few to separate bias from noise). Complete ≥3 drills deliberately missing the **same single note** every time, then start a fresh count=20 drill via a full page load and confirm that note recurs unambiguously more often (~3–4× vs ~1× for a mastered note). Confirm the realized weighted-slot count is 14 via the temporary dev log (see Critical Implementation Details) before removing it.
- **Cold start is safe**: on a brand-new account (no completed sessions), the first drill is varied and covers a spread of notes (no degenerate single-note repetition).
- **Graceful fallback**: with Supabase unconfigured locally, `/drill` still loads and runs a uniform drill rather than erroring.
- **Feedback latency unaffected**: answer acknowledgement still feels instant (<200 ms NFR) — the weighting is page-load work, not per-answer.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that adaptivity behaves as expected.

---

## Testing Strategy

Formal automated tests are deferred to Module 3 per the project's lesson boundary. The selection logic is kept pure and RNG-injectable so those tests can be added cold later. For this slice:

### Manual Testing Steps:

1. **Regression (Phase 1)**: run a drill before wiring weights; confirm behavior is unchanged and no two consecutive exercises repeat a note.
2. **Bias (Phase 2)**: at **count=20**, deliberately miss a **single note X** across ≥3 sessions; start a fresh count=20 drill (full reload) and confirm X over-appears unambiguously (~3–4×) relative to mastered notes. Verify the 14 weighted slots via the dev-only log before removing it. (count=5 is underpowered — only 4 weighted slots.)
3. **Per-type bias**: miss a note only in letter→note; confirm it's over-targeted in letter→note slots but not unduly in note→letter slots.
4. **Cold start**: new account → varied first drill, no degeneration.
5. **Fallback**: Supabase unconfigured → `/drill` runs a uniform drill, no error.
6. **Ratio sanity (dev-only)**: temporarily log the weighted/random slot designation to confirm `round(0.7×count)` slots are weighted; remove before commit.

## Performance Considerations

The weights query is a single small `select` from a pre-aggregated view, run once per page load (not per answer), so it does not affect the <200 ms per-answer feedback NFR. The view aggregates at most the answers from 5 sessions; result size is bounded by 13 pitches × 2 exercise types = 26 rows. Negligible.

## Migration Notes

None. No schema change; the `note_error_stats` view and tables already exist from F-01.

## References

- Roadmap slice S-03: `context/foundation/roadmap.md`
- PRD FR-003 / US-01 / Business Logic: `context/foundation/prd.md`
- Selection seam: `src/components/drill/exercises.ts:175` (`buildSession`)
- Data source: `supabase/migrations/20260528214850_create_session_tables.sql:52` (`note_error_stats`)
- Server DB access pattern: `src/pages/api/sessions.ts`, `src/lib/supabase.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Adaptive selection algorithm (pure domain)

#### Automated

- [x] 1.1 Type checking passes: `npx astro check` — b190bd0
- [x] 1.2 Linting passes: `npm run lint` — b190bd0
- [x] 1.3 Build passes: `npm run build` — b190bd0

#### Manual

- [x] 1.4 Existing drill unchanged without weights (Phase 1 inert; no consecutive-note repeats) — b190bd0

### Phase 2: Activate via SSR weights

#### Automated

- [x] 2.1 Type checking passes: `npx astro check` — a33f833
- [x] 2.2 Linting passes: `npm run lint` — a33f833
- [x] 2.3 Build passes: `npm run build` — a33f833
- [x] 2.4 No leftover `console.log` (`no-console` clean) — a33f833

#### Manual

- [x] 2.5 Adaptivity observable: at count=20, a single deliberately-missed note recurs ~3–4× more often after reload (14 weighted slots confirmed via dev log) — a33f833
- [x] 2.6 Cold start safe: new account gets a varied first drill — a33f833
- [x] 2.7 Graceful fallback: unconfigured Supabase still runs a uniform drill — a33f833
- [x] 2.8 Feedback latency unaffected (<200 ms per answer) — a33f833
