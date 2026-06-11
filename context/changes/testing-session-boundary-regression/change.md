---
change_id: testing-session-boundary-regression
title: Session-boundary regression net (Phase 2)
status: implementing
created: 2026-06-11
updated: 2026-06-11
archived_at: null
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "Session-boundary regression net".
Risks covered: #3 (Silent save failure / data loss), #4 (Wrong end-of-session summary). Test types planned: unit + integration.
Risk response intent:
- Risk #3: Prove that after a completed session, its rows are retrievable from the real schema; a save failure surfaces an error, never a silent success. Challenge "HTTP 200 / no exception thrown = persisted." Integration test against real seeded local Supabase — no schema mock (that is what hid the prod gap the team was burned by in Q2).
- Risk #4: Given a hand-counted answer sequence, the summary counts and per-type breakdown match the independent total. Challenge "it is a number = it is the right number." Oracle computed by hand from domain knowledge, never from the same reduce the code uses (oracle problem / tautology).
