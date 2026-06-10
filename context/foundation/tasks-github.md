---
project: "Nuteczki"
source: context/foundation/roadmap.md
created: 2026-05-27
repo: marcstee/nuteczki
---

# GitHub Issues — Roadmap Migration

Roadmap items from `roadmap.md` migrated to GitHub Issues with labels and milestones.

## Labels

| Label | Color | Purpose |
|-------|-------|---------|
| `foundation` | `#1D76DB` | Infrastructure work (F-xx) |
| `slice` | `#0E8A16` | User-visible vertical slices (S-xx) |
| `north-star` | `#FBCA04` | Critical-path milestone (S-01) |

## Milestones

| Milestone | Issues |
|-----------|--------|
| Foundations | #1, #2, #3 |
| MVP Drill | #4, #5, #6, #7, #8, #9, #10 |

## Issues

| Issue | Roadmap ID | Change ID | Labels | Blocked by |
|-------|-----------|-----------|--------|------------|
| #1 | F-01 | `session-data-schema` | foundation | — |
| #2 | F-02 | `staff-renderer` | foundation | — |
| #3 | F-03 | `pwa-setup` | foundation | — |
| #4 | S-01 | `basic-drill-note-to-letter` | slice, north-star | #1, #2 |
| #5 | S-02 | `letter-to-note-exercise` | slice | #4 |
| #6 | S-03 | `adaptive-selection` | slice | #4 |
| #7 | S-04 | `session-history` | slice | #4 |
| #8 | S-05 | `ui-redesign` | slice | #4 |
| #9 | S-06 | `session-history-ux` | slice | #7 |
| #10 | S-07 | `responsive-exercise-scaling` | slice | #5, #8 |

> #8 (S-05) is net-new beyond PRD v1 but pulled into the **MVP Drill** milestone by decision.
> #9 (S-06) is a post-MVP UX enhancement (pagination + delete), also pulled into **MVP Drill** by decision.
> #10 (S-07) is a mobile UX fix (viewport-filling exercises for iPhone/iPad), also pulled into **MVP Drill** by decision.

## Dependency graph

```
F-01 ──┐
       ├──> S-01 ──┬──> S-02 ──┐
F-02 ──┘           ├──> S-03   ├──> S-07
                   ├──> S-04 ──> S-06
                   └──> S-05 ──┘
F-03 (parallel, no dependents)
```
