# PWA Setup (Manifest, Service Worker, Icons) Implementation Plan

## Overview

Finish the partially-started PWA work for Nuteczki so the app is verifiably installable on iPhone and iPad home screens via Safari, per the PRD NFR ("usable on iPhone and iPad via Safari as a PWA") and roadmap slice F-03. The slice completes the manifest, adds iOS standalone meta tags, and adds a hand-rolled service worker that does basic asset caching with a branded offline fallback — all written to respect the app's SSR + auth-gated architecture on Cloudflare Workers.

## Current State Analysis

The project already has most static PWA assets in place, but no service worker and an incomplete manifest:

- **Icons present** in `public/`: `android-chrome-192x192.png`, `android-chrome-512x512.png`, `apple-touch-icon.png` (180²), `favicon-16x16.png`, `favicon-32x32.png`, `favicon.ico`, `favicon.png`.
- **Manifest present** at `public/manifest.webmanifest` but minimal: `name`, `short_name`, two icons, `theme_color`/`background_color` `#13243F`, `display: standalone`. **Missing** `start_url`, `scope`, `id`, `lang`, `description`, `orientation`, and explicit icon `purpose`.
- **Layout head** (`src/layouts/Layout.astro:18-22`) already links favicons, `apple-touch-icon`, and the manifest. **Missing** the `theme-color` *meta* tag and all `apple-mobile-web-app-*` / `mobile-web-app-capable` meta tags that iOS Safari uses for standalone behavior.
- **No service worker exists** anywhere (`grep` for `serviceWorker|registerSW|workbox|sw.js` over `src`/`public` returns nothing). This is the core gap behind F-03's "service worker with basic caching."
- **No `public/_headers` or `public/_routes.json`.** `public/.assetsignore` ignores only `_worker.js` and `_routes.json`.

**Architecture constraints discovered:**

- **SSR on Cloudflare Workers**: `astro.config.mjs` sets `output: "server"` with `@astrojs/cloudflare`. `wrangler.jsonc` serves static assets from `./dist` via the `ASSETS` binding with `not_found_handling: "404-page"`. Static files in `public/` (including a future `sw.js`, `offline.html`, `_headers`) are copied to `dist/` and served at root scope.
- **Pages are auth-gated and dynamic**: `src/middleware.ts` protects `/dashboard`, `/drill`, `/history` and redirects logged-in users hitting `/` to `/dashboard`. Server-rendered HTML is per-session — so it must **not** be precached or cache-served, or a stale/wrong-session page could be shown.
- **ESLint covers `public/*.js`**: `eslint.config.js` globs `**/*.{js,jsx,ts,tsx}` with `no-console: "warn"`. A service worker uses globals (`self`, `caches`, `clients`, `skipWaiting`) that will trip `no-undef`, so the SW file needs a dedicated config block.
- **Brand assets for offline page**: `public/mascot.webp` and `public/fonts/baloo2-latin-pl.woff2` exist and can be referenced by a cached offline page.

## Desired End State

After this plan:

- The browser/devtools install prompt is available; the manifest passes installability checks (valid `start_url`/`scope`/`icons`/`display`).
- On iOS Safari (iPhone + iPad), "Add to Home Screen" produces a standalone app with the correct icon, name, and theme color — no browser chrome on launch.
- A registered service worker caches static assets (hashed JS/CSS bundles, fonts, icons) and serves a branded offline page when a navigation fails offline, while **never** caching `/api`, auth responses, or server-rendered protected HTML.
- `npm run build` emits `sw.js`, `offline.html`, the completed `manifest.webmanifest`, and `_headers` into `dist/`.
- Lint, format, and typecheck pass.

Verified by: file/code review against the checklist below + a clean production build (the chosen gate). A real-device install is recommended as an optional, non-gating manual check.

### Key Discoveries:

