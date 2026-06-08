---
change_id: staff-renderer
doc: vexflow-api-notes
created: 2026-06-08
updated: 2026-06-08
source: Context7 MCP — /vexflow/vexflow (V5) + /0xfe/vexflow (core API)
scope: only the VexFlow surface F-02 needs (one treble note on a five-line staff)
---

# F-02 staff-renderer — VexFlow API notes

Distilled VexFlow docs for implementing F-02: a reusable React island that renders a
five-line treble staff with a **single** note positioned by pitch, beginner range
**C4 → A5** (one ledger line below to one ledger above). No rhythm, no time signature,
no chords (PRD non-goals).

> Applies to **VexFlow 5.0.0** (the `vexflow/vexflow` package). V5 changed font loading
> vs. older V4 tutorials — read "Font loading" below before copying any V4 snippet.

## 1. Install

```bash
npm i vexflow
```

## 2. Build variant + font loading (V5 — the important part)

V5 renders glyphs from SMuFL fonts (Bravura music + Academico text). Two entry points:

| Import | Fonts | Use when |
| --- | --- | --- |
| `vexflow` (full) | bundled, auto-loaded | simplest; just import and draw |
| `vexflow/core` | none — you must `loadFonts()` | lean bundle, **required for offline control** |

- **Full build** — no font step needed:
  ```ts
  import { Renderer, Stave, StaveNote, Formatter } from 'vexflow';
  ```
- **Core build** — must load fonts once before the first draw (returns a Promise):
  ```ts
  import VexFlow from 'vexflow/core';
  await VexFlow.loadFonts('Bravura', 'Academico'); // music + text fallback
  VexFlow.setFonts('Bravura', 'Academico');
  // ...now safe to render
  ```

**PWA/offline (ties into F-03):** the core build pulls `.woff2` from the jsDelivr CDN by
default. For offline Safari you must **self-host** the font files (`@vexflow-fonts/bravura`,
`@vexflow-fonts/academico`) and add them to the service-worker cache. The full build sidesteps
this by bundling fonts into JS (bigger bundle, no extra requests). Pick per the F-03 trade-off.

## 3. Core rendering API (low-level — recommended for F-02)

Lower-level classes give the most control and the least machinery for a single note.

```ts
import { Renderer, Stave, StaveNote, Formatter } from 'vexflow';

// 1. SVG renderer into a container <div> (SVG = crisp/scalable, best for responsive PWA)
const renderer = new Renderer(containerEl, Renderer.Backends.SVG);
renderer.resize(width, height);
const context = renderer.getContext();

// 2. Five-line staff + treble clef. NO time signature (not needed for F-02).
const stave = new Stave(0, 0, width);
stave.addClef('treble');
stave.setContext(context).draw();

// 3. A single note positioned by pitch.
const note = new StaveNote({
  clef: 'treble',     // ensures correct ledger lines + stem direction
  keys: ['c/4'],      // pitch → vertical position (see §4)
  duration: 'w',      // whole note = no stem, no rhythmic meaning → ideal for a flashcard
});

// 4. Format + draw one bare note (FormatAndDraw uses a soft voice, so an
//    incomplete bar of a single note is fine — no Voice/time-sig wiring needed).
Formatter.FormatAndDraw(context, stave, [note]);
```

> Note on naming: V5 prefers camelCase options (`numBeats`, `beatValue`); old V4 snippets use
> `num_beats`/`beat_value`. For F-02 you avoid `Voice` entirely via `FormatAndDraw`.

## 4. Pitch notation + the F-02 beginner range

Key format is `"<letter>/<octave>"`, lowercase letter, scientific pitch (middle C = `c/4`).
VexFlow draws **ledger lines automatically** for C4 and A5 — this is exactly the musical
correctness F-02 must not hand-own (the top-blocker concern).

Treble staff reference — lines `E4 G4 B4 D5 F5`, spaces `F4 A4 C5 E5`. Beginner range:

| Pitch | VexFlow key | Position on treble staff |
| --- | --- | --- |
| C4 | `c/4` | 1st ledger line **below** staff (middle C) |
| D4 | `d/4` | below bottom line |
| E4 | `e/4` | bottom line |
| F4 | `f/4` | 1st space |
| G4 | `g/4` | 2nd line |
| A4 | `a/4` | 2nd space |
| B4 | `b/4` | middle line |
| C5 | `c/5` | 3rd space |
| D5 | `d/5` | 4th line |
| E5 | `e/5` | top space |
| F5 | `f/5` | top line |
| G5 | `g/5` | above top line |
| A5 | `a/5` | 1st ledger line **above** staff |

13 diatonic positions — drive the renderer from this lookup. No accidentals in scope (the
child answers letter names), so never call `addModifier(new Accidental(...))`.

## 5. React island integration

VexFlow is **not** a React library — it writes to a real DOM node imperatively. Bridge it:

```tsx
import { useEffect, useRef } from 'react';
import { Renderer, Stave, StaveNote, Formatter } from 'vexflow';

export function StaffNote({ noteKey, width = 240, height = 160 }: {
  noteKey: string; width?: number; height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = ''; // clear previous render (StrictMode double-invoke + re-renders)

    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const ctx = renderer.getContext();

    const stave = new Stave(0, 0, width);
    stave.addClef('treble').setContext(ctx).draw();

    const note = new StaveNote({ clef: 'treble', keys: [noteKey], duration: 'w' });
    Formatter.FormatAndDraw(ctx, stave, [note]);

    return () => { el.innerHTML = ''; };
  }, [noteKey, width, height]);

  return <div ref={ref} />;
}
```

- Mount as a client island in Astro: `client:visible` (or `client:load`). Cloudflare Workers
  SSR will **not** execute VexFlow — it's client-only.
- Responsive width: wrap in a `ResizeObserver` and re-draw on container resize (mobile/PWA).
- **S-02 forward-look:** for clickable note answers you'll reach into the rendered SVG via
  `note.getSVGElement()` and attach listeners — confirm that ergonomics during the spike, since
  it's the main place a hand-rolled SVG (Option B in `library-research.md`) would be cleaner.

## 6. EasyScore (the high-level alternative — probably overkill for F-02)

`Factory` + `EasyScore` parse a string DSL (`'C#5/q, B4, A4'`) and auto-build voices. Great for
multi-note scores, but it pulls in voices/time-signatures/formatting machinery you don't need for
one note. Shown for completeness:

```ts
import { Factory } from 'vexflow';
const vf = new Factory({ renderer: { elementId: 'output', width: 300, height: 180 } });
const score = vf.EasyScore();
vf.System().addStave({ voices: [score.voice(score.notes('C4/w'))] }).addClef('treble');
vf.draw();
```

Recommendation: use the **low-level API (§3)** for F-02 — minimal surface, direct control over
the single note, easiest to verify against a reference image for the accuracy guardrail.

## Sources (Context7 MCP)

- `/vexflow/vexflow` (V5) — async font loading (`loadFonts`/`setFonts`), ESM core entry, build variants.
- `/0xfe/vexflow` — `Renderer`/`Stave`/`StaveNote`/`Formatter` core API, `keys`/`duration`, `FormatAndDraw`.
