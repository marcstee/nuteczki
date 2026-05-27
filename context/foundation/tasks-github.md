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
| MVP Drill | #4, #5, #6, #7 |

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

## Dependency graph

```
F-01 ──┐
       ├──> S-01 ──┬──> S-02
F-02 ──┘           ├──> S-03
                   └──> S-04
F-03 (parallel, no dependents)
```
