---
change_id: testing-bootstrap-exercise-integrity
title: Bootstrap Vitest and cover exercise winnability + pitch-position integrity
status: implementing
created: 2026-06-11
updated: 2026-06-11
archived_at: null
---

## Notes

Rollout Phase 1 from context/foundation/test-plan.md — "Bootstrap + exercise integrity".

Risks covered:
- **#1 Dead-end exercise** — child shown an exercise whose correct answer is missing from the options, or the rendered note matches no offered option, so the exercise is unwinnable. Prove that for EVERY generated exercise the correct answer is present in the options AND is consistent with the rendered note descriptor (the winnability invariant). Challenge "non-empty options = valid exercise". Cheapest layer hypothesis: unit on the exercise generator. Oracle from the music domain (note names C–H), never from the generator's own output.
- **#2 Musically wrong note** — a note renders one line/space off, teaching the wrong pitch. Prove a known note (e.g. a treble-clef reference pitch) maps to its musically-correct staff position across the beginner range (first lower to first upper ledger line). Challenge "it looks like a note = correct position". Cheapest layer hypothesis: unit on the pitch→coordinate mapping; oracle from music theory.

This phase also stands up the test runner (Vitest) — the project currently has 0 test files and no test deps.
