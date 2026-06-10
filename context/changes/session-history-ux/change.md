---
change_id: session-history-ux
title: Add pagination and delete to session history
status: implementing
created: 2026-06-10
updated: 2026-06-10
archived_at: null
---

## Notes

S-06 from roadmap. User can page through session history instead of scrolling one unbounded list, and delete an individual session (with a confirmation step). Delete must cascade to answer rows so no orphaned answers skew the adaptive algorithm (S-03 reads recent answers). S-05 redesign already shipped — new controls adopt those patterns.
