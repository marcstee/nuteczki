---
change_id: session-data-schema
title: Define Supabase schema for drill sessions, answers, and per-note error history
status: archived
created: 2026-05-28
updated: 2026-06-09
archived_at: 2026-06-09T09:36:31Z
---

## Notes

Foundation F-01 from roadmap. Supabase tables for drill sessions, individual answers, and per-note error history — the persistence layer that S-01 (drill), S-03 (adaptive selection), and S-04 (session history) all read from and write to. Schema must support both simple session-stats queries and the adaptive algorithm's per-note error counts. PRD refs: FR-001, FR-003, FR-008, FR-009.
