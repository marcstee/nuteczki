---
change_id: adaptive-selection
title: Adaptive exercise selection weighted toward recent mistakes
status: impl_reviewed
created: 2026-06-09
updated: 2026-06-09
archived_at: null
---

## Notes

S-03 from roadmap. Outcome: exercises weighted ~70% toward recently missed notes, ~30% random — each drill targets the child's weakest spots rather than cycling randomly. Prerequisites: S-01 (done). PRD refs: US-01, FR-003. Parallel with: S-04. Algorithm reads per-note error counts from the last 3-5 sessions (answer_history table from F-01).
