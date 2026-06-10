# Repository Guidelines

Nuteczki is an Astro v6 server-rendered web app with React 19 interactive islands, Supabase authentication, and Cloudflare Workers deployment. TypeScript strict mode, Tailwind CSS v4, and shadcn/ui (new-york style) for components.

## Hard Rules

- Never commit `.env` or `.dev.vars`. Secrets (`SUPABASE_URL`, `SUPABASE_KEY`) are server-only; see `@.env.example` for the shape.
- `no-console` is a lint warning — remove `console.log` before committing.
- `react-compiler/react-compiler` is enforced as error; do not bypass React Compiler rules.
- `astro/no-set-html-directive` is an error — never use `set:html` in Astro components.
- Path alias: use `@/*` for imports from `src/` (configured in `@tsconfig.json`).

## Project Structure

- `src/pages/` — Astro pages and API routes (`src/pages/api/`).
- `src/components/` — Astro (`.astro`) and React (`.tsx`) components. `ui/` holds shadcn/ui primitives (`@components.json`); feature directories (e.g. `auth/`) group related React components.
- `src/layouts/` — Astro layouts.
- `src/lib/` — shared utilities (Supabase client, helpers).
- `src/styles/global.css` — Tailwind CSS entry point and theme configuration.
- `src/middleware.ts` — auth guard; add protected paths to the `PROTECTED_ROUTES` array.
- `supabase/` — Supabase local development config.

## Build, Lint, and Dev

See `@package.json` scripts for the full list. Additionally:

- `npx astro sync` — regenerate Astro types after changing env schema in `@astro.config.mjs`.

## Coding Conventions

- Lint config: `@eslint.config.js`.
- Prettier config: `@.prettierrc.json`.
- Astro components for static content; React `.tsx` only for interactive islands.
- Add shadcn/ui components via `npx shadcn@latest add <component>` — they land in `src/components/ui/`.
- Tailwind CSS v4 via Vite plugin; configuration lives in `@src/styles/global.css`, not a config file.

## CI Gate

CI gate: `@.github/workflows/ci.yml` (lint + build on push/PR to `master`).

Pre-commit hook via Husky runs `lint-staged`: ESLint fix on `*.ts,tsx,astro`; Prettier on `*.json,css,md`.

## Deployment

Cloudflare Workers via `npx wrangler deploy`. Config: `@wrangler.jsonc`. Set secrets via Cloudflare dashboard or `npx wrangler secret put`.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the `/10x-e2e` skill.** It is the single source of truth
for the workflow — risk → seed test + rules → generate → review against the five
anti-patterns → re-prompt → verify. The skill's `references/` carry the full
rules, anti-patterns, seed pattern, and prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toMatchSnapshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **Healer helps on selectors, harms on logic.** A changed selector → healer
  re-finds it (route through PR review). A changed business behavior → healer
  masks the bug; that failing-test-to-fix case is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->
