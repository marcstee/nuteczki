# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Service worker precache URLs must match what the production host actually serves

- **Context**: `public/sw.js` precache list + offline-fallback `caches.match()`, on
  Cloudflare Workers static assets (`wrangler.jsonc` `assets`).
- **Problem**: The SW precached `/offline.html` and served `caches.match("/offline.html")`
  on offline navigations. Cloudflare's default static-asset `.html`-stripping **307-redirects**
  `/offline.html` → `/offline`, so the precached entry became a *redirected* response. Chromium
  refuses to serve a redirected response to a navigation request, so the branded offline page
  silently failed in production on Chromium-based browsers. It worked under `astro dev` (serves
  `/offline.html` 200, no redirect) and on Safari (more lenient), so dev and device testing missed it.
- **Rule**: A service worker's precache and `match()` URLs must be the exact URL the **production
  host** serves — verify with `curl` against the deploy, not just `astro dev`. On Cloudflare Workers
  static assets, beware `.html`-stripping and trailing-slash redirects: either precache the canonical
  served path, set `assets.html_handling: "none"`, or reconstruct the cached `Response`
  (`new Response(body, {status: 200})`) to strip the redirected flag.
- **Applies to**: Service workers / PWA precaching; any static host (Cloudflare Workers/Pages,
  Netlify, etc.) that rewrites `.html` or trailing slashes.
