---
change_id: drill-landscape-fit
title: Stop the drill area scrolling/clipping in landscape on iPad
status: implementing
created: 2026-06-10
updated: 2026-06-10
---

## Notes

Follow-up to S-07 (responsive-exercise-scaling), which made the drill views fluid
but shipped one open risk unclosed: in landscape on iPad (~1180×820) the
fixed-aspect staff (~1.22:1) plus the giant prompt letter, tap targets, feedback,
and action button stack taller than the viewport, so the drill area scrolls and the
"Dalej" / action buttons can clip. Observed on a real installed iPad PWA, landscape.

Fix: make the drill size tokens **height-aware in landscape only** — add `dvh`
ceilings via `min()` so portrait iPad, iPhone, and desktop (the layouts S-07 just
tuned) stay pixel-identical, while short-height landscape shrinks the staff and
prompt to fit. Tap/action targets keep their child-finger floors; gaps tighten.
Cover all four drill views (both exercise types + setup + results); the results
screen has bespoke hardcoded sizes that also need landscape-fitting.
