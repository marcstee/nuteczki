# PWA Setup (Manifest, Service Worker, Icons) — Plan Brief

> Full plan: `context/changes/pwa-setup/plan.md`

## What & Why

Make Nuteczki verifiably installable on iPhone and iPad home screens via Safari, satisfying the PRD NFR ("usable on iPhone and iPad via Safari as a PWA") and roadmap slice F-03. This is a foundation slice: once installed, every other slice can be tested in the real delivery form factor. It's parallel with everything and blocks nothing.

## Starting Point

Partial work already exists: all icons (`android-chrome-192/512`, `apple-touch-icon`, favicons), a minimal `public/manifest.webmanifest`, and manifest/apple-touch-icon `<link>`s in `Layout.astro`. **What's missing is the substance:** no service worker exists at all, the manifest lacks `start_url`/`scope`/`id`/etc., and the document head has no iOS standalone meta tags.

## Desired End State

The app shows an install prompt and installs cleanly on iOS Safari as a standalone app (correct icon, name, dark `#13243F` theme, no browser chrome). A registered service worker caches static assets and serves a branded "Brak połączenia" offline page on failed navigations — while never caching `/api`, auth, or per-session SSR HTML. `npm run build` emits `sw.js`, `offline.html`, the completed manifest, and `_headers`.

## Key Decisions Made

| Decision                | Choice                                              | Why (1 sentence)                                                                 | Source |
| ----------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| Service worker approach  | Hand-rolled `public/sw.js`, manual registration     | Full control, no build-integration risk with the Cloudflare adapter, won't fight the hand-authored manifest. | Plan   |
| Caching strategy         | Assets cached (SWR); navigations network-first      | Fast repeat loads + install resilience without ever serving stale/wrong-session protected HTML. | Plan   |
| Offline gameplay         | Out of scope                                        | Keeps this a true low-risk foundation slice; offline drills would couple it to session/API logic. | Plan   |
| Offline UX               | Minimal branded `offline.html` (mascot + message)   | Cheap, on-brand fallback that strengthens the install signal with no dynamic logic. | Plan   |
| Verification gate        | File/code review + clean build (device install optional) | User-chosen gate; real-device install kept as a recommended, non-gating manual check. | Plan   |

## Scope

**In scope:** complete manifest; iOS/standalone meta tags; hand-rolled service worker (asset caching, offline fallback); `offline.html`; `_headers` for SW freshness; eslint block for SW globals.

**Out of scope:** offline drill gameplay; `@vite-pwa/astro`/Workbox; precaching server-rendered HTML; maskable icon; push/background sync; Lighthouse or device-install as a gate.

## Architecture / Approach

Pure static/config + a small client SW — no server changes. SSR on Cloudflare Workers means `public/` files (`sw.js`, `offline.html`, `_headers`) are copied to `dist/` and served at root scope. The SW is defensive about the auth-gated SSR app: non-GET / cross-origin / `/api` / auth bypass the cache entirely; navigations are network-first (offline page as the only fallback); only stable assets are precached; hashed bundles are runtime-cached stale-while-revalidate. `_headers` keeps `/sw.js` at `no-cache` so updates actually reach clients.

## Phases at a Glance

| Phase                            | What it delivers                                              | Key risk                                                      |
| -------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| 1. Installability metadata       | Complete manifest + iOS standalone meta tags                 | iOS status-bar style / install presentation quirks           |
| 2. Service worker & offline      | `sw.js`, `offline.html`, registration, `_headers`, eslint block | Accidentally caching dynamic/auth HTML; SW globals lint/`no-undef` |
| 3. Verification & cleanup        | Build artifacts + file/code-review gate                      | Stale-SW caching if `_headers` misconfigured                 |

**Prerequisites:** none — assets and the layout already exist; no API or data dependency.
**Estimated effort:** ~1 session across 3 small phases.

## Open Risks & Assumptions

- iOS Safari standalone behavior is meta-tag-sensitive; `apple-mobile-web-app-status-bar-style: black` is chosen to match the dark theme without content overlap — may want a real-device look at the status bar.
- Cloudflare Workers Static Assets honoring `_headers` is assumed (supported at the project's compat date); to verify in the build output.
- No automated test harness exists in the repo, so the slice leans on build + review rather than tests (consistent with its foundation, low-risk nature).

## Success Criteria (Summary)

- The app installs as a standalone PWA on iPhone/iPad with correct icon, name, and theme.
- A service worker is registered and serves a branded offline page on failed navigations, with `/api`/auth/SSR HTML never cached.
- `npm run build` produces `sw.js`, `offline.html`, completed manifest, and `_headers`; lint/format/typecheck pass.