- Manifest is hand-authored, not generated — adding `@vite-pwa/astro` would conflict with it; the project has implicitly chosen the manual path (`public/manifest.webmanifest`).
- `apple-touch-icon.png` is already 180² and linked — iOS home-screen icon is already covered via the `<link rel="apple-touch-icon">`, so the manifest does not need an Apple-specific icon entry.
- `src/middleware.ts:3` `PROTECTED_ROUTES` and the `/` → `/dashboard` redirect mean `start_url: "/"` is the correct entry point (the server decides where a logged-in user lands).
- Cloudflare Workers Static Assets supports `_headers` for per-path cache control (compat date `2026-05-08`), the standard mechanism to keep `sw.js` from being long-cached.

## What We're NOT Doing

- **No offline drill gameplay.** Running sessions without network (caching exercise generation, queuing results, sync) is explicitly out of scope — it would couple this foundation slice to session/API logic and contradict F-03's "low technical risk." Drills require network for the page shell.
- **No `@vite-pwa/astro` / Workbox dependency.** Hand-rolled SW chosen to avoid build-integration edge cases with the Cloudflare adapter and a conflict with the existing hand-authored manifest.
- **No precaching of server-rendered HTML / app shell.** Auth-gated SSR makes this a foot-gun.
- **No maskable-icon generation.** The NFR target is iOS (which uses `apple-touch-icon`, not maskable); a dedicated maskable icon with safe-zone padding is optional polish, deferred.
- **No push notifications, background sync, or periodic sync.**
- **No Lighthouse/real-device gate.** Per the chosen verification, file/code review + build is the gate; device install is an optional manual check.

## Implementation Approach

Three incremental phases. Phase 1 makes the app installable on modern iOS from the manifest alone (low-risk metadata only). Phase 2 adds the service worker and offline fallback — the substantive change — written defensively around SSR + auth. Phase 3 verifies the build artifacts and runs the review checklist. Each phase is independently shippable.

## Critical Implementation Details

- **Service worker scope & freshness.** `public/sw.js` is served at `/sw.js`, controlling root scope by default — no `Service-Worker-Allowed` header needed. To prevent a stale SW being pinned by long static-asset caching, `public/_headers` must set `/sw.js` to `Cache-Control: no-cache` (browsers also re-check the SW script at most every 24h regardless).
- **Never cache dynamic/auth responses.** The SW `fetch` handler must bypass (network-only, no cache write) any request that is non-GET, cross-origin, or whose path starts with `/api`, or is an auth route — and treat navigations (`request.mode === "navigate"`) as network-first with the offline page as the only fallback, never a cached prior page. This is what keeps per-session SSR HTML from leaking across sessions.
- **Runtime vs precache split.** Hashed bundle filenames change every build and cannot be hardcoded, so they are runtime-cached (stale-while-revalidate) on first fetch. Only stable assets (`offline.html`, the woff2 font, icons, `manifest.webmanifest`) are precached at install.
- **Cache versioning.** The SW uses a single versioned `CACHE_NAME` constant; `activate` deletes any cache whose name differs, and the SW calls `skipWaiting()` + `clients.claim()` for silent auto-update (appropriate for a kids app — no update prompt UX).
- **ESLint for the SW file.** `eslint.config.js` lints `public/sw.js`; add a dedicated config block giving it service-worker globals (`self`, `caches`, `clients`, `skipWaiting`, etc.) so `no-undef` does not fire. Keep the SW console-free on normal paths to respect `no-console`.

---

## Phase 1: Installability Metadata

### Overview

Complete the web app manifest and add the iOS/standalone meta tags so the app is installable with correct standalone presentation. After this phase, iOS 16.4+ can install the app from the manifest even before the service worker exists.

### Changes Required:

#### 1. Complete the web app manifest

**File**: `public/manifest.webmanifest`

**Intent**: Add the fields installability checks expect and that control the launched-app entry point and presentation. Keep the existing dark theme (`#13243F`) and the two existing PNG icons.

