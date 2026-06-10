# Responsive Exercise Scaling Implementation Plan

## Overview

Make the drill exercise area scale to fill the viewport on iPhone and iPad. Today every
drill view is locked to a `max-w-md` (448px) centered column with a fixed-width staff and
flat tap-target sizes, so on an iPad it sits in a small column surrounded by empty navy. We
replace those fixed sizes with fluid `clamp()`-driven sizing — centralized as CSS custom
properties in `global.css` — so the staff, controls, and text grow toward near-full-width on
iPhone/iPad and cap on desktop. Covers both exercise types plus the setup (count-picker) and
results views so no screen in the session flow stays small.

## Current State Analysis

- **The staff renderer is already resolution-independent.** `src/components/staff/Staff.tsx:70`
  renders a fixed `viewBox="0 8 120 98"` with `preserveAspectRatio="xMidYMid meet"` and sizes
  entirely from its `className`. The change brief's stated "primary risk — fixed pixel sizes in
  the staff renderer" does **not** hold: the SVG scales uniformly to whatever width its container
  gives it. The fix therefore lives in the **consuming components**, exactly the alternative the
  roadmap risk note allowed ("must touch the staff renderer F-02 **or** its consuming exercise
  components").
- **The real bottleneck is fixed width/size caps in the consumers:**
  - `src/components/drill/NoteToLetterExercise.tsx:33` — root `max-w-md`; staff hard-coded
    `mx-auto w-56` (224px); answer buttons `h-16 text-2xl`; Next `h-14 text-xl`; feedback `text-3xl`.
  - `src/components/drill/LetterToNoteExercise.tsx:42` — root `max-w-md`; prompt letter `text-8xl`;
    option staffs are already `w-full` (they scale with their card); Next/feedback fixed.
  - `src/components/drill/DrillSession.tsx:163` — setup (count-picker) `max-w-md`; buttons `h-16 text-2xl`.
  - `src/components/drill/SessionResults.tsx:57` — `max-w-md`; action buttons `h-14`/`h-12`; big stat numbers fixed.
- **Page wrapper** `src/pages/drill.astro:50` is `flex min-h-screen items-center justify-center p-4`
  — full-screen, no Topbar, vertically + horizontally centered. Good base; we keep it.
- **Tap targets** are already above Apple's 44px minimum (`h-16` = 64px) but flat across screen
  sizes, so they don't grow to fill an iPad.
- **No test runner** in this repo; CI gate is lint + build (`CLAUDE.md`, `.github/workflows/ci.yml`).
  Type checking is `astro check` (`@astrojs/check` is a dependency). A `/dev/staff` preview page
  (`src/pages/dev/staff.astro`) renders the staff in isolation for manual checks.

## Desired End State

Opening `/drill` on an iPhone (390×844) or iPad (820×1180 portrait and 1180×820 landscape) shows
the exercise area filling most of the viewport width: a large, crisp staff, large answer buttons /
option cards comfortable for a child's finger, and legible text — for **both** exercise types and
for the setup and results screens. On desktop the layout caps at a generous size (no over-scaling,
no vertical scrollbar). Verified visually in Safari DevTools responsive mode at the three device
sizes plus a desktop width.

### Key Discoveries:

- `Staff.tsx` needs **no changes** — it already scales via `className` width (`src/components/staff/Staff.tsx:70`).
- The staff's intrinsic aspect ratio is fixed at `120:98 ≈ 1.22:1` (`src/components/staff/Staff.tsx:23-24`),
  so any width we give it dictates its height. Width caps must therefore respect viewport **height**,
  especially in landscape — see Critical Implementation Details.
- `LetterToNoteExercise` option staffs are `w-full` inside a `grid-cols-3` (`src/components/drill/LetterToNoteExercise.tsx:80`),
  so they already scale once the shell width grows — only the shell, gap, and prompt-letter size need touching.

## What We're NOT Doing

- Not modifying `Staff.tsx`, `geometry.ts`, `pitch.ts`, or any musical/geometry core — the staff
  already scales.
- Not stretching content to fill **vertical** height (no flex-grow regions); the page stays
  vertically centered (`drill.astro` `min-h-screen items-center`). Decision: avoids Safari URL-bar
  overflow/scroll risk.
- Not letting the layout grow edge-to-edge on wide **desktop** — fluid sizes cap so desktop looks
  like a large iPad (defuses the brief's secondary "over-scaling breaks desktop" risk).
- Not introducing breakpoint (`sm:`/`md:`/`lg:`) variants — the scaling is fluid via `clamp()`.
- Not adding container queries, JS-driven resize logic, or any new dependency.
- Not changing the drill state machine, scoring, persistence, or any behavior — purely presentational.

## Implementation Approach

Centralize the scaling curve as a small set of CSS custom properties in `src/styles/global.css`
(`:root`), each a `clamp(min, <viewport-relative>, max)`. The **min** keeps iPhone comfortable, the
**preferred** (`vw`) term grows the element toward near-full-width on iPad, and the **max** caps it on
desktop. Components reference these via Tailwind v4 arbitrary-value utilities (`max-w-[var(--drill-shell-max)]`,
`w-[var(--drill-staff-w)]`, `h-[var(--drill-tap-h)]`, `text-[var(--drill-tap-text)]`, …). One file owns
the whole curve, so tuning against real-device testing is a single edit and the desktop cap lives in one place.

This is a className-only change set — no logic, no new components — so React Compiler and the Astro
lint rules are unaffected.

## Critical Implementation Details

**User experience spec — staff width cap vs. viewport height.** Because the staff has a fixed
`1.22:1` aspect ratio, widening it also makes it taller. The binding constraint is **landscape iPad
(1180×820)**: the full Note→Letter view (progress line + staff card + two rows of answer buttons +
feedback + Next) must fit within ~820px tall **with no scroll**. The `--drill-staff-w` max is the lever
— it must stay small enough that the tallest view clears the shortest target height. Set the max
conservatively (≈30rem) and confirm during manual testing that neither exercise view scrolls at
820×1180, 1180×820, or 390×844; lower the staff/target maxes if it does. This vertical headroom — not
width — is what determines the caps.

## Phase 1: Fluid scaling across all drill views

### Overview

Add the fluid scaling custom properties to `global.css`, then replace the fixed `max-w-md`,
fixed staff width, and flat tap-target/text sizes across all four drill views with references to
those properties.

### Changes Required:

#### 1. Fluid scaling tokens

**File**: `src/styles/global.css`

**Intent**: Define the single source of truth for the drill scaling curve so every view shares one
tunable set of fluid sizes and the desktop cap lives in one place.

**Contract**: Add a block of CSS custom properties under the existing `:root` (alongside the brand
tokens). These names are the contract the components reference. Example curve (values are tunable
against device testing — the shapes matter more than the exact numbers):

```css
/* Drill responsive scaling (S-07): grow toward near-full-width on iPhone/iPad,
   cap on desktop. Tune against Safari DevTools 390×844, 820×1180, 1180×820.
   The staff is fixed-aspect (~1.22:1), so --drill-staff-w's max is height-bound
   in landscape — keep it conservative. */
--drill-shell-max: clamp(28rem, 92vw, 60rem);       /* outer column width cap */
--drill-staff-w: clamp(14rem, 52vw, 30rem);          /* note→letter hero staff */
--drill-tap-h: clamp(4rem, 9vw, 6rem);               /* answer-button height */
--drill-tap-text: clamp(1.5rem, 3.2vw, 2.5rem);      /* answer-button glyph */
--drill-prompt-text: clamp(5rem, 14vw, 9rem);        /* letter→note prompt letter */
--drill-feedback-text: clamp(1.875rem, 4vw, 3rem);   /* ✓/✗ feedback line */
--drill-action-h: clamp(3.5rem, 8vw, 5rem);          /* Next / primary action height */
```

#### 2. Note→Letter exercise

**File**: `src/components/drill/NoteToLetterExercise.tsx`

**Intent**: Let the whole view — staff, answer buttons, feedback, Next — grow with the viewport so
it fills an iPad and gives a child large finger targets, while preserving the current iPhone layout.

**Contract**: Replace fixed utilities with the tokens: root wrapper `max-w-md` →
`max-w-[var(--drill-shell-max)]` (keep `w-full`); staff `mx-auto w-56` → `mx-auto w-[var(--drill-staff-w)]`;
answer buttons `h-16` → `h-[var(--drill-tap-h)]` and `text-2xl` → `text-[var(--drill-tap-text)]`;
feedback `text-3xl` → `text-[var(--drill-feedback-text)]`; Next button `h-14` → `h-[var(--drill-action-h)]`.
No structural or logic changes.

#### 3. Letter→Note exercise

**File**: `src/components/drill/LetterToNoteExercise.tsx`

**Intent**: Grow the option cards (and the staffs inside them) and the prompt letter with the
viewport. The option staffs are already `w-full`, so they scale automatically once the shell widens.

**Contract**: Root wrapper `max-w-md` → `max-w-[var(--drill-shell-max)]`; prompt letter `text-8xl`
→ `text-[var(--drill-prompt-text)]`; feedback `text-3xl` → `text-[var(--drill-feedback-text)]`; Next
`h-14` → `h-[var(--drill-action-h)]`. Leave the option `<Staff className="w-full" />` as-is. Optionally
bump the `grid-cols-3 gap-3` gap if cards crowd on iPad (visual judgment during testing).

#### 4. Setup (count-picker) view

**File**: `src/components/drill/DrillSession.tsx`

**Intent**: Keep the session start screen consistent with the exercises so the child doesn't open
into a small centered column before the first exercise.

**Contract**: In the `phase === "setup"` branch (`DrillSession.tsx:161`), wrapper `max-w-md` →
`max-w-[var(--drill-shell-max)]`; count buttons `h-16` → `h-[var(--drill-tap-h)]` and `text-2xl` →
`text-[var(--drill-tap-text)]`. Heading may scale to `text-[var(--drill-feedback-text)]` for balance.
No change to the active/finished branches beyond what the child components already provide.

#### 5. Results view

**File**: `src/components/drill/SessionResults.tsx`

**Intent**: Keep the end-of-session screen consistent with the rest of the flow on iPad.

**Contract**: Root wrapper `max-w-md` → `max-w-[var(--drill-shell-max)]`; the two action buttons
`h-14`/`h-12` → `h-[var(--drill-action-h)]` (Done may stay one step shorter). Stat blocks and the
accuracy number can keep their current sizes or scale modestly — visual judgment, no hard requirement.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`
- Production build succeeds: `npm run build`

#### Manual Verification:

- iPhone 14 (390×844, Safari DevTools): both exercise types, setup, and results fill the available
  width; staff and buttons are large and legible; no horizontal scroll.
- iPad Air portrait (820×1180): exercise area is near-full-width (not a small centered column); no
  vertical scroll on any view.
- iPad Air landscape (1180×820): both exercise views fit within the height with **no vertical scroll**
  (the staff-aspect constraint from Critical Implementation Details).
- Desktop (~1440px): layout caps at a generous size — staff/targets do not balloon, no scrollbar,
  no regression vs. the previous desktop look.
- Both exercise types covered (note→letter and letter→note), plus the count-picker and results screens.

**Implementation Note**: After completing this phase and all automated verification passes, pause
for manual confirmation from the human that the device-size testing was successful before marking
the change complete.

---

## Testing Strategy

### Unit Tests:

- None — this is a presentational className-only change with no logic, and the repo has no test
  runner. Coverage comes from the automated lint/typecheck/build gates plus manual device testing.

### Manual Testing Steps:

1. `npm run dev`, open `/drill` in Safari, enable responsive design mode.
2. At 390×844, 820×1180, and 1180×820, run a full session of each exercise type; confirm the area
   fills the viewport, targets are finger-sized, text is legible, and nothing scrolls unexpectedly.
3. At a desktop width (~1440px), confirm the layout caps and looks unchanged from before.
4. Optionally open `/dev/staff` to sanity-check staff rendering in isolation at each width.

## Performance Considerations

None of note. `clamp()` and CSS custom properties are native CSS with no runtime cost; the change
ships zero additional JS.

## References

- Change brief: `context/changes/responsive-exercise-scaling/change.md`
- Roadmap S-07: `context/foundation/roadmap.md:181`
- Staff renderer (already scalable): `src/components/staff/Staff.tsx:70`
- Brand tokens / `:root` block to extend: `src/styles/global.css:18`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Fluid scaling across all drill views

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 00bd4a1
- [x] 1.2 Type checking passes: `npx astro check` — 00bd4a1
- [x] 1.3 Production build succeeds: `npm run build` — 00bd4a1

#### Manual

- [x] 1.4 iPhone 14 (390×844): both exercise types, setup, results fill width; no horizontal scroll — 00bd4a1
- [x] 1.5 iPad portrait (820×1180): near-full-width, no vertical scroll on any view — 00bd4a1
- [x] 1.6 iPad landscape (1180×820): both exercise views fit height with no vertical scroll — 00bd4a1
- [x] 1.7 Desktop (~1440px): layout caps, no over-scaling or scrollbar, no regression — 00bd4a1
- [x] 1.8 Both exercise types + setup + results all covered — 00bd4a1
