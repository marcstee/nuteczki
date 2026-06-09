# Child-Friendly UI Redesign (Polish) — Plan Brief

> Full plan: `context/changes/ui-redesign/plan.md`
> Frame brief: `context/changes/ui-redesign/frame.md`
> Visual direction (captured target): `context/changes/ui-redesign/visual-direction.md`

## What & Why

Replace the inherited 10x Astro starter look (cosmic theme, English copy, leftover
marketing content) with Nuteczki's own child-friendly identity: a flat dark-navy
canvas, a playful blue/purple/pink palette, the Fredoka font, an AI-generated
mascot, and Polish copy throughout. The frame brief established the real problem:
**the look lives nowhere** — the design-token layer the starter shipped is unused,
and every screen hardcodes cosmic utilities, so there's no single source of truth
to redesign *from*. This is the project's first deliberate design decision.

## Starting Point

The token layer (`global.css`) is the default neutral grayscale and is bypassed;
16 files hardcode the cosmic palette (`bg-cosmic`, blue/purple gradients, glass);
`Welcome.astro` still renders the "10x Astro Starter" marketing page; copy is
English and `<html lang="en">`. The reference target is already captured
(`visual-direction.md` + `public/mascot.webp`), so discovery is done.

## Desired End State

Every screen — landing, dashboard, drill flow, results, history, auth — renders on
the navy brand canvas with Fredoka, the mascot on its three designated screens, and
Polish copy (playful for the child, neutral for the parent). The palette/font/radii
are defined once and consumed everywhere via semantic tokens; no cosmic utility or
target English string survives. The staff still renders black-on-white inside an
intentionally framed card.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Token mechanism | Single dark theme — redefine `:root`, drop `.dark` | One source of truth using the layer shadcn already wired; no dead light theme | Plan |
| Scope | Whole app — incl. auth + landing | Delivers the "one cohesive identity" the frame's reframed problem demands | Plan |
| Font | Fredoka, self-hosted woff2 | Most distinctly child-friendly; self-host keeps the PWA offline + instant | Plan |
| Copy register | Playful for child (drills), neutral for parent (history/auth) | Matches the PRD's two personas reading different screens | Plan |
| Verification | lint + astro check + build + grep guard + manual sweep | Matches the existing CI gate and the visual nature of the work | Plan |
| Staff rendering | Unchanged (black-on-white, framed card) | PRD guardrail — musical accuracy is non-negotiable | Frame / Visual |
| Mascot | One static asset on landing/dashboard/results | Keeps v1 scope tight | Visual |

## Scope

**In scope:** token/font foundation; landing (replace starter), dashboard, topbar;
drill setup + both exercises + results; history; signin/signup/confirm-email + auth
form components; Polish copy everywhere; mascot on 3 screens; `lang="pl"`.

**Out of scope:** staff renderer; i18n machinery; a light theme; mapping Supabase's
pass-through error messages to Polish; Playwright/visual-regression harness;
business logic, data, API, or routing changes (beyond an index→dashboard redirect);
multiple mascot poses / motion design.

## Architecture / Approach

Foundation first, then retrofit by screen cluster, then clean up. Phase 1 redefines
`:root` to the navy palette (oklch, from the draft hexes), self-hosts Fredoka as the
default font, and sets `lang="pl"` — but **keeps** `bg-cosmic` so un-retrofitted
screens don't break. Because `body` already `@apply bg-background text-foreground`
and `button.tsx` already consumes the tokens, the base canvas and primitives go
on-brand for free. Phases 2-4 strip each cluster's local cosmic/glass wrappers for
token utilities + Polish + mascot, in descending visibility order. Phase 5 deletes
the orphaned `bg-cosmic` utility and runs the grep guard + full visual sweep.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Design foundation | Navy tokens, Fredoka, `lang=pl`, Banner palette | oklch conversion / contrast off vs draft hex |
| 2. Entry & shell | Mascot home (replaces starter), topbar, dashboard | Logged-in redirect / mascot placement |
| 3. Drill flow | Count picker, both exercises, results (+mascot) | White staff card must read as intentional on navy |
| 4. History & auth | History (pl-PL dates), full auth flow | Three history render-states must stay distinct |
| 5. Cleanup & verify | Remove `bg-cosmic`, grep guard, visual sweep | A stray English string / cosmic utility slipping through |

**Prerequisites:** All feature slices shipped (S-01–S-04, done); `visual-direction.md`
+ `public/mascot.webp` present (done).
**Estimated effort:** ~3-5 sessions across 5 phases (foundation + 3 retrofit clusters
+ cleanup); after-hours-friendly, no blocking dependencies.

## Open Risks & Assumptions

- Draft hexes need oklch conversion + a contrast check (esp. text on
  primary/secondary/accent); refine against the mascot — values may shift.
- Fredoka subset must include full Polish Latin-Extended diacritics.
- Supabase pass-through auth error messages remain English (accepted; out of scope).
- No test harness means regressions are caught by manual sweep + grep guard only.

## Success Criteria (Summary)

- Every screen is on-brand navy + Fredoka + Polish, with the mascot on its three
  screens — no cosmic theme or starter content anywhere.
- Grep guard finds no `bg-cosmic`/cosmic utilities and no target English UI strings;
  lint + astro check + build all pass.
- The drill still works end-to-end and the staff renders musically correct,
  black-on-white, in an intentionally framed card.
