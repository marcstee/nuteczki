---
change_id: basic-drill-note-to-letter
title: "Basic drill: note-to-letter exercises with feedback and session stats"
status: implemented
created: 2026-06-08
updated: 2026-06-09
archived_at: null
---

## Notes

Source: roadmap slice **S-01** (north star) in `context/foundation/roadmap.md`.

Outcome: child can start a drill session by choosing a preset exercise count, see note-to-letter exercises (note on staff → pick correct letter from 7 answer buttons) with random selection, get immediate visual feedback after each answer, and see session stats (correct/incorrect count) when the session auto-finishes.

- PRD refs: US-01, FR-002, FR-004, FR-006, FR-007, FR-008
- Prerequisites: F-01 `session-data-schema` (persistence), F-02 `staff-renderer` (note rendering)
- Scope guard: one exercise type (note-to-letter), random selection only. Letter-to-note (S-02) and adaptive weighting (S-03) are out of scope.
