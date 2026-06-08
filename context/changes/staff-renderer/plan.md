# F-02 Staff Renderer Implementation Plan

## Overview

Build a reusable, **declarative React SVG component** that renders a five-line treble staff with a single whole-note positioned correctly by pitch, across the fixed beginner range **C4 → A5** (13 diatonic positions, one ledger line below to one ledger line above). This is roadmap **F-02**, the identified **top blocker (skills)**, governed by the guardrail "**musical accuracy is non-negotiable**." It is consumed by S-01 (note→letter) and S-02 (letter→note, where noteheads become clickable answer targets).

The component is hand-rolled SVG (not VexFlow): each pitch maps to a deterministic staff step via a **pure, exported function**; the SVG scales with a fixed `viewBox` + CSS (no JS, no `ResizeObserver`); the treble clef is an inline `<path>`; noteheads are addressable `<g>` elements so S-02 can later attach handlers without refactoring.

## Current State Analysis

- **No notation rendering exists.** `src/components/` holds auth islands (`auth/`), Astro chrome (`Banner.astro`, `Topbar.astro`, `Welcome.astro`), and shadcn primitives (`ui/`). No `staff/` directory.
- **All current React is declarative `useState`** (e.g. [SignInForm.tsx](src/components/auth/SignInForm.tsx)) with **default exports**, mounted from `.astro` with `client:load` ([signin.astro:16](src/pages/auth/signin.astro)). This change adds no imperative DOM — it stays in the declarative house style.
- **`output: "server"` on the Cloudflare adapter** means every island is SSR'd inside `workerd` (no DOM). A pure-SVG component is fully SSR-safe and, being display-only, needs **no client directive at all** — Astro renders it to static HTML and ships zero JS.
- **No test framework is installed** (no Vitest, no `test` script, zero project tests). Per the testing decision, none is added here; accuracy is discharged via type-checking + a manual visual gallery, with the pure mapping kept export-ready for Vitest later.
- **Stack**: Astro 6.3.1, React 19.2.6, TypeScript strict (`astro/tsconfigs/strict` + typescript-eslint `strictTypeChecked`), Tailwind v4 (via `src/styles/global.css`, no config file), `react-compiler/react-compiler: error`, path alias `@/*` → `src/*`.

## Desired End State

A `Staff` React component at `src/components/staff/Staff.tsx` that, given `note="C4"` … `note="A5"`, renders a musically correct treble staff with the note in its correct vertical position, ledger line drawn for C4 and A5, scaling crisply to any container width. The 13-position pitch→staff-step mapping lives in a pure, exported `pitch.ts` module. A dev gallery route renders all 13 pitches for manual verification against a reference. Type-check, lint, and build all pass.

### Key Discoveries:

- **Reference position table is already distilled** in [vexflow-api-notes.md §4](context/changes/staff-renderer/vexflow-api-notes.md) (lines 90–106) — the 13-row pitch → staff-position table is the source of truth the pure map must match.
- **Custom SVG is the better long-term fit** ([library-research.md:45-58](context/changes/staff-renderer/library-research.md)): declarative, SSR-able, Tailwind-styleable, smallest bundle, and noteheads are native clickable `<g>` for S-02 — versus VexFlow's imperative bridge and clunky `getSVGElement()` click wiring.
- **Only 2 of 13 pitches need a ledger line**: C4 (one below) and A5 (one above). D4 and G5 sit in the spaces just outside the staff and need no ledger.
- **The H-vs-B convention is a labeling concern, not a rendering one** ([prd.md:87](context/foundation/prd.md), FR-004 buttons `C D E F G A H`). The renderer is purely positional and uses scientific names (`B4`, never `H4`); the exercise UI (S-01/S-02) owns the `H` label.

## What We're NOT Doing

