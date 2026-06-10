# Frame Brief: UI Redesign — from Astro starter to "my app"

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

The app's UI looks and feels like the 10x Astro starter, not like the user's
own product. The user wants help framing the redesign precisely enough to hand
to /10x-plan.

## Initial Framing (preserved)

- **User's stated cause or approach**: The fix is "redesign the UI" across all
  screens (child-friendly, Polish copy — per change.md / roadmap S-05).
- **User's proposed direction**: "I know the styles I like" — wants the work
  framed precisely for /10x-plan rather than left open-ended.
- **Pre-dispatch narrowing**: Design reference = *reference apps / images /
  palette the user can point to* (capturable, not yet in-repo). Worst tell =
  *leftover starter content* (landing hero, feature cards, English copy).
  Scope = *whole app, one cohesive identity*.

## Dimension Map

"Looks like the starter" originates at five distinct layers, not one:

1. **Landing/entry content** — `index.astro` renders the starter's marketing
   page verbatim ("10x Astro Starter" hero, "cosmic developer experience",
   3 feature cards, English). The loudest surface tell.
2. **Cosmic visual theme** — dark space gradient, orbs, star field,
   glassmorphism, neon purple/blue/pink gradients — the starter's signature
   look, hardcoded into every app screen.
3. **No design-token layer in use** ← root. `:root` tokens are the default
   neutral-grayscale shadcn theme (every color `oklch(x 0 0)`), and the app
   screens don't use them — they hardcode cosmic utilities. There is no single
   definition of "the app's look." ← initial framing under-weights this.
4. **No captured design target** — the desired look exists only as external
   references in the user's head; nothing committed to the repo.
5. **Copy/UX** — English strings + non-child UX; brief requires Polish +
   child-friendly across drill/feedback/stats/history.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| 1. Starter content is the problem | `Welcome.astro:35-123` literal "10x Astro Starter" hero + feature cards, English | STRONG (but surface, not root) |
| 2. Cosmic theme is app-wide | `bg-cosmic` in `global.css:113`; hardcoded blue/purple/white-glass palette in 15 screens/components | STRONG |
| 3. No token layer — look is scattered | `global.css:6-39` tokens are neutral grayscale defaults; only `button.tsx` + `global.css` use semantic tokens; all 15 screens bypass them | STRONG (root) |
| 4. Target not captured | `change.md:12` + `roadmap.md:161` both flag "needs a concrete design reference before /10x-plan"; user has refs but not in-repo | STRONG (planning gate) |
| 5. Copy/UX is English/generic | English strings across `Topbar`, `Welcome`, `dashboard`, `history`; brief requires Polish | STRONG (in-scope axis) |

## Narrowing Signals

- **User has external references (apps/images/palette), not in-repo yet** → the
  target is *capturable but uncaptured*. Capturing it is a bounded, known step —
  not open-ended discovery.
- **Worst tell = leftover starter content, but scope = whole-app cohesive
  identity** → the symptom the user feels most (content) is narrower than the
  fix they actually want (identity). Deleting `Welcome.astro` + translating
  copy would *not* satisfy "one cohesive identity" while the cosmic palette
  stays hardcoded in 15 files.
- **No sub-agent dispatch** — small codebase read end-to-end directly; code-side
  hypotheses conclusive without fan-out (frame guardrail #6/#7).

## Cross-System Convention

The project has **never made a deliberate design decision.** All 8 archive
folders are feature slices (schema, staff renderer, drills, adaptive selection,
history); `shape-notes.md` contains zero visual/style/palette preferences. The
cosmic aesthetic is the bootstrap default that every feature slice built on top
of — never chosen, never revisited. So this redesign is the *first* design
decision in the project's history, and the codebase has no home (token/theme
layer) for one because the starter never used the one it shipped.

## Reframed Problem Statement

> **The actual problem to plan around is**: the project has never made a
> deliberate visual-identity decision — the redesign must (a) capture the
> identity the user already has in reference form, (b) give it a single home the
> starter never used, and (c) apply it across every screen, replacing both the
> leftover starter content and the cosmic palette that 15 files hardcode.

"Redesign the UI" is correct in spirit but mis-sized as stated. The acute
symptom (starter content) is the cheapest, most visible win but not the root;
the root is that "the look" lives nowhere — it's scattered across 15 files of
hardcoded utilities, with no token/theme layer and no captured target. A plan
that only repaints visible screens recreates the same scatter. A cohesive
whole-app identity (the user's stated scope) needs a single source of truth to
propagate from.

## Confidence

**HIGH** — strong code evidence (tokens unused, theme app-wide, starter content
present), corroborated by project history (no prior design decision) and the
user's answers (references exist and are capturable; scope is whole-app
cohesive). The only precondition for a precise plan is landing the captured
reference into the change folder.

## What Changes for /10x-plan

The plan is not "repaint each screen." It is three coupled things: **(1)**
capture the user's reference apps/images/palette into an in-repo visual-direction
artifact (precondition — bring it before, or as, plan phase 1); **(2)** establish
a single home for the look (the theme/token layer the starter shipped but the app
bypasses — the *mechanism* is /10x-plan's call); **(3)** retrofit all 15
screens/components off hardcoded cosmic utilities onto that layer, including
deleting starter content and converting copy to Polish + child-friendly UX.
Sequencing and the token mechanism are solution decisions for /10x-plan.

## References

- Source files: `src/styles/global.css:6` (default tokens), `:113` (`bg-cosmic`);
  `src/components/Welcome.astro:35` (starter hero); `src/pages/dashboard.astro:8`,
  `src/components/Topbar.astro`, `src/components/drill/*`, `src/pages/history.astro`
  (hardcoded cosmic palette); `src/components/ui/button.tsx` (only token consumer)
- Brief sources: `context/changes/ui-redesign/change.md`,
  `context/foundation/roadmap.md:153-176` (S-05)
- Investigation tasks: none — surface read directly, no sub-agent dispatch
