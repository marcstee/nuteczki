---
change_id: responsive-exercise-scaling
title: Scale exercise area to fill viewport on iPhone and iPad
status: archived
created: 2026-06-10
updated: 2026-06-10
archived_at: 2026-06-10T19:00:11Z
---

## Notes

S-07 from roadmap. Exercise area should fill the full viewport on iPhone/iPad so the music staff and answer controls scale to available screen space — staff lines clearly legible, tap targets large enough for a child's finger. Both exercise types (note-to-letter and letter-to-note) must be covered. Primary risk: fixed pixel sizes in the staff renderer staying small regardless of layout changes; secondary risk: over-scaling breaking the desktop layout. Test with Safari DevTools at 390×844 (iPhone 14) and 820×1180 (iPad Air).
