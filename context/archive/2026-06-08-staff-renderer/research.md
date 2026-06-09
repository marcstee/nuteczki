---
date: 2026-06-08T17:02:00+02:00
researcher: Marcstee
git_commit: f941e409a2d94985a76a313a1ad9981eaf323661
branch: main
repository: nuteczki
topic: "Is vexflow-api-notes.md compatible with the codebase for implementing F-02 (staff-renderer)?"
tags: [research, codebase, staff-renderer, vexflow, react-island, cloudflare-ssr, react-compiler, F-02]
status: complete
last_updated: 2026-06-08
last_updated_by: Marcstee
---

# Research: VexFlow API notes vs. codebase compatibility for F-02 (staff-renderer)

**Date**: 2026-06-08T17:02:00+02:00
**Researcher**: Marcstee
**Git Commit**: f941e409a2d94985a76a313a1ad9981eaf323661
**Branch**: main
**Repository**: nuteczki

## Research Question

Review the codebase and decide whether [`vexflow-api-notes.md`](context/changes/staff-renderer/vexflow-api-notes.md) is compatible with it, for implementing **F-02 (staff-renderer)** from [`roadmap.md`](context/foundation/roadmap.md) — a reusable React island that renders a five-line treble staff with a single note positioned by pitch, beginner range C4→A5.

## Summary

**Verdict: Compatible — with one required adjustment and a few notes.**

VexFlow 5 fits the stack (Astro 6 islands + React 19 + TypeScript strict + Tailwind v4 + Cloudflare Workers). The notes are technically accurate against the installed toolchain. There is **one concrete change required** before the code in the notes is safe on this codebase:

> **Mount the VexFlow island as `client:only="react"`, not `client:load`/`client:visible`** (and/or dynamically `import('vexflow')` inside the `useEffect`). The app runs `output: "server"` on the Cloudflare adapter, so every island is server-rendered inside the `workerd` runtime, which has **no DOM** (`document`, `HTMLDivElement`, `FontFace`, `canvas`). VexFlow's module — especially the full build's auto font-loading — can execute at SSR import time and throw. `client:only` removes all server-side execution; there is zero SSR benefit to lose because VexFlow can only draw on the client anyway.

Two concerns that *look* like blockers but are not:

