# Drill Landscape Fit (iPad) Implementation Plan

## Overview

Make the drill exercise area **fit the viewport in landscape on iPad** so it no
longer scrolls or clips the action buttons. This closes the open risk that S-07
(`responsive-exercise-scaling`) shipped without resolving. The fix is a
**height-aware retune of the existing fluid tokens** plus landscape-fitting of the
results screen's bespoke sizes — token/className edits only, no logic, state, or
behavior change. Crucially, it must leave the portrait-iPad / iPhone / desktop
layouts S-07 just tuned **visually unchanged**.

## Current State Analysis

S-07 (archived `2026-06-10-responsive-exercise-scaling`) introduced eight fluid
`--drill-*` tokens in `src/styles/global.css:25-32`, all **width-driven**
(`clamp(min, <vw>, max)`), and wired them into the four drill views via Tailwind v4
arbitrary values. The page wrapper `drill.astro` centers a full-screen flex column
(`flex min-h-screen items-center justify-center p-4`).

The problem (and the open risk S-07's plan-brief flagged verbatim): the staff is
**fixed-aspect ~1.22:1** (`Staff.tsx:22-23`, `viewBox` 120×98 with
`preserveAspectRatio`), so its width cap is really a *height* cap. With
`--drill-staff-w` maxing at `30rem` (480px → ~392px tall) plus the white card
padding, the progress line, a one-row tap grid (`--drill-tap-h` up to 6rem), the
feedback line, and the `--drill-action-h` "Dalej" button (up to 5rem), the
note→letter view stacks to roughly the full 820px landscape height *before* any
chrome — so it overflows and scrolls in landscape. Letter→note adds a
`--drill-prompt-text` letter up to **11rem (176px)** tall, the single biggest
height hog.

The width-driven clamps have **no height term**, so they cannot react to the short
landscape dimension. They behave well in portrait/iPhone/desktop (where height is
plentiful) — those must not change.

The setup view (`DrillSession.tsx:161-180`) is short. The **results view**
(`SessionResults.tsx`) is the tallest and uses **hardcoded, non-token sizes**:
mascot `h-28 w-28` (112px), `text-3xl` heading, `text-6xl` accuracy, two `p-6`
`StatBlock`s with `text-3xl` numbers, and two `--drill-action-h` buttons — it
almost certainly overflows landscape too, and its bespoke sizes need landscape
attention beyond the shared tokens.

### Key Discoveries:

- **Width-driven tokens, no height awareness** — `src/styles/global.css:25-32`. The
  fix lives here: add a `dvh` ceiling via `min()` to each height-driving token.
- **Staff is fixed-aspect ~1.224:1** — `src/components/staff/Staff.tsx:22-23`
  (`VIEW_WIDTH 120 / VIEW_HEIGHT 98`). To bound staff *height* to a fraction of
  viewport height, bound its *width* to ~1.22× that fraction.
- **Components already consume the tokens** — `NoteToLetterExercise.tsx:33,41,68,79,86`,
  `LetterToNoteExercise.tsx:42,48,49,89,96`, `DrillSession.tsx:163,164,173`,
  `SessionResults.tsx:100,107`. Retuning the token *definitions* alone propagates to
  all consumers with zero component edits.
- **Gaps are hardcoded** — `gap-6`/`gap-8`/`gap-4` literals in all four views. To let
  them tighten in landscape they must move to a `--drill-gap` token.
- **Results screen has bespoke sizes** — `SessionResults.tsx:58-110` (mascot,
  headings, accuracy, stat blocks) not tied to tokens; handled explicitly.
- **Tailwind v4 font-size tokens need `length:`** — `lessons.md` rule: any
  `text-[...]` referencing a CSS var holding a font-size must use
  `text-[length:var(--token)]`. Existing drill text tokens already do; any new
  font-size token must too.
- **`min()` accepts mixed units** — `min(clamp(14rem, 52vw, 30rem), 55dvh)` is valid
  CSS; the `dvh` term wins only when it is the smaller value (short-height
  landscape), and no-ops otherwise.

## Desired End State

On a real iPad held in **landscape** (installed PWA), every drill screen — both
exercise types (before and after answering), the count-picker setup, and the
results screen — fits within the viewport: **no vertical scroll, no clipped action
buttons**, staff still legible, tap targets still finger-sized. Portrait iPad,
iPhone, and desktop render **identically to the post-S-07 baseline**.

Verify by: installing/opening the PWA on the iPad, rotating to landscape, and
walking a full session (setup → both exercise types → results) with no scrolling or
clipped controls; then confirming portrait/iPhone/desktop are visually unchanged.

## What We're NOT Doing

- **No layout restructure.** Keep the centered vertical stack; do not build a
  two-column landscape layout or an orientation breakpoint. (Decided: height-cap the
  existing stack.)
- **No hard `overflow: hidden` clipping.** Size-to-fit with scroll left as a
  last-resort safety valve so a control is never hidden/unreachable. (Decided.)
- **No changes to portrait/iPhone/desktop sizing.** Height terms must no-op when
  width is the binding dimension. (Decided: only landscape changes.)
- **No changes to `Staff.tsx`, the musical/geometry core, or any logic/state/API.**
- **No new dependencies, no breakpoints, no container queries.**
- Not touching non-drill screens (dashboard, auth, history, landing) — out of scope
  for this symptom.

## Implementation Approach

Add a **`dvh`-based height ceiling** to each height-driving `--drill-*` token using
`min(<existing width clamp>, <dvh term>)`. In portrait/iPhone/desktop the `dvh` term
is large, so `min()` returns the unchanged width clamp → **zero regression**. In
short-height landscape the `dvh` term becomes the smaller value → the staff and
prompt shrink just enough to fit.

Sizing priority (decided): **tap/action targets keep a child-finger floor** (their
existing `4rem` / `3.5rem` clamp minimums, guarded so a `dvh` ceiling can never push
them below the floor); the **staff and the giant prompt letter give first** (largest
height reclaim); **gaps tighten** via a new `--drill-gap` token. The results
screen's bespoke sizes (mascot, accuracy, stat-block padding) get the same
`min(..., dvh)` treatment so the tallest view also fits.

All edits are CSS token definitions in `global.css` plus className swaps in the four
views (hardcoded gaps → gap token; results' bespoke sizes → tokenized/`min()`-capped
values). No logic, no `set:html`, no React Compiler concerns.

> `dvh` numbers below are **starting points to tune against the real iPad** (mirrors
> S-07's note). The *shape* — width clamp capped by a `dvh` ceiling that only bites
> in landscape — is what's load-bearing, not the exact constants.

## Critical Implementation Details

- **`dvh`, not `vh`.** Use dynamic viewport height so the layout is correct under
  Safari's collapsing toolbar in the in-browser case; in the installed standalone
  PWA `dvh == vh` so it's safe either way. (iOS Safari 15.4+ supports `dvh`.)
- **Floor-guard the tap/action ceilings.** A naive `min(clamp(4rem,…,6rem), 11dvh)`
  can drop below the `4rem` child-floor on a very short viewport. Wrap so the floor
  always wins, e.g. `min(clamp(4rem,9vw,6rem), max(4rem, 11dvh))` — the target never
  goes under `4rem` (tap) / `3.5rem` (action).
- **Staff width ↔ height conversion.** Staff height ≈ width ÷ 1.224. To keep the
  staff height under ~45 dvh, the staff *width* ceiling is ~`55dvh`. Tune this single
  number first — it is the dominant lever for the note→letter view.

## Phase 1: Height-aware tokens + results-screen landscape fit

### Overview

Retune the `global.css` drill tokens to be height-aware in landscape, introduce a
gap token, apply it across the four views, and landscape-fit the results screen's
bespoke sizes. One cohesive change, one verification pass (as S-07 shipped).

### Changes Required:

#### 1. Height-aware drill size tokens

**File**: `src/styles/global.css`

**Intent**: Add a `dvh` ceiling to each height-driving token so it shrinks only in
short-height landscape and is otherwise unchanged. Keep the child-finger floors on
the tap/action heights. Add a `--drill-gap` token (and a larger variant if needed
for the `gap-8` stacks) so gaps can tighten in landscape.

**Contract**: Edit the `:root` block at `src/styles/global.css:25-32`. Each affected
token becomes `min(<current clamp>, <dvh ceiling>)`; tap/action heights are
floor-guarded so the ceiling can never go below `4rem`/`3.5rem`. `--drill-shell-max`,
`--drill-tap-text`, and `--drill-caption-text` are width/affordance-driven and stay
as-is. New `--drill-gap` (≈`min(1.5rem, 3dvh)`) and, if the `gap-8` stacks need it,
`--drill-gap-lg` (≈`min(2rem, 4dvh)`). The dominant lever is the `--drill-staff-w`
`dvh` ceiling (≈`55dvh`); `--drill-prompt-text` gets a ceiling (≈`22dvh`) to tame the
11rem letter. Any *new* font-size token must be referenced as
`text-[length:var(--token)]` per the `lessons.md` Tailwind-v4 rule.

```css
/* shape only — tune dvh constants on the iPad */
--drill-staff-w: min(clamp(14rem, 52vw, 30rem), 55dvh);
--drill-prompt-text: min(clamp(6rem, 20vw, 11rem), 22dvh);
--drill-tap-h: min(clamp(4rem, 9vw, 6rem), max(4rem, 11dvh));
--drill-action-h: min(clamp(3.5rem, 8vw, 5rem), max(3.5rem, 9dvh));
--drill-feedback-text: min(clamp(1.875rem, 5.5vw, 3rem), 7dvh);
--drill-gap: min(1.5rem, 3dvh);
```

#### 2. Apply the gap token across the drill views

**File**: `src/components/drill/NoteToLetterExercise.tsx`, `LetterToNoteExercise.tsx`,
`DrillSession.tsx` (setup view), `SessionResults.tsx`

**Intent**: Replace the hardcoded outer/inner `gap-6` / `gap-8` / `gap-4` literals
that contribute landscape height with the new gap token so spacing tightens when
short. Leave grid gaps between tap buttons (`gap-3`) alone — they are width-spacing,
not the vertical hog.

**Contract**: Swap the relevant vertical-stack `gap-*` classes for
`gap-[var(--drill-gap)]` (and `gap-[var(--drill-gap-lg)]` where a `gap-8` stack is
kept larger). Affected spots: `NoteToLetterExercise.tsx:33,77`,
`LetterToNoteExercise.tsx:42,87`, `DrillSession.tsx:162,165`,
`SessionResults.tsx:57,67,72,96`. className-only.

#### 3. Landscape-fit the results screen's bespoke sizes

**File**: `src/components/drill/SessionResults.tsx`

**Intent**: The tallest view uses hardcoded sizes not covered by the shared tokens;
cap the biggest height consumers so the results screen also fits landscape, keeping
the celebratory feel in portrait unchanged.

**Contract**: Give the mascot a height-aware size (token or inline `min()`, e.g.
`h-[min(7rem,14dvh)] w-[min(7rem,14dvh)]` replacing `h-28 w-28` at
`SessionResults.tsx:62-63`) and apply a gentle `dvh` ceiling to the accuracy figure
(`text-6xl` at line 68) and/or tighten the `StatBlock` padding (`p-6` at line 31) in
short height. Prefer reusing tokens over new one-offs where a shared token already
fits. No new font-size token without the `length:` hint.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type/Astro check passes: `npx astro check`
- Build passes: `npm run build`

#### Manual Verification:

- On a real iPad in **landscape** (installed PWA): the **note→letter** view fits with
  no vertical scroll and no clipped "Dalej" button, both before and after answering.
- On a real iPad in **landscape**: the **letter→note** view fits — the prompt letter,
  the three staff option cards, feedback, and "Dalej" all visible without scroll.
- On a real iPad in **landscape**: the **setup** (count picker) and **results** screens
  fit with no scroll and no clipped action buttons.
- Staff lines stay clearly legible and tap targets stay finger-sized in landscape (no
  target below the `4rem` / `3.5rem` floors).
- **Regression**: iPhone portrait, iPad portrait, and desktop render visually
  identical to the post-S-07 baseline (the `dvh` ceilings no-op there).
- No regression in the drill flow (answer → feedback → next → results → again/done).

**Implementation Note**: After automated verification passes, pause for manual
confirmation from the human that the real-iPad landscape testing (and the
portrait/iPhone/desktop no-regression check) succeeded before marking the phase
complete.

---

## Testing Strategy

### Manual Testing Steps:

1. Install/open the PWA on the iPad; rotate to **landscape**.
2. Walk a full session: setup → a note→letter exercise → answer → a letter→note
   exercise → answer → finish to results → "Jeszcze raz". At each screen confirm no
   vertical scroll and no clipped controls.
3. Rotate to **portrait** mid-session and confirm it still looks like the post-S-07
   baseline (unchanged).
4. Re-check on iPhone (portrait) and a desktop browser: visually identical to before
   this change.
5. Edge: the shortest realistic landscape height (smaller iPad / split-view) — staff
   shrinks but tap/action targets do not drop below their floors.

## Performance Considerations

None. CSS `min()`/`dvh` are native and cheap; no new JS, no new assets, no layout
thrash. Ships the same zero-JS staff island.

## Migration Notes

None — no data, schema, or API surface touched. Pure presentation retune.

## References

- Prior slice (closed): `context/archive/2026-06-10-responsive-exercise-scaling/plan.md`
  and `plan-brief.md` — introduced the `--drill-*` tokens and flagged this exact
  landscape-overflow risk as open.
- Token definitions: `src/styles/global.css:25-32`
- Fixed-aspect staff: `src/components/staff/Staff.tsx:22-23`
- Tailwind-v4 font-size rule: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Height-aware tokens + results-screen landscape fit

#### Automated

- [x] 1.1 Linting passes: `npm run lint`
- [x] 1.2 Type/Astro check passes: `npx astro check`
- [x] 1.3 Build passes: `npm run build`

#### Manual

- [ ] 1.4 note→letter view fits landscape (no scroll, no clipped "Dalej"), before and after answering
- [ ] 1.5 letter→note view fits landscape (prompt, option cards, feedback, "Dalej" all visible, no scroll)
- [ ] 1.6 setup and results screens fit landscape (no scroll, no clipped buttons)
- [ ] 1.7 Staff legible and tap targets finger-sized in landscape (no target below the 4rem/3.5rem floors)
- [ ] 1.8 Regression: iPhone portrait, iPad portrait, desktop visually identical to post-S-07 baseline
- [ ] 1.9 No regression in the drill flow (answer → feedback → next → results → again/done)