**Contract**: Add `start_url: "/"`, `scope: "/"`, `id: "/"`, `lang: "pl"`, a short `description`, `orientation: "portrait"`, and an explicit `"purpose": "any"` on each icon entry. Do not add an Apple-specific icon entry (covered by the `apple-touch-icon` link). Result remains valid JSON.

#### 2. Add standalone / iOS meta tags to the document head

**File**: `src/layouts/Layout.astro`

**Intent**: Give iOS Safari the signals it needs for a clean standalone launch (no browser chrome, correct title and status-bar treatment) and add the standard `theme-color` meta. These supplement the manifest, which iOS historically under-supports.

**Contract**: In `<head>` (near the existing manifest link at line 22) add: `<meta name="theme-color" content="#13243F">`, `<meta name="mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-status-bar-style" content="black">` (matches the dark theme without overlaying content), and `<meta name="apple-mobile-web-app-title" content="Nuteczki">`. No `set:html`, no behavioral change to existing markup.

### Success Criteria:

#### Automated Verification:

- Manifest is valid JSON: `npx tsc --noEmit` is unaffected; `node -e "JSON.parse(require('fs').readFileSync('public/manifest.webmanifest','utf8'))"` exits 0
- Production build succeeds and copies the manifest to `dist/`: `npm run build`
- Lint passes: `npm run lint`
- Format passes: `npx prettier --check public/manifest.webmanifest src/layouts/Layout.astro`

#### Manual Verification:

- In Chrome DevTools → Application → Manifest, all fields resolve and no installability errors are shown (optional, non-gating)
- Viewing page source shows the new `apple-mobile-web-app-*` and `theme-color` meta tags in `<head>`

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Service Worker & Offline Fallback

### Overview

Add a hand-rolled service worker that precaches stable static assets, runtime-caches hashed bundles, serves a branded offline page on failed navigations, and is registered from the layout — wired to keep dynamic/auth responses out of the cache. Add the `_headers` file and the eslint override the SW needs.

### Changes Required:

#### 1. Service worker

**File**: `public/sw.js` (new)

**Intent**: Provide install-resilience and fast repeat loads via asset caching, with a hard guarantee that no per-session SSR HTML, auth, or `/api` response is ever cached or replayed.

**Contract**: A service worker exposing `install` (precache the stable-asset list + `skipWaiting()`), `activate` (delete caches != current `CACHE_NAME`, `clients.claim()`), and `fetch` event handlers. `fetch` logic:
- Ignore non-GET, cross-origin, `/api/*`, and auth requests → fall through to network (no cache interaction).
- `request.mode === "navigate"` → network-first; on failure serve precached `/offline.html`.
- Static assets (font, icons, hashed `/_astro/*` bundles, manifest) → stale-while-revalidate against `CACHE_NAME`.
- `CACHE_NAME` is a single versioned constant (e.g. `nuteczki-v1`). Precache list: `["/offline.html", "/fonts/baloo2-latin-pl.woff2", "/manifest.webmanifest", "/apple-touch-icon.png", "/android-chrome-192x192.png", "/android-chrome-512x512.png", "/favicon.ico"]`. Keep the file console-free.

#### 2. Branded offline fallback page

**File**: `public/offline.html` (new)

**Intent**: Show an on-brand "no connection" screen instead of the browser's default error when an installed app navigates offline.

**Contract**: A standalone, self-contained HTML document (inline `<style>`, no external CSS/JS build dependency) using `/mascot.webp`, the `#13243F` background, a Polish message ("Brak połączenia" / short retry hint), `<html lang="pl">`, and viewport meta. Must render correctly when served from cache with no network.

#### 3. Register the service worker

**File**: `src/layouts/Layout.astro`

**Intent**: Register `/sw.js` from every page, guarded for browser support, without blocking render.

**Contract**: Add an Astro `<script>` that, if `"serviceWorker" in navigator`, calls `navigator.serviceWorker.register("/sw.js")` on `window` `load`. Keep it console-free (swallow/ignore registration errors silently) to respect `no-console`.

