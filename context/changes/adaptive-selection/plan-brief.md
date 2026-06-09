# Adaptive Exercise Selection — Plan Brief

> Full plan: `context/changes/adaptive-selection/plan.md`

## What & Why

Drill exercises are currently picked uniformly at random. This slice (roadmap S-03, FR-003) weights selection toward the notes the child recently got wrong — ~70% weak spots, ~30% random — so each drill targets the child's weakest notes instead of cycling blindly. This adaptive weighting is the product wedge: remove it and Nuteczki is indistinguishable from generic flashcards.

## Starting Point

F-01 already shipped a `note_error_stats` view giving per-`(note, exercise_type)` error counts over each user's last 5 completed sessions, and exercise selection runs through one pure function, `buildSession`, in `exercises.ts`. The drill island does no data fetching today — all Supabase access is server-side. So the work is: an algorithm change plus a server-side seam to feed the view's data in. No schema change.

## Desired End State

A child with history sees recently-missed notes recur noticeably more often (per exercise type); a brand-new user sees exactly today's uniform-random drill. The mechanism is invisible — the deck just "feels relevant." Over time the parent sees accuracy climb in session history.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Data delivery | SSR prop via `drill.astro` | Matches the server-only DB pattern; weights arrive with the page, no new route or client fetch state | Plan |
| Weight formula | `error_count + 1` baseline | Matches PRD "wrong most often"; the +1 floor keeps mastered notes in play | Plan |
| 70/30 split | Exact partition `round(0.7×count)` | Predictable even at count=5, where per-slot randomness would swing wildly | Plan |
| Granularity | Per `(note, exercise_type)` | Pedagogically correct and the view already separates types | Plan |
| Cold start | Degrade to uniform via the +1 baseline | Empty weights collapse to a uniform draw — one code path, no gate | Plan |
| Testing | Defer formal tests; keep RNG-injectable | Honors the Module 2 L5 boundary; Module 3 can test the pure fn cold | Plan |

## Scope

**In scope:** weighting logic in `exercises.ts` (`NoteWeights` type, weighted picker, partitioned `buildSession`); `drill.astro` view query + weights prop; `DrillSession` consuming the prop.

**Out of scope:** schema/view changes, a test framework, a GET API route or browser Supabase client, re-fetching weights on in-page "play again", changing the note→letter/letter→note balance, surfacing the algorithm to the user.

## Architecture / Approach

`drill.astro` (server) queries `note_error_stats` → shapes a plain `NoteWeights` object → passes it as a prop to the `<DrillSession>` island → `handleStart` calls `buildSession(count, weights)`. Inside, `round(0.7×count)` slots draw their target pitch in proportion to `error_count + 1` (weighted picker), the rest stay uniform; both keep the no-consecutive-repeat rule. Empty weights ⇒ uniform ⇒ identical to today, which is also the graceful-fallback and cold-start path.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Adaptive algorithm (pure domain) | `buildSession` weights selection; inert by default | Off-by-one in the partition / accidentally breaking the no-repeat invariant |
| 2. Activate via SSR weights | `drill.astro` query + prop; behavior goes live | Statistical correctness is hard to eyeball without tests — relies on careful manual checks |

**Prerequisites:** S-01 (done), F-01 view (done). None outstanding.
**Estimated effort:** ~1 session across 2 phases; 3 files touched, no migration.

## Open Risks & Assumptions

- The ~70/30 ratio and weighting bias are verified manually (formal tests deferred); dev-only logging is used to confirm the partition, then removed before commit.
- In-page "play again" reuses page-load weights (stale by ≤1 session); accepted, self-corrects on next reload.
- `answers.note` storing the target pitch (true today) is what makes the view's data map back to selectable pitches — relied upon, not changed.

## Success Criteria (Summary)

- Notes the child recently missed measurably recur more often in a fresh drill (per exercise type).
- A brand-new user still gets a varied, non-degenerate drill (cold start safe).
- Per-answer feedback stays instant (<200 ms) — weighting is page-load work, not per-answer.
