<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: PWA Setup (Manifest, Service Worker, Icons)

- **Plan**: context/changes/pwa-setup/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-06-10
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical · 2 warnings · 3 observations (F5 added during triage)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Gate re-run (2026-06-10)

- Manifest valid JSON — PASS
- `npm run lint` — PASS (no errors; only benign `projectService` parser notices)
- `npx astro check` — PASS (0 errors, 0 warnings, 5 hints)
- prettier on changed files (`public/sw.js`, `offline.html`, `manifest.webmanifest`, Layout.astro, eslint.config.js) — PASS
- `npm run build` — PASS (artifacts emitted under `dist/client/`)
- All 8 SW precache assets exist in build output (atomic `addAll` will not fail)
- Note: repo-wide `prettier --check .` reports 41 pre-existing doc / `database.types.ts` warnings, unrelated to this change.

## Findings

### F1 — Artifacts emit to dist/client/, not dist/ as the plan asserts

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture / Success Criteria
- **Location**: plan.md success criteria 2.1 & 3.5; wrangler.jsonc:9
- **Detail**: The plan's gating automated check is literally `ls dist/sw.js dist/offline.html dist/_headers`, and Progress 2.1 / 3.5 are checked `[x]`. But @astrojs/cloudflare 13.5.0 emits static assets to `dist/client/` — real paths are `dist/client/sw.js`, `dist/client/offline.html`, `dist/client/_headers`. The stated command fails as written, so those boxes were marked complete without it passing. Deeper: `wrangler.jsonc` sets `assets.directory = "./dist"` while the adapter outputs assets under `./dist/client/`. The PWA files sit in the SAME directory as `favicon.ico`, the fonts, and `/_astro/*` (confirmed all under `dist/client/`), so they share fate with assets the app already relies on — IF the live site serves those at root, the PWA serves correctly too; if not, `/sw.js` (and every favicon) 404s in production. This `wrangler` line is PRE-EXISTING — pwa-setup did not touch it — but it's the load-bearing assumption behind "verifiably installable in production".
- **Fix A**: Correct the plan's path text to `dist/client/...`
  - Strength: Cheap; aligns doc with reality. Justified if the live deploy already serves favicons (strong prior — UI-redesign shipped with these fonts/icons).
  - Tradeoff: Papers over the wrangler/adapter mismatch without proving prod serves `dist/client` at root.
  - Confidence: MED — favicons sharing the path is strong but indirect; live deploy not hit.
  - Blind spot: Local `astro dev` serves `public/` at root regardless of dist layout, so manual checks 2.5–2.7 pass in dev even if prod were broken.
- **Fix B ⭐ Recommended**: Confirm against the live deploy, THEN correct text
  - Strength: Resolves uncertainty at its source — curl deployed `/sw.js` and `/favicon.ico` for 200s; if they 404, point `assets.directory` at `./dist/client` (or whatever the adapter expects) and re-deploy. Then fix the plan path.
  - Tradeoff: A few minutes of deploy verification vs. a one-line edit.
  - Confidence: HIGH — a single curl settles cosmetic-vs-real-bug.
  - Blind spot: Needs the deployed URL.
- **Decision**: FIXED via Fix A, then VERIFIED against live deploy (2026-06-10). Corrected all `dist/` artifact paths to `dist/client/` in plan.md (end-state, Phase 1/2/3 criteria + Progress 1.2/2.1/3.5). Live-deploy `curl` of `https://nuteczki.rzpbghwtj6.workers.dev` returned **200** for `/sw.js`, `/favicon.ico`, `/manifest.webmanifest`, `/fonts/baloo2-latin-pl.woff2`, `/mascot.webp`, and all icons — so the `assets.directory: "./dist"` vs adapter `./dist/client/` concern is **cosmetic** (adapter resolves the prefix internally); the plan risk note was updated to "verified". The one exception (`/offline.html` 307) is split out as **F5**.

### F2 — SW AUTH_PATHS guards non-existent routes

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: public/sw.js:14
- **Detail**: `AUTH_PATHS = ["/login", "/register", "/auth"]`. No `/login` or `/register` routes exist — real auth pages are `/auth/signin`, `/auth/signup`, `/auth/confirm-email` (covered by the `/auth` prefix) and auth APIs are under `/api/auth/*` (already bypassed by `/api/`). So `/login` and `/register` are dead guards — harmless but misleading about the route surface.
- **Fix**: Drop `"/login"` and `"/register"`; `"/auth"` already covers the real auth pages.
- **Decision**: FIXED — `public/sw.js:14` now `const AUTH_PATHS = ["/auth"];`.

