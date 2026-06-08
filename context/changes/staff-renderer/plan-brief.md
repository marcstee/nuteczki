# F-02 Staff Renderer — Plan Brief

> Full plan: `context/changes/staff-renderer/plan.md`
> Research: `context/changes/staff-renderer/research.md`

## What & Why

Build a reusable React component that renders a five-line treble staff with a single note placed correctly by pitch, across the fixed beginner range C4 → A5. It's roadmap **F-02**, the identified **top blocker (skills)**, because "musical accuracy is non-negotiable" — getting provably-correct note positioning in place is the foundation S-01 (note→letter) and S-02 (letter→note) both build on.

## Starting Point

The app has auth islands and Astro chrome but **no notation rendering of any kind** and no `staff/` directory. All current React is declarative `useState` with default exports; there is no test framework installed. The app SSRs every island in Cloudflare `workerd`, so a client-side library would need care — but a pure-SVG component sidesteps that entirely.

## Desired End State

A `Staff` component takes `note="C4"` … `note="A5"` and renders a musically correct treble staff with the note on its right line/space (ledger line for C4 and A5), scaling crisply to any width. The 13-position pitch→staff-step mapping lives in a pure, exported module. A dev gallery route shows all 13 pitches for at-a-glance verification.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Rendering approach | Hand-rolled SVG (not VexFlow) | Declarative, SSR-safe, Tailwind-styleable, smallest bundle, and noteheads are native clickable `<g>` — the cleanest fit for S-02. | Plan |
| Public API | Typed `Pitch` union (`'C4'…'A5'`) | Self-documenting, can't pass an out-of-range note, decoupled from any render lib. | Plan |
| Accuracy guardrail | Pure exported map + manual gallery (tests deferred) | The pitch→step map is kept a pure function so Vitest bolts on later; for now type-check + visual gallery discharge it. | Plan |
| S-02 interactivity | Display-only, S-02-ready structure | Noteheads are addressable `<g data-pitch>` but carry no handlers — keeps the blocker focused, S-02 wiring stays trivial. | Plan |
| Responsive sizing | Fixed `viewBox` + CSS scaling | Crisp at any size, SSR-safe, no `ResizeObserver` — idiomatic for SVG and ideal for the PWA. | Plan |
| Treble clef glyph | Inline SVG `<path>` | Zero deps, no font loading, offline by default — removes F-03 font entanglement. | Plan |

## Scope

**In scope:** typed pitch model, pure pitch→staff-step map with ledger logic, the `Staff` SVG component (5 lines + inline clef + whole-notehead + ledger lines), `viewBox`/CSS scaling, `currentColor` theming, addressable noteheads, a dev verification gallery.

**Out of scope:** VexFlow, accidentals, chords/multi-note, rhythm/stems, bass clef, click/selection (S-02), Vitest setup, offline fonts, and the H-vs-B letter labeling (a downstream exercise concern — the renderer is purely positional).

## Architecture / Approach

Three small modules in a new `src/components/staff/`: `pitch.ts` (the render-free musical truth — `Pitch` type, `pitchToStaffStep`, `needsLedgerLine`), `treble-clef.ts` (the inline clef path constant), and `Staff.tsx` (a pure-function SVG component mapping staff step → Y and drawing lines, clef, notehead, and any ledger line). A `/dev/staff` Astro page renders all 13 pitches as the manual-verification surface. No new npm dependencies; being static SVG, the component needs no client directive and ships zero JS.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Pitch model + geometry | Pure `Pitch` type + 13-row staff-step map + ledger logic | A wrong row = a musically wrong note — verified against the reference table |
| 2. Staff SVG component | `Staff.tsx`: lines + inline clef + notehead + ledger, themed and scalable | Clef path sourcing/licensing and aligning the glyph to the G4 line |
| 3. Verification gallery | `/dev/staff` showing all 13 pitches | Minimal — this is the accuracy-verification artifact |

**Prerequisites:** none (parallel with F-01, F-03).
**Estimated effort:** ~1 focused session across the 3 phases.

## Open Risks & Assumptions

- The treble-clef path must be sourced from a permissively-licensed asset (public-domain or OFL) and visually aligned so its spiral sits on the G4 line — the one genuinely fiddly piece.
- Accuracy rests on manual visual verification this change (tests deferred); the pure map keeps that low-risk and makes adding tests later a drop-in.

## Success Criteria (Summary)

- Every pitch C4→A5 renders on its musically correct line/space, with ledger lines only for C4 and A5.
- The staff scales crisply on a mobile-width viewport and themes via a Tailwind `text-*` class.
- Type-check, lint (react-compiler clean), and build all pass with no new dependencies.