#### 4. Cache-control headers for the SW script

**File**: `public/_headers` (new)

**Intent**: Stop Cloudflare static-asset caching from pinning a stale service worker.

**Contract**: A Cloudflare `_headers` file mapping `/sw.js` to `Cache-Control: no-cache`. (Optionally also a long-cache rule for the immutable hashed `/_astro/*` bundles.) Confirm it is **not** matched by `public/.assetsignore`.

#### 5. ESLint config block for the service worker

**File**: `eslint.config.js`

**Intent**: Let `public/sw.js` lint cleanly given service-worker globals.

**Contract**: Add a config object scoped to `files: ["public/sw.js"]` supplying service-worker `languageOptions.globals` (`self`, `caches`, `clients`, `skipWaiting`, `fetch`, `Response`, etc., or the `serviceworker` env equivalent). Do not weaken global rules for other files.

### Success Criteria:

#### Automated Verification:

- Build emits the SW, offline page, and headers into `dist/`: `npm run build` then confirm `dist/sw.js`, `dist/offline.html`, `dist/_headers` exist (`ls dist/sw.js dist/offline.html dist/_headers`)
- Lint passes including `public/sw.js` (no `no-undef`, no `no-console`): `npm run lint`
- Typecheck passes: `npx astro check` / `npx tsc --noEmit`
- Format passes: `npx prettier --check "public/**/*.{js,html}" src/layouts/Layout.astro eslint.config.js`

#### Manual Verification:

- In DevTools → Application → Service Workers, `sw.js` registers and activates; reloading offline shows `offline.html` for a navigation (optional, non-gating)
- DevTools → Network confirms an `/api` request is **not** served from the SW cache while offline
- No stale-page bug: after a rebuild with a bumped `CACHE_NAME`, old caches are cleared on activate

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Verification & Cleanup

### Overview

Run the chosen gate — file/code review + clean production build — and tidy up. Confirm artifacts and quality gates, and record the optional real-device install as a recommended follow-up.

### Changes Required:

#### 1. Build-artifact and quality-gate verification

**File**: (no source change) — verification pass

**Intent**: Confirm the full slice produces the expected `dist/` artifacts and passes all gates.

**Contract**: A clean `npm run build`, `npm run lint`, format check, and typecheck, plus presence of `dist/manifest.webmanifest`, `dist/sw.js`, `dist/offline.html`, `dist/_headers`.

#### 2. File/code review checklist

**File**: (no source change) — review pass

**Intent**: The chosen verification gate — confirm by inspection that each piece is correct and self-consistent.

**Contract**: Review that (a) manifest fields are complete and valid; (b) Layout head has all PWA meta tags and the registration script; (c) `sw.js` bypasses `/api`/auth/non-GET, is network-first for navigations, and precaches only stable assets; (d) `offline.html` references only cached assets; (e) `_headers` is not ignored by `.assetsignore`.

### Success Criteria:

#### Automated Verification:

- Full build clean: `npm run build`
- Lint clean: `npm run lint`
- Format clean: `npm run format -- --check` (or `npx prettier --check .`)
- Typecheck clean: `npx astro check`
- All four artifacts present in `dist/`

#### Manual Verification:

- File/code review checklist above passes
- (Optional, non-gating) On a real iPhone and iPad: Safari → Share → Add to Home Screen → app launches standalone with correct icon, title, and theme color; airplane-mode navigation shows the branded offline page

**Implementation Note**: This is the final phase; on completion the slice is done per the file/code-review + build gate. The real-device install is recommended but does not block the slice.

---

## Testing Strategy

### Unit Tests:

- None. This slice is static configuration (manifest, meta tags, headers) plus a small service worker; there is no project test harness wired and no business logic to unit-test. Coverage is via build + file/code review per the chosen gate.

### Integration Tests:

- None automated. The integration surface (install + offline behavior) is exercised manually in DevTools and, optionally, on-device.

### Manual Testing Steps:

