# Drill Landscape Fit (iPad) — Plan Brief

> Full plan: `context/changes/drill-landscape-fit/plan.md`

## What & Why

On a real iPad in **landscape**, the drill exercise area scrolls and the action
buttons can clip — the exact open risk S-07 (`responsive-exercise-scaling`) shipped
without closing. The fixed-aspect staff (~1.22:1) plus the giant prompt letter, tap
targets, feedback, and "Dalej" button stack taller than the short landscape
viewport. We make the drill size tokens **height-aware in landscape only** so
everything fits without scroll.

## Starting Point

S-07 added eight **width-driven** `--drill-*` `clamp()` tokens in `global.css:25-32`
and wired them into the four drill views. They behave well in portrait/iPhone/desktop
but have no height term, so they can't react to the short landscape dimension. The
results screen additionally uses hardcoded (non-token) sizes and is the tallest view.

## Desired End State

On a landscape iPad (installed PWA), every drill screen — both exercise types (before
and after answering), the count-picker setup, and the results screen — fits the
viewport with no vertical scroll and no clipped buttons; staff legible, targets
finger-sized. Portrait iPad, iPhone, and desktop render identical to the post-S-07
baseline.

## Key Decisions Made

| Decision               | Choice                                              | Why (1 sentence)                                                              | Source |
| ---------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------- | ------ |
| Symptom in scope       | Drill scrolls/clips in **landscape** on iPad        | The reported, reproduced problem (real installed PWA).                        | Plan   |
| Fix strategy           | Height-cap the existing vertical stack              | Smallest change, token/className-only, extends S-07's pattern; no logic change. | Plan   |
| Mechanism              | `min(<width clamp>, <dvh ceiling>)` per token       | The `dvh` term binds only in short-height landscape and no-ops elsewhere.     | Plan   |
| No-scroll behavior     | Size-to-fit; scroll as last-resort safety valve     | Fixes overflow without ever hard-clipping an unreachable control.             | Plan   |
| Shrink priority        | Tap/action targets keep child floors; staff+prompt give | Protects S-07's child-tappability goal while reclaiming the most height.   | Plan   |
| Screen scope           | All four drill views (incl. setup + results)        | Results is the tallest view and also overflows landscape.                     | Plan   |
| Regression boundary    | Only landscape changes; portrait/iPhone/desktop untouched | Don't disturb the layouts S-07 just signed off.                         | Plan   |
| Phasing                | Single phase                                        | Matches how S-07 shipped; one cohesive retune + one verification pass.        | Plan   |

## Scope

**In scope:** `global.css` drill tokens (add `dvh` ceilings + a `--drill-gap` token);
gap-token swap across `NoteToLetterExercise`, `LetterToNoteExercise`, `DrillSession`
setup, `SessionResults`; landscape-fitting `SessionResults`' bespoke sizes.

**Out of scope:** layout restructure / two-column landscape / breakpoints; hard
`overflow:hidden`; any portrait/iPhone/desktop change; `Staff.tsx` and the
musical/geometry core; any logic, state, or API change; non-drill screens.

## Architecture / Approach

Wrap each height-driving `--drill-*` token in `min(<existing width clamp>, <dvh
term>)`. In tall viewports the `dvh` term loses and the token is unchanged (zero
regression); in short landscape it wins and the staff/prompt shrink to fit.
Tap/action heights are floor-guarded (`max(4rem, …)`) so targets never drop below
child-finger size. Gaps move to a `--drill-gap` token so they tighten in landscape.
The results screen's hardcoded mascot/accuracy/stat sizes get the same `min(…,dvh)`
treatment. All edits are CSS token definitions + className swaps — no JS, no
behavior change.

## Phases at a Glance

| Phase                                          | What it delivers                                                        | Key risk                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1. Height-aware tokens + results-screen fit    | `dvh`-capped tokens, gap token applied to all four views, results fitted | Tuning the `dvh` constants so landscape fits without shrinking the staff below legibility — needs real-device tuning |

**Prerequisites:** S-07 (`responsive-exercise-scaling`) is done — its `--drill-*`
tokens are the surface this retunes. No new deps. A real iPad (or its installed PWA)
for the landscape verification.
**Estimated effort:** ~1 session — a small `global.css` retune + className swaps,
then on-device landscape tuning.

## Open Risks & Assumptions

- **`dvh` constants are starting points**, tuned on the real iPad. The shape
  (width clamp capped by a `dvh` ceiling that only bites in landscape) is what
  matters; `--drill-staff-w`'s `dvh` ceiling is the dominant lever.
- **Floor vs fit tension:** if the shortest landscape height can't hold the staff
  *and* floored targets, the page may scroll slightly rather than clip — accepted by
  the "size-to-fit, scroll as safety valve" decision.
- Assumes `dvh` support (iOS Safari 15.4+); in the installed standalone PWA
  `dvh == vh`, so the unit choice is safe.

## Success Criteria (Summary)

- Landscape iPad: all four drill screens fit with no vertical scroll and no clipped
  action buttons; staff legible, targets finger-sized.
- Portrait iPad, iPhone, and desktop are visually identical to the post-S-07 baseline.
- `npm run lint`, `npx astro check`, and `npm run build` all pass.
