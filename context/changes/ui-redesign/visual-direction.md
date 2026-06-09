# Visual Direction: Nuteczki redesign

> The captured design target for the UI redesign. Input for /10x-plan — the
> precondition the frame brief (`frame.md`) flagged. Hex values are a **draft
> starting palette** to refine during planning, not locked tokens.

## Reference & qualities to borrow

- **Duolingo** — borrow its *flat design*, *vivid/"live" colors*, and *cartoon
  character* energy. Note: Duolingo's canvas is light; we are **not** copying
  that — we want its flatness + playfulness on a dark canvas (see below).
- **Hero / mascot** — a single **AI-generated** cartoon character asset,
  displayed on three screens: the **home/landing page**, the **dashboard**, and
  the **session summary**. One static asset (not a set of poses) for v1 — keeps
  scope tight. See IP note in open questions.

## Theme / mode

- **Dark, but not spacey.** Kill the starter's cosmic theme entirely — no space
  gradient, no glowing orbs, no star field, no glassmorphism. Replace with a
  **flat, solid dark canvas** (deep navy-blue), not near-black.
- Flat surfaces and cards, not translucent glass.

## Palette (draft — Stitch-derived)

Blue/purple family, colors inspired by Stitch (the Disney character) — palette
inspiration only, not the character itself.

| Role | Draft hex | Notes |
| --- | --- | --- |
| Background | `#13243F` | Deep flat navy — dark but not spacey |
| Surface / card | `#1E3252` | One step lighter than background |
| Primary (Stitch sky blue) | `#5BC2E7` | Main interactive / brand blue |
| Secondary (purple) | `#8B7CF0` | Playful purple accent |
| Accent (pink) | `#F48FB1` | Celebration / fun moments (Stitch ear-pink) |
| Text | `#F2F6FF` | Near-white on dark |
| Muted text | `#A9B6CE` | Secondary labels |
| Success / correct | `#5BD96A` | Clear positive feedback |
| Error / incorrect | `#FF7A7A` | Soft coral, not harsh red |

## Typography

- **Rounded and highly readable.** No specific font chosen yet — candidates:
  Fredoka, Baloo 2, Nunito, Quicksand. /10x-plan to pick one (or confirm with
  user). Large, friendly sizing for a young child.

## Mood

Playful · fun · soft · lively. Target user is a young child — generous spacing,
big touch targets, friendly tone.

## Hard constraints

- **Staff / notation rendering stays exactly as-is: black notes on white.** The
  staff is a white panel; the redesign works *around* it. On the drill screens
  the white staff card sits inside the dark UI — needs framing/contrast so the
  white panel reads as intentional, not a hole. Musical accuracy is
  non-negotiable (PRD guardrail).
- All UI copy in **Polish**, single-language (no i18n machinery) — per the
  change brief.
- Kill the cosmic theme and all leftover starter content.

## Open questions for /10x-plan (or user)

1. **IP caution** — "colors from Stitch" = palette inspiration only. When
   generating the mascot, prompt for an **original character** — explicitly not
   a Stitch likeness — to avoid Disney IP in a shipped app. (Risk is higher now
   that the asset is AI-generated.)
2. **Typography** — confirm a specific rounded font (Fredoka / Baloo 2 / Nunito).
3. **Palette precision** — draft hexes above need converting to the project's
   oklch design-token system (`src/styles/global.css`) and a light/dark token
   audit.

> **Resolved:** Mascot = one AI-generated static asset, shown on home/landing,
> dashboard, and session summary. No multi-pose set in v1.
> **Asset ready:** `public/mascot.webp` (1024×1024, 132 KB) — reference as
> `/mascot.webp`. Already well-sized; no compression needed.
