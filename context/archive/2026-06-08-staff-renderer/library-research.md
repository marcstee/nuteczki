---
change_id: staff-renderer
doc: library-research
created: 2026-06-08
updated: 2026-06-08
method: web research (Exa) against project constraints
---

# F-02 staff-renderer — Library / approach research

Research into how to render the five-line staff + single note for F-02.

## Constraints this was scored against

- **Stack:** Astro 6 islands + React 19, TypeScript strict, Tailwind v4, Cloudflare Workers, npm (`context/foundation/tech-stack.md`).
- **PWA / offline** target (iPhone/iPad via Safari, F-03).
- **Scope:** a *single* note on a treble staff, fixed beginner range — one ledger line below to one ledger line above (≈ C4 → A5, ~13 diatonic positions). No chords, no rhythm, no time signatures (PRD non-goals).
- **Guardrail:** "musical accuracy is non-negotiable."
- **Roadmap context:** F-02 is the explicit **top blocker (skills)**; built as a foundation before any slice (S-01, S-02) consumes it.
- **Downstream:** S-02 (letter-to-note) makes the staff itself the answer UI — child picks the correct note from 3 visual options *on the staff* (clickable noteheads).

## Decision: two real contenders

Everything else is overkill or too immature (see Rejected). The choice is **VexFlow vs a hand-rolled SVG component.**

### Option A — VexFlow 5 (primary recommendation)

[github.com/vexflow/vexflow](https://github.com/vexflow/vexflow) · de-facto standard web music-engraving engine.

- **Version:** 5.0.0 (released 2025-03-05). TypeScript (ships types), MIT, SVG output, client-side.
- **Why it fits F-02:**
  - Directly neutralizes the top blocker — clef glyph, ledger lines, pitch→position all handled by the engine. We don't hand-own musical correctness. Satisfies the accuracy guardrail by construction.
  - Most **agent-friendly** option: huge training-data presence, current (2026) VexFlow-5 + React-19 + TS tutorials to copy.
- **Integration cost (stack-specific):**
  - **Not a React library** — writes to a real DOM node. Bridge with `useRef` + `useEffect`; clear `container.innerHTML` before each draw; use a `ResizeObserver` for responsive width (important on mobile/PWA).
  - **Offline fonts:** VexFlow 5 renders glyphs from SMuFL fonts loaded by the browser at runtime (Bravura + Academico). Getting-started examples pull them from the jsDelivr CDN — for an offline PWA we must **self-host the `.woff2` files** (`@vexflow-fonts/bravura`, `@vexflow-fonts/academico`) and add them to the service-worker cache (ties into F-03).
  - Use the modular `vexflow-core` build (no bundled fonts) or `vexflow-bravura` (one font) to keep the bundle lean.
  - Client-only island (`client:visible` / `client:load`); Cloudflare Workers SSR won't execute it.
- **Refs:**
  - Getting Started (V5): https://vexflow.github.io/vexflow-examples/guides/getting-started/
  - V5 release notes / font-loading change: https://github.com/vexflow/vexflow/issues/224
  - React 19 + TS tutorial: https://medium.com/@michael-fares/rendering-music-with-vexflow-5-and-react-8de44830d09f
  - Responsive/mobile (ResizeObserver) writeup: https://levelup.gitconnected.com/how-to-render-music-notation-in-react-without-breaking-on-mobile-9615f812a3ec

### Option B — hand-rolled SVG React component (strong alternative)

Because the range is **narrow and fixed**, a custom component is genuinely competitive and may be the better long-term fit.

- Each pitch → a deterministic Y offset (~13-row lookup table). Small enough to unit-test and verify against a reference image, so it is **not** the open-ended "skills blocker" a full score would be.
- **Declarative + idiomatic React**, styled directly with Tailwind. No `useEffect`/imperative bridge, no `ResizeObserver`, SSR-able in Astro.
- **Wins for S-02:** clickable note options are just `<g onClick>` with Tailwind hover/correct/incorrect states. With VexFlow you'd reach into the rendered SVG (`note.getSVGElement()` + `addEventListener`) — clunkier.
- Smallest bundle; no offline-font headache (draw the treble clef as one inline SVG path or a single bundled glyph).
- **Cost:** we own correctness, and we draw the clef ourselves.

### How to choose

- The roadmap framing (top blocker = skills, accuracy non-negotiable, foundation built before slices) tips the **foundation** toward **VexFlow** — get a provably-correct staff in place first.
- If PWA bundle/offline simplicity, Tailwind styling, and the interactive S-02 answer UI weigh more, the **custom SVG** is the cleaner architecture and very achievable for this fixed range.
- Both are defensible. Recommend a short spike comparing the two on the real stack before committing, since this is the top blocker.

## Rejected

| Option | Why rejected |
| --- | --- |
| **abcjs** | Renders ABC notation; we'd map each note to an ABC string. Extra abstraction, no payoff for single notes. |
| **OpenSheetMusicDisplay (OSMD)** | MusicXML renderer built *on top of* VexFlow. Massive overkill — authoring MusicXML to draw one notehead. |
| **VectorScore (`vector-score`)** | Conceptually perfect (lightweight SVG/TS, `drawNote('C4q')`, treble staff) but published Dec 2025, near-zero adoption / no training-data presence. Too risky as a foundation dependency for a solo, agent-driven project. Revisit if it matures. |

## Open question for /10x-plan

Pick **VexFlow 5** vs **custom SVG** for the staff renderer. Leaning VexFlow to de-risk the blocker for the foundation; custom SVG is the lighter fit and better for the S-02 interactive answer UI. A quick spike would settle it.