- **No VexFlow** — and no other notation library.
- **No accidentals** (sharps/flats), **no chords/multi-note**, **no rhythm/stems** beyond the stemless whole note, **no time signature**, **no bass clef**. All PRD non-goals.
- **No interactivity** — no `onClick`, selection, or correct/incorrect states. That is S-02's job; we only make the SVG structure ready for it.
- **No Vitest/test setup** — deferred by decision; the pure map is structured so tests bolt on later with no rework.
- **No offline-font work** — not needed; the clef is inline SVG. (Offline is F-03's concern and is now moot for this component.)
- **No H-vs-B letter labeling** — the renderer is positional only.

## Implementation Approach

A single source of musical truth (`pitch.ts`) is kept pure and free of any rendering concern: it maps each `Pitch` to an integer **staff step** and a ledger-line flag. The SVG component (`Staff.tsx`) is a pure function of props — it converts staff step → Y via the pure, exported `stepToY()` helper (the geometry constants live in the core, not the component), draws the five lines, an inline treble-clef `<path>`, an open whole-notehead, and a ledger line when required. A dev gallery route is the manual-verification surface where the accuracy guardrail is eyeballed across all 13 pitches.

The staff coordinate model: bottom line **E4 = staff step 0**; each diatonic step up (next letter) = **+1 step = half a line-gap** in the rendered Y. Even step indices fall on lines (0=E4, 2=G4, 4=B4, 6=D5, 8=F5); odd indices fall on spaces. Below the staff: D4 = −1 (space), C4 = −2 (ledger line). Above: G5 = +9 (space), A5 = +10 (ledger line). A pitch needs a ledger line exactly when its step is even **and** outside `[0, 8]` — i.e. C4 and A5 in this range.

## Critical Implementation Details

- **Clef placement is a musical-correctness check, not just decoration.** Pin the **Bravura `gClef` glyph (SMuFL U+E050)** as the asset (Bravura is SIL OFL 1.1 — OFL §1 permits embedding the path data with attribution). Extract the glyph's `d` path and its source metrics (`unitsPerEm` + glyph bounding box) from the font **once**, then store the path and a one-line OFL attribution in `treble-clef.ts`. **Alignment is deterministic, not eyeballed**: SMuFL registers the gClef so its glyph origin `(0,0)` sits on the G line, so the transform is (1) translate the origin to `(clefX, stepY(2))` — the G4-line Y — and (2) uniformly scale by `LINE_GAP / staffSpaceInFontUnits`, where `staffSpaceInFontUnits = unitsPerEm / 4` per the SMuFL em convention, applied with a Y-axis flip since SVG Y grows downward. The Phase 3 visual check then only *confirms* this math; it is not the alignment mechanism.
- **Notehead is an open (hollow) whole note** — no stem, no rhythmic meaning, ideal for a flashcard ([vexflow-api-notes.md:73-78](context/changes/staff-renderer/vexflow-api-notes.md)). Render as a stroked ellipse (optionally slightly rotated) with no fill, drawn last so it sits above the staff lines.
- **`viewBox` must reserve vertical room for one ledger line above and below the staff and for the clef**, which extends past the top and bottom lines. Get this padding right once; everything else is relative to the line gap.

## Phase 1: Pitch model + staff geometry (pure core)

### Overview

Create the accuracy-critical, render-free core: the `Pitch` type, the ordered pitch list, the pure pitch→staff-step + ledger-line mapping, and the pure step→Y geometry (constants + `stepToY`). This is the single source of musical truth and the thing a later Vitest suite will assert against — the whole pitch→step→Y chain, with no DOM.

### Changes Required:

#### 1. Pitch domain module

**File**: `src/components/staff/pitch.ts`

**Intent**: Define the typed beginner-range pitch set and the pure mapping from a pitch to its position on the treble staff, decoupled from any SVG/pixel concern so it can be unit-tested later without a DOM.

**Contract**: Exports:
- `type Pitch` — a string union of the 13 scientific pitches, in ascending order: `'C4' | 'D4' | 'E4' | 'F4' | 'G4' | 'A4' | 'B4' | 'C5' | 'D5' | 'E5' | 'F5' | 'G5' | 'A5'`.
- `const PITCHES: readonly Pitch[]` — the same 13 in ascending order (drives the gallery and future answer pools).
- `function pitchToStaffStep(pitch: Pitch): number` — pure; returns the integer staff step (E4 = 0, +1 per diatonic step). Implement as a `Record<Pitch, number>` lookup, not arithmetic on the string, so it is auditable row-by-row against the reference table.
- `function needsLedgerLine(step: number): boolean` — pure; `true` when `step` is even and outside `[0, 8]`.

The staff-step values are the load-bearing contract (a wrong value = a musically wrong note). They must match [vexflow-api-notes.md §4](context/changes/staff-renderer/vexflow-api-notes.md):

| Pitch | Staff step | On staff |
| --- | --- | --- |
| C4 | −2 | ledger line below |
| D4 | −1 | space below bottom line |
| E4 | 0 | bottom line |
| F4 | 1 | 1st space |
| G4 | 2 | 2nd line |
| A4 | 3 | 2nd space |
| B4 | 4 | middle line |
| C5 | 5 | 3rd space |
| D5 | 6 | 4th line |
| E5 | 7 | top space |
| F5 | 8 | top line |
| G5 | 9 | space above top line |
| A5 | 10 | ledger line above |

#### 2. Staff geometry module

**File**: `src/components/staff/geometry.ts`

**Intent**: Hold the step→Y conversion and its constants in the pure core (not inside `Staff.tsx`), so the **entire** pitch→step→Y chain is pure and unit-testable without a DOM — completing the "single source of musical truth" rather than leaving its second half DOM-coupled.

**Contract**: Exports:
- `const LINE_GAP: number` and `const BASELINE_Y: number` (the E4 / step-0 bottom-line Y) — the staff geometry constants.
- `function stepToY(step: number): number` — pure; `BASELINE_Y - step * (LINE_GAP / 2)`. The same integer steps `pitchToStaffStep` returns map to the correct Y (even steps land on lines, odd on spaces). Both `Staff.tsx` and the clef transform consume this — no geometry arithmetic lives in the component.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- All 13 `pitchToStaffStep` rows match the reference table above (and [vexflow-api-notes.md §4](context/changes/staff-renderer/vexflow-api-notes.md)).
- `needsLedgerLine` returns `true` only for C4 (−2) and A5 (10) across the range.
- `stepToY` is grounded and monotonic: `stepToY(0)` is the E4 (bottom-line) Y, `stepToY(2)` the G4-line Y, and each +1 step moves up by exactly `LINE_GAP / 2`.

**Implementation Note**: After this phase and automated verification passes, pause for human confirmation of the mapping table before proceeding.

---

## Phase 2: Staff SVG component

### Overview

Build the declarative SVG component that turns a `Pitch` into a rendered treble staff with the note in its correct position, scaling via `viewBox` + CSS, with addressable noteheads and theming hooks.

### Changes Required:

#### 1. Treble clef path constant

**File**: `src/components/staff/treble-clef.ts`

**Intent**: Hold the inline treble-clef vector path as a constant so the component stays readable and the asset's provenance is documented in one place. The pinned asset is the **Bravura `gClef` glyph (SMuFL U+E050)**, SIL OFL 1.1.

**Contract**: Exports `const TREBLE_CLEF_PATH: string` (the glyph's SVG path `d` data, extracted once from Bravura) and `const CLEF_FONT_UNITS_PER_EM: number` (Bravura's `unitsPerEm`, read from the font metadata at extraction time — this is the divisor for the SMuFL staff-space scale `unitsPerEm / 4`). A leading comment names the source (`Bravura gClef, SMuFL U+E050`) and the OFL 1.1 license. Drawn with `fill="currentColor"` by the consumer.

#### 2. Staff component

**File**: `src/components/staff/Staff.tsx`

**Intent**: Render a complete, musically correct treble staff with a single note, as a pure function of props, in the declarative house style (default export). No effects, no refs, no client JS required.

**Contract**: Props:
- `note: Pitch` — required; the single pitch to render.
- `className?: string` — passed to the root `<svg>` for Tailwind sizing/color (e.g. `w-48 text-slate-900`).
- `aria-label?: string` — optional override; defaults to a positional description (e.g. `"${note} on the treble staff"`).

Rendering:
- Root is `<svg>` with a fixed `viewBox`, `preserveAspectRatio="xMidYMid meet"`, `role="img"`, the resolved `aria-label`, and the passed `className`. No wrapper `<div>`, no explicit pixel width/height — CSS controls size.
- Five staff lines, the inline `TREBLE_CLEF_PATH` placed by the **deterministic SMuFL transform** (translate the glyph origin to the G4-line Y `stepToY(2)`, uniformly scale by `LINE_GAP / (CLEF_FONT_UNITS_PER_EM / 4)`, with a Y-axis flip), and the notehead at `Y` taken straight from the pure core — `stepToY(pitchToStaffStep(note))` — with no geometry arithmetic in the component.
- When `needsLedgerLine(step)`, draw a short ledger line centered on the notehead at that Y.
- Notehead is an open whole note, wrapped in `<g data-pitch={note}>` (the stable, addressable hook S-02 will target). Drawn last so it overlays the lines.
- Lines, clef, notehead, and ledger all use `currentColor` so a Tailwind `text-*` class themes the whole staff.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint` (including `react-compiler/react-compiler` — must stay clean with no refs/effects)
- Build passes: `npm run build`

#### Manual Verification:

- Rendering `note="C4"` through `note="A5"` places each note on the correct line/space per the reference table.
- C4 and A5 each show exactly one ledger line; no other pitch shows one.
- The treble clef's spiral sits on the G4 line and the glyph looks correct.
- A Tailwind `text-*` class on the component recolors lines, clef, and notehead together; the SVG scales crisply with its container width.

**Implementation Note**: After this phase and automated verification passes, pause for human confirmation of the visual rendering (use the Phase 3 gallery or an ad-hoc mount) before proceeding.

---

## Phase 3: Verification gallery (all 13 pitches)

### Overview

Add a lightweight dev route that renders every pitch C4→A5 in a labeled grid — the surface where the "accuracy non-negotiable" guardrail is manually verified and where S-01/S-02 developers preview the component.

### Changes Required:

#### 1. Dev gallery page

**File**: `src/pages/dev/staff.astro`

**Intent**: Provide a single page that mounts `Staff` for all 13 pitches (iterating `PITCHES`), each labeled with its scientific name, for side-by-side visual verification against a reference.

**Contract**: An Astro page that imports `Staff` and `PITCHES`, renders one labeled `Staff` per pitch in a responsive grid. No client directive needed (static SVG). **Dev-only gate**: when `!import.meta.env.DEV`, the page short-circuits to a 404 (e.g. `return new Response(null, { status: 404 })`) *before* rendering, so the route is reachable under `npm run dev` but never serves in the deployed Worker. A short note in the page (or a comment) marks this as a dev/verification route, not a product surface.

### Success Criteria:

#### Automated Verification:

- Build passes with the new page: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- `npm run dev`, open `/dev/staff`: all 13 notes appear, each on the musically correct line/space, matching the reference table at a glance.
- C4 and A5 show a single ledger line; the clef is correctly placed on every staff.
- The grid scales reasonably on a narrow (mobile-width) viewport — confirming `viewBox` + CSS scaling works for the PWA target.
- The DEV gate holds: in a production build (not `npm run dev`), `/dev/staff` returns 404; it renders only under the dev server.

**Implementation Note**: This gallery is the accuracy-verification artifact. After confirming all 13 positions, the change is complete. The route is kept as a dev aid but **gated behind `import.meta.env.DEV`** so it 404s in production — `unlinked ≠ inaccessible`, and `output: "server"` would otherwise SSR it publicly on every request in the deployed Worker.

---

## Testing Strategy

### Unit Tests:

- **Deferred by decision** — no Vitest is added in this change. `pitch.ts` is written as pure, exported functions specifically so a later suite can assert all 13 `pitchToStaffStep` values and `needsLedgerLine` without a DOM. This is the natural first test target when the project adopts a runner.

### Manual Testing Steps:

1. Build and run dev; open `/dev/staff`.
2. Compare each of the 13 rendered notes to the reference table ([vexflow-api-notes.md §4](context/changes/staff-renderer/vexflow-api-notes.md)) — every note on the correct line/space.
3. Confirm C4 and A5 each render exactly one ledger line and no other pitch does.
4. Confirm the treble clef spiral centers on the G4 line on every staff.
5. Resize the browser to a phone-width viewport; confirm the staves scale crisply and stay legible.
6. Apply a `text-*` color class; confirm lines, clef, and notehead all recolor.

## Performance Considerations

Negligible — static SVG, no client JS for the display-only component, no fonts to load, smallest possible bundle. The `viewBox` + CSS approach avoids layout-thrashing `ResizeObserver` work entirely.

## Migration Notes

None. New, additive component with no schema, dependency, or config changes (no new npm packages).

## References

- Related research: [`context/changes/staff-renderer/research.md`](context/changes/staff-renderer/research.md) (compatibility) and [`library-research.md`](context/changes/staff-renderer/library-research.md) (approach decision).
- Reference position table: [`vexflow-api-notes.md §4`](context/changes/staff-renderer/vexflow-api-notes.md) (lines 90–106).
- House-style island: [`src/components/auth/SignInForm.tsx`](src/components/auth/SignInForm.tsx) (default export, declarative).
- Roadmap entry: [`context/foundation/roadmap.md:75-86`](context/foundation/roadmap.md) (F-02 outcome + accuracy guardrail).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Pitch model + staff geometry (pure core)

#### Automated

- [x] 1.1 Type checking passes: `npx astro check`
- [x] 1.2 Linting passes: `npm run lint`

#### Manual

- [x] 1.3 All 13 `pitchToStaffStep` rows match the reference table
- [x] 1.4 `needsLedgerLine` returns `true` only for C4 and A5
- [x] 1.5 `stepToY` grounded: stepToY(0)=E4 line, stepToY(2)=G4 line, +1 step = −LINE_GAP/2

### Phase 2: Staff SVG component

#### Automated

- [ ] 2.1 Type checking passes: `npx astro check`
- [ ] 2.2 Linting passes: `npm run lint` (react-compiler clean)
- [ ] 2.3 Build passes: `npm run build`

#### Manual

- [ ] 2.4 C4→A5 each render on the correct line/space
- [ ] 2.5 C4 and A5 show exactly one ledger line; no other pitch does
- [ ] 2.6 Treble clef spiral sits on the G4 line and looks correct
- [ ] 2.7 `text-*` class themes lines/clef/notehead together; SVG scales crisply

### Phase 3: Verification gallery (all 13 pitches)

#### Automated

- [ ] 3.1 Build passes with the new page: `npm run build`
- [ ] 3.2 Linting passes: `npm run lint`

#### Manual

- [ ] 3.3 `/dev/staff` shows all 13 notes on musically correct positions
- [ ] 3.4 C4/A5 ledger lines and clef placement correct across the grid
- [ ] 3.5 Grid scales legibly at mobile width (PWA target)
- [ ] 3.6 DEV gate: `/dev/staff` 404s in a production build; renders only under the dev server
