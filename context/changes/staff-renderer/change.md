---
change_id: staff-renderer
title: Reusable music staff component that renders a note positioned by pitch
status: implemented
created: 2026-06-08
updated: 2026-06-08
archived_at: null
---

## Notes

Roadmap F-02 (foundation) — from `context/foundation/roadmap.md`.

**Outcome:** A reusable React component renders a five-line music staff with a single note positioned correctly by pitch; the guardrail "musical accuracy is non-negotiable" is satisfied at the component level before any exercise type consumes it.

- **PRD refs:** FR-004, FR-005
- **Prerequisites:** none (parallel with F-01 session-data-schema, F-03 pwa-setup)
- **Unlocks:** S-01 (note-to-letter exercise), S-02 (letter-to-note exercise)
- **Risk:** Identified top blocker (skills). Note positions must be musically correct across the beginner range — first lower ledger line to first upper ledger line. Sequenced early so the riskiest skill gap surfaces first.

**Plan review (2026-06-08):** triaged — F1/F2/F3 all fixed; verdict REVISE → SOUND. See [`reviews/plan-review.md`](./reviews/plan-review.md). F1: pinned Bravura gClef (SMuFL U+E050) + deterministic alignment. F2: extracted pure `geometry.ts` (`stepToY`). F3: `/dev/staff` gated behind `import.meta.env.DEV`.

## Research

- [`library-research.md`](./library-research.md) — library/approach research. Two contenders: **VexFlow 5** (de-risks the blocker, agent-friendly) vs a **hand-rolled SVG component** (lighter, better fit for S-02's interactive answer UI). Open decision for `/10x-plan`; a short spike would settle it.
