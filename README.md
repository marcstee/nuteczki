# Nuteczki

A dead-simple, flashcard-style drill app that helps young music students practise **note reading** between lessons.

A parent logs in, picks how many exercises to run, and hands the device to the child. The child works through a series of drills with immediate visual feedback, the session auto-finishes and shows stats, and the parent can review progress over time in the session history. Exercise selection is **adaptive** — it weights toward the notes the child has been getting wrong most often in recent sessions.

## What it does

- **Two exercise types**, drawn at random and mixed within a session:
  - **Note → letter:** a note is shown on the treble staff; the child picks its letter name (C, D, E, F, G, A, H).
  - **Letter → note:** a letter name is shown; the child picks the matching note on the staff from 3 visual options.
- **Adaptive drills:** roughly 70% of exercises target frequently-missed notes (computed from the last 5 completed sessions), 30% are random for variety.
- **Immediate feedback:** every answer is acknowledged instantly, showing whether it was right and indicating the correct answer.
- **Preset session length:** the parent starts a session with 5, 10, or 20 exercises; it auto-finishes after the last one and shows per-type correct/incorrect stats.
- **Session history:** all past sessions in reverse-chronological order, with date, per-type breakdown, and an accuracy indicator.
- **Built for small hands:** large touch targets, usable on iPhone and iPad via Safari, installable as a PWA (offline shell included).

The note range is intentionally limited to the beginner treble-clef range (C4 → A5). Musical accuracy on the staff is a hard guardrail.

## Tech Stack

- [Astro](https://astro.build/) v6 — server-first web framework
- [React](https://react.dev/) v19 — interactive islands (the drill UI)
- [TypeScript](https://www.typescriptlang.org/) v5 — strict mode
- [Tailwind CSS](https://tailwindcss.com/) v4 + [shadcn/ui](https://ui.shadcn.com/) (new-york)
- [Supabase](https://supabase.com/) — auth and Postgres (sessions/answers persistence)
- [Cloudflare Workers](https://workers.cloudflare.com/) — edge deployment runtime

## Prerequisites

- Node.js v22.14.0 (see `.nvmrc`)
- npm (comes with Node.js)
- [Docker](https://www.docker.com/) (~7 GB RAM) — only for running Supabase locally

## Getting Started

1. Clone and install:

```bash
git clone <your-repo-url> nuteczki
cd nuteczki
npm install
```

2. Set up Supabase and environment variables — see [Supabase Configuration](#supabase-configuration) below.

3. Create a `.dev.vars` file so the Cloudflare dev runtime can read the same secrets:

```bash
cp .env.example .dev.vars
```

4. Run the development server:

```bash
npm run dev
```

Open the printed URL. You'll land on the welcome page; sign up, then start a session from the dashboard.

## Available Scripts

- `npm run dev` — start the development server
- `npm run build` — build for production
- `npm run preview` — preview the production build
- `npm run lint` — run ESLint with type-checked rules
- `npm run lint:fix` — auto-fix ESLint issues
- `npm run format` — run Prettier
- `npm run db:types` — regenerate `src/db/database.types.ts` from the local Supabase schema
- `npm run deploy` — build and deploy to Cloudflare Workers

## Project Structure

```md
.
├── src/
│ ├── pages/                 # Astro pages + API routes
│ │ ├── api/                 # sessions.ts, auth/ (signin, signout, signup)
│ │ ├── auth/                # signin, signup, confirm-email
│ │ ├── drill.astro          # the drill session screen (protected)
│ │ ├── history.astro        # session history (protected)
│ │ ├── dashboard.astro      # start-a-session screen (protected)
│ │ └── index.astro          # public landing / welcome
│ ├── components/
│ │ ├── drill/               # DrillSession + exercise islands, selection + save logic
│ │ ├── staff/               # treble-staff rendering, pitch geometry, clef
│ │ ├── history/             # session list + summary helpers
│ │ ├── auth/                # sign-in / sign-up forms
│ │ └── ui/                  # shadcn/ui primitives
│ ├── layouts/               # Astro layouts
│ ├── lib/                   # Supabase client, config status, utils
│ ├── db/                    # generated database.types.ts
│ └── middleware.ts          # auth guard (PROTECTED_ROUTES)
├── supabase/migrations/     # session/answer tables, RLS, adaptive view
├── public/                  # PWA manifest, service worker, icons, fonts
└── wrangler.jsonc           # Cloudflare Workers config
```

## Data Model

Two tables and one view (defined in `supabase/migrations/`), all protected by row-level security so each user only ever sees their own data:

- **`sessions`** — one row per drill session: `exercise_count` (5/10/20), `started_at`, `finished_at`.
- **`answers`** — one row per answer: `exercise_type` (`note_to_letter` / `letter_to_note`), `note`, `is_correct`.
- **`note_error_stats`** — a `security_invoker` view aggregating per-note error counts across each user's last 5 completed sessions; this is what powers the adaptive exercise selection.

## Supabase Configuration

Auth uses [Supabase](https://supabase.com/). `SUPABASE_URL` and `SUPABASE_KEY` are declared via Astro's `astro:env` schema and treated as **server-only secrets** — never exposed to the client. Never commit `.env` or `.dev.vars`.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Start the local stack (downloads Docker images and applies the migrations in `supabase/migrations/` on first run):

```bash
npx supabase start
```

3. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

4. (Optional) regenerate TypeScript types from the local schema:

```bash
npm run db:types
```

Useful commands: `npx supabase stop` to stop the stack, `npx supabase db reset` to re-apply all migrations from scratch. The local Studio UI is at `http://localhost:54323`.

### Using a cloud Supabase project instead

Add these variables to your `.env` and `.dev.vars` files, then apply the migrations to the project (`npx supabase db push` against a linked project):

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this while developing:

1. Open the Supabase dashboard (or local Studio) for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up.

### Routes

| Route                 | Description                                                       |
| --------------------- | ---------------------------------------------------------------- |
| `/`                   | Public welcome page (redirects to `/dashboard` when logged in)   |
| `/auth/signup`        | Email/password sign-up                                           |
| `/auth/signin`        | Email/password sign-in                                           |
| `/auth/confirm-email` | Post-signup "check your inbox" page                              |
| `/dashboard`          | Pick exercise count and start a session (protected)              |
| `/drill`              | Run the drill session (protected)                                |
| `/history`            | Past sessions with stats and accuracy (protected)               |

Route protection lives in `src/middleware.ts` — add paths to the `PROTECTED_ROUTES` array to require authentication. (`/dev/staff` is a dev-only verification gallery of every staff pitch; it returns 404 in production builds.)

## Deployment

Deploys to [Cloudflare Workers](https://workers.cloudflare.com/):

```bash
npm run deploy   # builds, then runs `wrangler deploy`
```

Set `SUPABASE_URL` and `SUPABASE_KEY` as secrets in the Cloudflare dashboard or via `npx wrangler secret put`.

## CI

GitHub Actions runs lint + build on every push and PR to `main`. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets for the build step. A Husky pre-commit hook runs `lint-staged` (ESLint on `*.ts,tsx,astro`; Prettier on `*.json,css,md`).

## License

MIT