### F3 — Offline page names the brand font but can't load it offline

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: public/offline.html:25
- **Detail**: `offline.html` sets `font-family: "Baloo 2", …` but declares no `@font-face`, so the precached `/fonts/baloo2-latin-pl.woff2` is never used by this page — offline it falls back to Segoe UI/sans-serif. The plan precached the woff2 partly for the offline page's branding, so there's a small intent-vs-result gap. (Functionally fine; page still renders on brand color with the mascot.)
- **Fix**: Add an `@font-face` for `/fonts/baloo2-latin-pl.woff2` to `offline.html`, or drop the woff2 from the precache list and accept the system-font fallback.
- **Decision**: FIXED — inlined the `@font-face` (variable weight 400–800, matching `src/styles/global.css`) into `offline.html`'s `<style>` so the precached woff2 renders the brand font offline.

### F4 — Optional manual checks marked [x] without observable evidence

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md Progress 2.5–2.7, 3.6–3.7
- **Detail**: All manual checks — incl. 3.7 "Real iPhone + iPad install + offline page verified" — are `[x]`. These are explicitly labelled optional / non-gating, and manual checks leave no diff trace, so low-stakes. Flagged only so the record isn't read as "device-tested" if it wasn't.
- **Fix**: If a real-device pass didn't happen, revert 3.7 (and any untested manual box) to `[ ]`; otherwise leave as-is.
- **Decision**: ACCEPTED — user confirms the real-device iPhone + iPad install/offline pass actually happened; the `[x]` marks (2.5–2.7, 3.6–3.7) are accurate. Record left as-is.

### F5 — /offline.html 307-redirects in prod, breaking the SW offline fallback on Chromium

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality / Plan Adherence
- **Location**: public/sw.js:4 & :49; wrangler.jsonc assets
- **Detail**: Discovered while verifying F1 against the live deploy. `curl https://nuteczki.rzpbghwtj6.workers.dev/offline.html` returns `307 location: /offline` → `200` — Cloudflare's static-asset handling strips the `.html`. The SW precaches the literal `/offline.html` (sw.js:4) and serves `caches.match("/offline.html")` on a failed navigation (sw.js:49), so the cached fallback is a **redirected** response. Chromium refuses to serve a redirected response to a navigation request, so offline users on Chromium-based browsers can get the browser's native error page instead of the branded `offline.html`. Works in `astro dev` (serves `/offline.html` 200, no redirect), which is why dev/device testing didn't catch it. Safari may be more lenient (consistent with the passing F4 device test). SW registration ([Layout.astro:53](src/layouts/Layout.astro:53)) is not gated to prod.
- **Fix A ⭐ Recommended (infra)**: Set `assets.html_handling: "none"` in `wrangler.jsonc` so `/offline.html` serves 200 directly.
  - Strength: One line; SW code untouched; robust in both dev and prod. Safe — `offline.html` is the only static HTML asset, all real pages are SSR (Worker), so no routing impact.
  - Tradeoff: Requires a re-deploy before it takes effect; not yet verified live.
  - Confidence: HIGH — root cause is the `.html`-stripping default; `none` disables exactly that.
  - Blind spot: Live re-curl of `/offline.html` after deploy still pending.
- **Fix B (SW code)**: Reconstruct the precached offline response on install (`new Response(body, {status:200})`) to strip the redirected flag.
  - Strength: Infra untouched; works dev + prod.
  - Tradeoff: More SW code; relies on the redirected-flag reasoning rather than removing the redirect.
  - Confidence: MED — correct in principle, more surface area.
  - Blind spot: Not exercised on a real Chromium navigation.
- **Decision**: FIXED via Fix A and VERIFIED live (2026-06-10) — added `"html_handling": "none"` to the `assets` block in `wrangler.jsonc`. After re-deploy, `curl` of `/offline.html` returns **200, 0 redirects** (was 307), and all 8 precache assets return 200/0-redirects; `/offline` now 404s (harmless — the SW never references it). Offline fallback no longer relies on a redirected response.

## Positive note

- **Scope Discipline**: `public/sw.js` precaches `/mascot.webp`, which was NOT in the plan's precache list — a correct addition, since `offline.html` embeds the mascot and would show a broken image offline without it. Beneficial EXTRA, no concern.