1. **React Compiler (`react-compiler/react-compiler: "error"`)** — the `useRef` + `useEffect` imperative-DOM bridge in the notes is the *sanctioned* escape hatch, not a rule violation. Refs/DOM mutation inside effects are explicitly allowed by React Compiler. Compatible. (Verify with a `npm run lint` pass during the spike, since this would be the codebase's first imperative island.)
2. **`astro/no-set-html-directive: "error"` + the "never use set:html" project rule** — that rule applies to `.astro` files only ([eslint.config.js:62-69](context/changes/staff-renderer/../../../eslint.config.js)). The notes' `el.innerHTML = ''` is in a `.tsx` React file and is a *clear* (not an untrusted-HTML inject). No `react/no-danger` rule is enabled. Allowed.

Important context the notes do **not** carry: per [`library-research.md`](context/changes/staff-renderer/library-research.md) and [`change.md`](context/changes/staff-renderer/change.md), the renderer approach is **still an open decision** (VexFlow 5 vs. a hand-rolled SVG component), to be settled by a short spike at `/10x-plan`. These notes de-risk **only the VexFlow path**. The rival custom-SVG path is *more* compatible (SSR-able, declarative, no React-Compiler/SSR friction, better for the S-02 clickable-note answer UI). So "compatible" answers the technical question for Option A; it does not pre-empt the architectural choice.

## Detailed Findings

### Stack baseline (what the notes must fit)

- **Astro 6.3.1**, `output: "server"`, adapter `@astrojs/cloudflare`, React via `@astrojs/react` — [astro.config.mjs:10-22](context/changes/staff-renderer/../../../astro.config.mjs). `output: "server"` is the decisive detail: pages and their islands are SSR'd in the Worker, not prerendered.
- **React 19.2.6**, `@types/react` 19.2.14 — [package.json:32-33](context/changes/staff-renderer/../../../package.json).
- **TypeScript strict** via `astro/tsconfigs/strict`, plus typescript-eslint `strictTypeChecked` + `stylisticTypeChecked` — [tsconfig.json:2](context/changes/staff-renderer/../../../tsconfig.json), [eslint.config.js:15](context/changes/staff-renderer/../../../eslint.config.js). Path alias `@/*` → `src/*` — [tsconfig.json:9-11](context/changes/staff-renderer/../../../tsconfig.json).
- **Cloudflare Workers**: `main: @astrojs/cloudflare/entrypoints/server`, `nodejs_compat`, assets served from `./dist` — [wrangler.jsonc:4-11](context/changes/staff-renderer/../../../wrangler.jsonc).
- **VexFlow is NOT installed** — `node_modules/vexflow` absent, not in `package.json`. A clean `npm i vexflow` is required (step 1 of the notes is correct).

### 1. React Compiler — the imperative bridge is allowed

`react-compiler/react-compiler` is `error` ([eslint.config.js:58](context/changes/staff-renderer/../../../eslint.config.js)) and `eslint-plugin-react-hooks` recommended rules are on ([eslint.config.js:56](context/changes/staff-renderer/../../../eslint.config.js)). The notes' `StaffNote` ([vexflow-api-notes.md:115-144](context/changes/staff-renderer/vexflow-api-notes.md)):

- Reads `ref.current` and mutates `el.innerHTML` **inside `useEffect`** — React Compiler forbids ref reads/mutations *during render*, but explicitly permits them inside effects (the DOM-interop escape hatch). No violation.
- Effect deps `[noteKey, width, height]` are exactly the props used → `exhaustive-deps` satisfied.

Risk is low; the only reason to verify is that **no existing island uses `useEffect`/`useRef`** — every current React component (`src/components/auth/*`, e.g. [SignInForm.tsx](context/changes/staff-renderer/../../../src/components/auth/SignInForm.tsx)) is pure declarative `useState`. This would be the first imperative island, so run `npm run lint` on it during the spike.

### 2. Cloudflare SSR — the one required change

With `output: "server"` + `client:load`/`client:visible`, Astro **server-renders the island** for initial HTML inside `workerd`. Effects don't run server-side, so the *drawing* code is safe — but the **module-level `import { Renderer, ... } from 'vexflow'`** executes during SSR. If VexFlow's top-level code (notably the full build's "auto-loaded" fonts — [vexflow-api-notes.md:32-33](context/changes/staff-renderer/vexflow-api-notes.md)) touches `document`/`FontFace`/`fetch`, the Worker throws at render time.

Mitigation (pick one, `client:only` recommended):
- **`client:only="react"`** — Astro skips SSR for the island entirely. Correct here: a staff can only be drawn client-side, so nothing is lost.
- **Dynamic import** `const { Renderer } = await import('vexflow')` inside the effect — keeps VexFlow out of the SSR bundle and code-splits it off the main bundle.

The notes recommend `client:visible`/`client:load` ([vexflow-api-notes.md:146-147](context/changes/staff-renderer/vexflow-api-notes.md)); that is the only line that is *not* compatible as written and must change for this Cloudflare SSR setup.

### 3. Fonts / offline — correctly deferred to F-03, no blocker

The notes' build-variant analysis ([vexflow-api-notes.md:26-50](context/changes/staff-renderer/vexflow-api-notes.md)) matches [library-research.md:34-38](context/changes/staff-renderer/library-research.md): full build bundles fonts (bigger JS, simplest, fully compatible for F-02 in isolation); core build needs CDN or self-hosted `.woff2` + service-worker cache (an F-03 concern). Cloudflare-specific: CDN fonts are fetched **by the browser**, not the Worker, so the edge runtime never blocks them; self-hosted woff2 live in `public/` → served from the `./dist` assets binding. For F-02 alone, the **full build is the lowest-friction, fully-compatible choice**; offline hardening is legitimately an F-03 decision.

### 4. TypeScript strict / lint surface

VexFlow 5 ships its own types (MIT, TS source), so `new Renderer(...)`, `Renderer.Backends.SVG`, `new StaveNote({ clef, keys, duration })` are typed under `strict`. `astro/tsconfigs/strict` enables `strict: true` but not `noUncheckedIndexedAccess`, so the §4 pitch→key lookup table won't fight the indexer (still, type the table as `Record<Pitch, string>` to be safe). The async lint rules (`no-misused-promises`, `restrict-template-expressions` — [eslint.config.js:35-36](context/changes/staff-renderer/../../../eslint.config.js)) only matter for the core build's `await loadFonts()`; with full build + `client:only` there are no promises to misuse. No fundamental TS friction.

### 5. Component conventions

Islands live in feature subdirectories of `src/components/` (`auth/`), with shadcn primitives in `ui/`. New home would be e.g. `src/components/staff/StaffNote.tsx`. Two small consistency nits (not incompatibilities):
- Existing islands use **default exports** ([SignInForm.tsx:12](context/changes/staff-renderer/../../../src/components/auth/SignInForm.tsx)) and are imported by name in `.astro`; the notes use a **named export**. Either works in Astro; prefer default export to match the house style.
- Existing islands mount with `client:load` (e.g. [signin.astro:16](context/changes/staff-renderer/../../../src/pages/auth/signin.astro)). The staff island should instead use `client:only="react"` (see §2).

## Code References

- [package.json#L16-37](https://github.com/marcstee/nuteczki/blob/f941e409a2d94985a76a313a1ad9981eaf323661/package.json#L16) — deps: React 19.2.6, Astro 6.3.1, `@astrojs/cloudflare` 13.5.0; **no vexflow**.
- [astro.config.mjs#L10-L22](https://github.com/marcstee/nuteczki/blob/f941e409a2d94985a76a313a1ad9981eaf323661/astro.config.mjs#L10) — `output: "server"` + Cloudflare adapter + React integration (the SSR-on-Workers context for §2).
- [tsconfig.json#L2-L11](https://github.com/marcstee/nuteczki/blob/f941e409a2d94985a76a313a1ad9981eaf323661/tsconfig.json#L2) — strict preset, `jsx: react-jsx`, `@/*` alias.
- [eslint.config.js#L40-L60](https://github.com/marcstee/nuteczki/blob/f941e409a2d94985a76a313a1ad9981eaf323661/eslint.config.js#L40) — React config: `react-compiler/react-compiler: error`, react-hooks rules, `window`/`document` globals declared.
- [eslint.config.js#L62-L69](https://github.com/marcstee/nuteczki/blob/f941e409a2d94985a76a313a1ad9981eaf323661/eslint.config.js#L62) — `astro/no-set-html-directive` scoped to `**/*.astro` only (does not touch `.tsx` `innerHTML`).
- [wrangler.jsonc#L4-L11](https://github.com/marcstee/nuteczki/blob/f941e409a2d94985a76a313a1ad9981eaf323661/wrangler.jsonc#L4) — `workerd` server entrypoint, `nodejs_compat`, `./dist` assets.
- [src/components/auth/SignInForm.tsx#L1-L16](https://github.com/marcstee/nuteczki/blob/f941e409a2d94985a76a313a1ad9981eaf323661/src/components/auth/SignInForm.tsx#L1) — representative island: pure `useState`, default export, no effects/refs (contrast with the proposed imperative pattern).
- [src/pages/auth/signin.astro#L16](https://github.com/marcstee/nuteczki/blob/f941e409a2d94985a76a313a1ad9981eaf323661/src/pages/auth/signin.astro#L16) — existing island mount uses `client:load`.

## Architecture Insights

- **All current React is declarative-only.** The VexFlow path introduces the first imperative DOM island. That's fine, but it's a new pattern for this repo — worth a lint check and a note for future contributors.
- **`output: "server"` makes "client-side library" mean "must be excluded from SSR," not just "runs in the browser eventually."** On a static Astro build the import-time risk would be a build-time Node concern; here it is a runtime `workerd` concern. `client:only` is the idiomatic Astro answer for DOM-only libraries on a server adapter.
- **Tailwind v4 can't style inside VexFlow's generated SVG** (it writes raw SVG imperatively). For F-02 (just render a staff) only the wrapper `<div>` is Tailwind-styleable. This is precisely the friction `library-research.md` Option B (hand-rolled SVG) avoids, and it matters for **S-02**, where noteheads become clickable answer targets.

## Historical Context (from prior changes)

- [`context/changes/staff-renderer/library-research.md`](context/changes/staff-renderer/library-research.md) — the renderer choice is an **open decision**: Option A VexFlow 5 (de-risks the "skills" top-blocker, accurate-by-construction, agent-friendly) vs. Option B hand-rolled SVG (lighter, SSR-able, declarative, better for S-02 clickable notes). Recommends a spike before committing. The vexflow-api-notes only cover Option A.
- [`context/changes/staff-renderer/change.md`](context/changes/staff-renderer/change.md) — F-02 framed as the **top blocker (skills)**; advanced `new → preparing` by this research pass.
- [`context/foundation/roadmap.md:75-86`](context/foundation/roadmap.md) — F-02 outcome + the "musical accuracy is non-negotiable" guardrail; PRD refs FR-004, FR-005; unlocks S-01 and S-02.
- [`context/foundation/tech-stack.md`](context/foundation/tech-stack.md) — confirms the Astro + Supabase + Cloudflare stack and PWA target the notes were scored against.

## Related Research

- [`context/changes/staff-renderer/library-research.md`](context/changes/staff-renderer/library-research.md) — approach/library comparison (the decision this compatibility check sits under).
- [`context/changes/staff-renderer/vexflow-api-notes.md`](context/changes/staff-renderer/vexflow-api-notes.md) — the API notes evaluated here.

## Open Questions

1. **Does VexFlow 5's full build touch DOM globals at module-evaluation time?** If yes, `client:only` (or dynamic import) is mandatory; if no, it's still recommended. The spike should confirm by attempting a `client:load` mount and watching for a Worker SSR error, or simply default to `client:only`.
2. **VexFlow vs. hand-rolled SVG (the actual architectural decision).** This research only certifies that Option A is *implementable* here. Given S-02's clickable-notes need and the SSR/React-Compiler friction, Option B deserves equal weight in the `/10x-plan` spike. The narrow fixed range (~13 positions) makes the custom component genuinely competitive.
3. **Full vs. core/bravura build for bundle size.** Full build is simplest for F-02; if the main-bundle cost is unacceptable, a dynamic `import('vexflow')` inside the effect code-splits it. Decide alongside the F-03 offline-font strategy.