1. `npm run build` then `npm run preview`; open DevTools → Application → Manifest: confirm no installability errors.
2. Application → Service Workers: confirm `sw.js` is activated and running.
3. Toggle DevTools "Offline"; reload a route → branded `offline.html` appears. Confirm a static asset (font/icon) still loads from cache.
4. Confirm an `/api` request is not satisfied from cache while offline.
5. (Optional) Add to Home Screen on a real iPhone and iPad; launch and confirm standalone presentation.

## Performance Considerations

- Stale-while-revalidate on immutable hashed bundles makes repeat loads fast and cheap; navigations stay network-first so users never see stale dynamic content.
- The SW registration runs on `window` `load`, off the critical render path.
- Precache list is intentionally tiny (offline page + font + a few icons) to keep install fast and avoid caching large or per-build assets eagerly.

## Migration Notes

- No data migration. First deploy installs a fresh SW (`nuteczki-v1`). Future SW changes must bump `CACHE_NAME` so `activate` purges old caches; `skipWaiting()` + `clients.claim()` make updates take effect on next load without a prompt.
- `public/_headers` keeping `/sw.js` at `no-cache` is what makes those updates actually reach clients.

## References

- Roadmap slice: `context/foundation/roadmap.md` F-03 (lines 90-100)
- PRD NFR: `context/foundation/prd.md:106` ("usable on iPhone and iPad via Safari as a PWA")
- Current manifest: `public/manifest.webmanifest`
- Document head: `src/layouts/Layout.astro:13-25`
- Auth gating that shapes the caching strategy: `src/middleware.ts:3` (`PROTECTED_ROUTES`)
- Cloudflare adapter & asset serving: `astro.config.mjs`, `wrangler.jsonc`
- ESLint scope over `public/*.js`: `eslint.config.js:41`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Installability Metadata

#### Automated

- [x] 1.1 Manifest is valid JSON (`node -e JSON.parse(...)` exits 0) — 919840b
- [x] 1.2 Production build succeeds and copies manifest to `dist/` (`npm run build`) — 919840b
- [x] 1.3 Lint passes (`npm run lint`) — 919840b
- [x] 1.4 Format passes for manifest + Layout (`prettier --check`) — 919840b

#### Manual

- [x] 1.5 DevTools → Manifest shows all fields resolved, no installability errors (optional) — 919840b
- [x] 1.6 Page source shows new `apple-mobile-web-app-*` and `theme-color` meta tags — 919840b

### Phase 2: Service Worker & Offline Fallback

#### Automated

- [x] 2.1 Build emits `dist/sw.js`, `dist/offline.html`, `dist/_headers` — 18fbdf8
- [x] 2.2 Lint passes including `public/sw.js` (no `no-undef`/`no-console`) — 18fbdf8
- [x] 2.3 Typecheck passes (`npx astro check`) — 18fbdf8
- [x] 2.4 Format passes for new/edited files (`prettier --check`) — 18fbdf8

#### Manual

- [x] 2.5 `sw.js` registers + activates; offline navigation serves `offline.html` (optional) — 18fbdf8
- [x] 2.6 `/api` request is not served from SW cache while offline — 18fbdf8
- [x] 2.7 Bumped `CACHE_NAME` clears old caches on activate — 18fbdf8

### Phase 3: Verification & Cleanup

#### Automated

- [x] 3.1 Full build clean (`npm run build`) — 8f0b5a9
- [x] 3.2 Lint clean (`npm run lint`) — 8f0b5a9
- [x] 3.3 Format clean (`prettier --check .`) — 8f0b5a9
- [x] 3.4 Typecheck clean (`npx astro check`) — 8f0b5a9
- [x] 3.5 All four artifacts present in `dist/`) — 8f0b5a9

#### Manual

- [x] 3.6 File/code review checklist passes — 8f0b5a9
- [x] 3.7 (Optional, non-gating) Real iPhone + iPad install + offline page verified — 8f0b5a9
