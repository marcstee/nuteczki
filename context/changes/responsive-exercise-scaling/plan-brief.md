# Responsive Exercise Scaling — Plan Brief

> Full plan: `context/changes/responsive-exercise-scaling/plan.md`

## What & Why

The drill exercise area is locked to a 448px (`max-w-md`) centered column with a fixed-width
staff, so on an iPad it floats in a small box surrounded by empty navy and on iPhone it never
maximizes. S-07 wants the exercise area to **fill the viewport on iPhone/iPad** — staff and tap
targets large enough for a child to read and tap accurately — for both exercise types.

## Starting Point

The staff renderer (`Staff.tsx`) is already resolution-independent: it's an SVG with a fixed
`viewBox` + `preserveAspectRatio` that scales to whatever width its `className` gives it. The
brief's "primary risk — fixed pixel sizes in the staff renderer" doesn't actually hold. The fixed
sizing lives one level up, in the four drill views (`NoteToLetterExercise`, `LetterToNoteExercise`,
`DrillSession` setup, `SessionResults`), which all share `max-w-md` and flat tap-target sizes.

## Desired End State

On iPhone (390×844) and iPad (820×1180 and 1180×820) the exercise area fills most of the viewport
width with a large legible staff and finger-sized controls, for both exercise types plus the setup
and results screens. On desktop it caps at a generous size — no over-scaling, no scrollbar.

## Key Decisions Made

| Decision            | Choice                                  | Why (1 sentence)                                                                 | Source |
| ------------------- | --------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| Scaling mechanism   | Fluid `clamp()` viewport units          | Smoothly fills any width rather than jumping at breakpoints.                      | Plan   |
| iPad size target    | Near-full-width                         | Maximizes the staff/targets on the iPad surface.                                 | Plan   |
| Desktop behavior    | Cap growth (clamp max ≈ iPad size)      | Defuses the brief's secondary "over-scaling breaks desktop" risk.                | Plan   |
| Vertical            | Stay centered, content grows naturally  | Avoids Safari URL-bar overflow/scroll from flex-grow stretching.                 | Plan   |
| Tap targets & text  | Scale up with the viewport              | Directly serves the "large enough for a child's finger" goal on iPad.            | Plan   |
| Scope               | All drill views (exercises + setup + results) | No screen in the session flow stays in a small centered column.            | Plan   |
| Curve location      | Centralized CSS custom properties in `global.css` | One tunable source of truth; desktop cap edited in one place.          | Plan   |

## Scope

**In scope:** `global.css` (new fluid tokens); `NoteToLetterExercise`, `LetterToNoteExercise`,
`DrillSession` setup view, `SessionResults` (swap fixed sizes for the tokens).

**Out of scope:** `Staff.tsx` and the musical/geometry core (already scalable); vertical
stretch-to-fill; breakpoint variants; container queries; any logic, state, or behavior change.

## Architecture / Approach

Define ~7 CSS custom properties in `global.css :root`, each a `clamp(min, <vw>, max)` — min keeps
iPhone comfortable, the `vw` term grows toward near-full-width on iPad, max caps desktop. Components
reference them via Tailwind v4 arbitrary values (`max-w-[var(--drill-shell-max)]`,
`w-[var(--drill-staff-w)]`, `h-[var(--drill-tap-h)]`, …). The page wrapper (`drill.astro`) is
unchanged — it already centers full-screen. ClassName-only edits, so React Compiler / Astro lint
rules are unaffected.

## Phases at a Glance

| Phase                                  | What it delivers                                              | Key risk                                                                 |
| -------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 1. Fluid scaling across all drill views | Tokens in `global.css` + all four views referencing them     | Fixed-aspect staff overflowing viewport **height** in landscape iPad     |

**Prerequisites:** S-02 and S-05 are done (both exercise types + redesign in place). No new deps.
**Estimated effort:** ~1 session — a small, single-phase className change plus device testing.

## Open Risks & Assumptions

- **Vertical overflow in landscape (1180×820).** The staff is fixed-aspect (~1.22:1), so its width
  cap is really height-bound; `--drill-staff-w`'s max must stay conservative (≈30rem) and be lowered
  during testing if any view scrolls. This is the one thing to watch.
- Clamp curve numbers in the plan are starting points, tunable against Safari DevTools — the curve
  shape (grow on iPad, cap on desktop) is what matters.

## Success Criteria (Summary)

- Both exercise types, plus setup and results, fill the viewport on iPhone and iPad with large,
  legible staff and finger-sized targets.
- No vertical scroll at 390×844, 820×1180, or 1180×820; desktop caps with no over-scaling or regression.
- `npm run lint`, `npx astro check`, and `npm run build` all pass.
