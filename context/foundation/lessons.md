# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Service worker precache URLs must match what the production host actually serves

- **Context**: `public/sw.js` precache list + offline-fallback `caches.match()`, on
  Cloudflare Workers static assets (`wrangler.jsonc` `assets`).
- **Problem**: The SW precached `/offline.html` and served `caches.match("/offline.html")`
  on offline navigations. Cloudflare's default static-asset `.html`-stripping **307-redirects**
  `/offline.html` → `/offline`, so the precached entry became a _redirected_ response. Chromium
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

## Risk #3 structural gap: ignore-duplicate no-op and non-transactional partial write

- **Context**: `src/pages/api/sessions.ts` — the drill-session save endpoint issues
  two sequential `upsert` calls with `{ onConflict: "id", ignoreDuplicates: true }`:
  one for `sessions`, one for `answers`. The design is intentionally idempotent
  under client retry.
- **Problem**: `ignoreDuplicates: true` turns a colliding-id write into a silent
  no-op: PostgREST returns `error === null` (HTTP 200) while persisting nothing new.
  The two upserts are not wrapped in a transaction, so a partial write — a
  `finished_at`-stamped session with zero answers — is representable in the schema
  and silently treated as valid by the history and adaptive views. **A HTTP 200
  from `POST /api/sessions` does not guarantee that answers were persisted.**
- **Rule**: Do not interpret a 200 from the save path as proof of persistence.
  The characterization tests in `src/pages/api/sessions.integration.test.ts`
  (names prefixed `[characterization]`) document this as **current, not desired**
  behavior. Do not "fix" those tests to match a 200-means-success expectation —
  promote them to assertions once the fix lands (drop `ignoreDuplicates`, couple
  the session and answers writes in an atomic operation). The follow-up fix
  change is tracked via the `## Notes` section of
  `context/changes/testing-session-boundary-regression/change.md`.
- **Applies to**: `src/pages/api/sessions.ts`; anyone reading session history or
  adaptive stats who assumes a session row implies at least one answer row; the
  eventual fix change (drop/replace `ignoreDuplicates`; atomic session+answers write).

## In Tailwind v4, CSS-variable font sizes need the `length:` type hint

- **Context**: `src/components/drill/NoteToLetterExercise.tsx`, `LetterToNoteExercise.tsx`,
  `DrillSession.tsx` — arbitrary `text-[...]` classes referencing CSS custom properties.
- **Problem**: The plan's example wrote `text-[var(--drill-tap-text)]`. In Tailwind v4 a
  bare `text-[var(...)]` is ambiguous between color and font-size, so the `length:` data-type
  hint is required for the size to compile correctly. Without it the utility may silently
  resolve to the wrong property.
- **Rule**: Always write `text-[length:var(--token)]` (not `text-[var(--token)]`) when a CSS
  variable holds a font-size value in Tailwind v4. The `length:` type-hint resolves the
  color vs. font-size ambiguity and is required for the size utility to compile correctly.
- **Applies to**: Any Tailwind v4 arbitrary `text-[...]` class that reads a CSS custom
  property containing a font-size — including `--drill-*` tokens and any future design tokens.
