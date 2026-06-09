---
change_id: letter-to-note-exercise
title: Add letter-to-note exercise type to drill sessions
status: implementing
created: 2026-06-09
updated: 2026-06-09
archived_at: null
---

## Notes

Roadmap slice **S-02** (from `context/foundation/roadmap.md`).

- **Outcome:** user can see letter-to-note exercises in drill sessions — a letter name is shown, and the child picks the correct note on the staff from 3 visual options — mixed alongside note-to-letter exercises.
- **PRD refs:** US-01, FR-005
- **Prerequisites:** S-01 (`basic-drill-note-to-letter`) — already in `context/changes/`.
- **Parallel with:** S-03 (`adaptive-selection`), S-04 (`session-history`).
- **Risk (per roadmap):** Low — staff renderer (F-02) and drill session infrastructure (S-01) are already in place. Main new work is the exercise UI variant (show letter, display 3 note options on staff) and wiring it into the session's exercise pool.
