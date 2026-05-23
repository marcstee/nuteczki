# Nuteczki — Cloudflare Workers Deployment Plan

## Context

The project is an Astro v6 + React 19 + Supabase app scaffolded from `10x-astro-starter`. It already has `@astrojs/cloudflare` adapter v13.5.0 and `wrangler` v4.90.0 installed and configured, but has never been deployed. The infrastructure contract (`context/foundation/infrastructure.md`) recommends Cloudflare Workers (5/5 score, free tier covers 100k req/day). This plan fixes pre-flight issues, deploys to production, wires Supabase auth for the live domain, and adds CI/CD automation.

### Issues discovered during exploration
- CI workflow triggers on `master` but repo uses `main` — CI never fires
- Worker name is template default `10x-astro-starter` — should be `nuteczki`
- `wrangler whoami` shows "not authenticated"
- No deploy script in `package.json`, no deploy step in CI
- No `.dev.vars` for local Workers dev
- Layout title still says "10x Astro Starter"
- Supabase Site URL must be configured for the production domain

---

## Prerequisites: Tool & Service Setup _(human-only, one-time)_

Complete these before starting any deployment phase. Each section ends with a verification command.

### P1. Node.js (v22+)

The `.nvmrc` pins v22 for CI consistency, but any Node 22+ version works locally (including Node 26).

- [ ] **Verify:**
  ```bash
  node --version   # v22.x.x or higher (v26.x.x is fine)
  npm --version    # 10.x+ or 11.x+
  ```
- If below v22, install via `nvm install 22` or `brew install node@22`.

### P2. Project Dependencies

- [ ] **Install all npm packages** (wrangler, Astro, Supabase client, etc. are all devDeps):
  ```bash
  cd /Users/marcstee/Projekty/10xdevs/nuteczki
  npm ci
  ```
- [ ] **Verify wrangler is available:**
  ```bash
  npx wrangler --version   # should print 4.90.0+
  ```

No global installs needed — `wrangler` runs via `npx` from the project's `node_modules`.

### P3. Cloudflare Account

- [ ] **Create a free Cloudflare account** (if you don't have one):
  1. Go to https://dash.cloudflare.com/sign-up
  2. Sign up with email + password
  3. No domain purchase or DNS transfer required — Workers run on `*.workers.dev` subdomains for free
- [ ] **Note your Account ID** — visible on the dashboard home page (right sidebar) or via `wrangler whoami` after login

**Free tier includes:** 100,000 requests/day, 10ms CPU time per invocation, 3MB compressed bundle limit — more than enough for this MVP.

### P4. Wrangler CLI Authentication

- [ ] **Log in to Cloudflare from the terminal:**
  ```bash
  npx wrangler login
  ```
  This opens a browser window for OAuth. Authorize the CLI.
- [ ] **Verify:**
  ```bash
  npx wrangler whoami
  ```
  Should print your account name and account ID.

**Troubleshooting:**
- Browser won't open → `npx wrangler login --browser false` and open the printed URL manually
- Behind a corporate proxy → set `HTTPS_PROXY` env var before login
- Multiple Cloudflare accounts → set `CLOUDFLARE_ACCOUNT_ID=<id>` in your shell to pin one

### P5. Supabase Project (Remote/Cloud)

The app uses Supabase for authentication (signup/signin/signout) and user session management. You need a **remote Supabase project** (not just local).

- [ ] **Create a Supabase project** (if you don't have one):
  1. Go to https://supabase.com/dashboard and sign in (or sign up free)
  2. Click **New Project**
  3. Choose an org, name it (e.g., `nuteczki`), set a database password, pick a region close to your users
  4. Wait ~2 minutes for provisioning to complete

- [ ] **Get your project credentials:**
  1. In the Supabase Dashboard, go to **Project Settings → API**
  2. Copy two values:
     - **Project URL** — looks like `https://abcdefghijk.supabase.co`
     - **anon (public) key** — a long JWT string starting with `eyJ...`
  3. **Do NOT use the `service_role` key** — that bypasses Row Level Security and should never be in client-facing code

- [ ] **Store credentials locally** — create/update `.env` in the project root:
  ```bash
  # .env (gitignored, used by `astro dev`)
  SUPABASE_URL=https://abcdefghijk.supabase.co
  SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  ```

- [ ] **Verify Supabase is reachable:**
  ```bash
  npm run dev
  ```
  Open http://localhost:4321 — the "Supabase nie jest skonfigurowany" warning banner should **not** appear. If it does, your `.env` values are missing or incorrect.

### P6. Supabase Auth Configuration (Dashboard)

These settings ensure signup/signin/signout work correctly. Configure them **now** for local dev; we'll update the Site URL for production in Phase 4.

- [ ] **Enable Email provider:**
  1. Dashboard → Authentication → Providers → Email
  2. Ensure **Email** provider is **enabled** (it is by default)
  3. **Email confirmation**: leave **disabled** for initial setup (simplifies testing). The app handles both states — `confirm-email.astro` shows appropriate messaging based on the environment.

- [ ] **Set Site URL (for local dev initially):**
  1. Dashboard → Project Settings → Authentication → URL Configuration
  2. Set **Site URL** to: `http://localhost:4321`
  3. Add **Redirect URLs**: `http://localhost:4321/**`

- [ ] **Verify auth works locally:**
  1. Run `npm run dev`
  2. Go to http://localhost:4321/auth/signup — create a test account
  3. Go to http://localhost:4321/auth/signin — sign in with that account
  4. You should be redirected to `/` with the Topbar showing your email
  5. Navigate to `/dashboard` — should load (not redirect)
  6. Click Sign Out — should redirect back

### P7. GitHub Repository Secrets (for CI)

The CI workflow needs Supabase credentials at build time (the Astro env schema validates them).

- [ ] **Set GitHub Actions secrets:**
  1. Go to https://github.com/marcstee/nuteczki/settings/secrets/actions
  2. Add **Repository secrets**:
     - `SUPABASE_URL` — same value as your `.env`
     - `SUPABASE_KEY` — same value as your `.env`
  3. Cloudflare secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) are added later in Phase 6

- [ ] **Verify CI runs:**
  After fixing the branch trigger in Phase 0 (`master` → `main`), push to `main` and check the Actions tab — the `ci` job should pass.

### P8. GitHub CLI _(optional, for PR management)_

- [ ] **Install `gh`** (if not already present):
  ```bash
  brew install gh        # macOS
  gh auth login          # follow prompts
  ```
- [ ] **Verify:**
  ```bash
  gh repo view --json name   # should print {"name":"nuteczki"}
  ```

This is optional — only needed if you want to create PRs or manage issues from the terminal.

---

### Prerequisites Checklist Summary

| Tool / Service | Required | Status Command |
|---|---|---|
| Node.js 22+ | Yes | `node --version` → v22.x or higher |
| npm packages | Yes | `npx wrangler --version` → 4.90+ |
| Cloudflare account | Yes | https://dash.cloudflare.com |
| Wrangler auth | Yes | `npx wrangler whoami` → shows account |
| Supabase project | Yes | Dashboard → API → Project URL exists |
| `.env` with credentials | Yes | `npm run dev` → no warning banner |
| Supabase auth config | Yes | Signup/signin works on localhost:4321 |
| GitHub repo secrets | Yes | Actions tab → CI build passes |
| GitHub CLI (`gh`) | Optional | `gh --version` |

---

## Phase 0: Pre-Flight Fixes _(agent-executable)_

Fix template leftovers and broken CI before touching Cloudflare.

- [ ] **0.1** `wrangler.jsonc:3` — change `"name": "10x-astro-starter"` → `"name": "nuteczki"`
- [ ] **0.2** `package.json:2` — change `"name": "10x-astro-starter"` → `"name": "nuteczki"`
- [ ] **0.3** `supabase/config.toml:5` — change `project_id = "10x-astro-starter"` → `project_id = "nuteczki"`
- [ ] **0.4** `.github/workflows/ci.yml:4,6` — change `master` → `main` on both push and PR triggers
- [ ] **0.5** `package.json` scripts — add `"deploy": "astro build && wrangler deploy"`
- [ ] **0.6** `src/layouts/Layout.astro:10` — change default title `"10x Astro Starter"` → `"Nuteczki"`
- [ ] **0.7** Create `.dev.vars` with placeholder structure (file is already gitignored at line 28)
- [ ] **0.8** Verify: `npm run lint` passes, `npm run build` passes

---

## Phase 1: Set Cloudflare Worker Secrets _(human-only)_

Prerequisites P3 and P4 must be complete (Cloudflare account created, `wrangler login` done).

- [ ] **1.1** `npx wrangler secret put SUPABASE_URL` — paste the project URL (`https://<ref>.supabase.co`)
- [ ] **1.2** `npx wrangler secret put SUPABASE_KEY` — paste the **anon key** (not service role)
- [ ] **1.3** `npx wrangler secret list` — verify both names appear

**Note:** If `secret put` fails with "could not find project", the Worker doesn't exist yet — run Phase 2 first (deploy creates the Worker), then come back to set secrets and redeploy.

---

## Phase 2: First Deploy _(agent + human verification)_

- [ ] **2.1** `npm run build` — check for build errors or env warnings
- [ ] **2.2** Check bundle size: `ls -lh dist/_worker.js` — must be well under 3MB compressed (free-tier limit). Current risk: LOW (no heavy libs installed)
- [ ] **2.3** `npx wrangler deploy` — note the deployed URL (`https://nuteczki.<subdomain>.workers.dev`)
- [ ] **2.4** Smoke test in browser:
  - Landing page loads with styles ✓
  - `/auth/signin` renders the form ✓
  - `/dashboard` redirects to `/auth/signin` (middleware working) ✓
  - **Do NOT sign in yet** — Supabase doesn't know this domain
- [ ] **2.5** `npx wrangler tail --format json` — load the site, confirm 200 responses, no CPU-exceeded errors

**Troubleshooting:**
- `1101/1102` errors → CPU time exceeded (10ms free-tier limit). For this MVP's simple pages, this shouldn't happen. If it does: upgrade to paid ($5/mo, 30s limit)
- 502/503 → runtime crash. Check `wrangler tail` for missing env vars or unsupported Node APIs
- "Supabase nie jest skonfigurowany" banner appears → secrets not set or not picked up. Verify with `wrangler secret list`, then redeploy

---

## Phase 3: Supabase Production Configuration _(human-only, dashboard)_

- [ ] **3.1** Supabase Dashboard → Project Settings → Authentication → URL Configuration:
  - Set **Site URL** to: `https://nuteczki.<subdomain>.workers.dev`
- [ ] **3.2** In the same section, add **Redirect URLs**:
  - `https://nuteczki.<subdomain>.workers.dev/**` (production wildcard)
  - `http://localhost:4321/**` (local dev, should already exist from P6)
- [ ] **3.3** Email confirmation decision:
  - Current state: confirmations disabled in local config (`supabase/config.toml:209`)
  - **Recommendation**: keep disabled initially. Verify basic auth first, enable later
  - If enabled prematurely with wrong Site URL → users get broken confirmation links and are permanently stuck
- [ ] **3.4** (If email confirmation ON) Dashboard → Authentication → Email Templates → verify the Confirm signup template uses `{{ .SiteURL }}`

**Key insight:** The `confirm-email.astro` page is purely informational — Supabase handles token exchange through its own hosted endpoint, then redirects to Site URL. No `/auth/callback` route needed.

---

## Phase 4: End-to-End Verification _(human)_

- [ ] **4.1** Sign up with a test email at `/auth/signup`
- [ ] **4.2** Sign in at `/auth/signin` — verify redirect to `/`
- [ ] **4.3** Check Topbar shows email and Dashboard/Sign-out links
- [ ] **4.4** Navigate to `/dashboard` — verify it renders (not redirected)
- [ ] **4.5** Click Sign out — verify redirect, Topbar shows "Not signed in"
- [ ] **4.6** Incognito window: `/dashboard` → redirected to `/auth/signin` ✓
- [ ] **4.7** DevTools → Application → Cookies: verify `sb-*-auth-token` cookie exists with `Secure` and `SameSite=Lax`
- [ ] **4.8** DevTools → Network: check TTFB < 200ms on `/dashboard` (includes middleware Supabase call)

---

## Phase 5: CI/CD Automation _(human for secrets, agent for workflow)_

### 5.1 Create Cloudflare API Token _(human-only)_
- [ ] Cloudflare Dashboard → My Profile → API Tokens → Create Token
- [ ] Use **"Edit Cloudflare Workers"** template, scope to specific account
- [ ] Copy the token (shown once)

### 5.2 Set GitHub Secrets _(human-only)_
- [ ] GitHub repo → Settings → Secrets → Actions, add:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `SUPABASE_URL` (same as Cloudflare secret, needed at build time)
  - `SUPABASE_KEY` (same as Cloudflare secret, needed at build time)

### 5.3 Add deploy job to CI workflow _(agent-executable)_
- [ ] Add a `deploy` job to `.github/workflows/ci.yml`:

```yaml
  deploy:
    needs: ci
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

Design: deploy only on push to `main` (not PRs), depends on `ci` passing, wrangler authenticates via env var.

### 5.4 Verify
- [ ] Push changes to `main`
- [ ] GitHub Actions tab: both `ci` and `deploy` jobs pass
- [ ] Deployed site reflects the push

---

## Phase 6: Post-Deploy Hardening _(optional, agent-executable)_

- [ ] **6.1** Add bundle size check to CI (after `npm run build` in `ci` job): fail if compressed `_worker.js` exceeds 3MB
- [ ] **6.2** Update `src/lib/config-status.ts` docsUrl to point to the project's own docs (currently points to `przeprogramowani/10x-astro-starter`)

---

## Rollback Procedure

```bash
npx wrangler versions list          # find last known-good version
npx wrangler rollback <VERSION_ID>  # revert in seconds
```

**Caveats:**
- Rollback does NOT revert Cloudflare secrets — must `wrangler secret put` the old value manually
- Rollback does NOT revert Supabase config — fix Site URL / auth settings in dashboard independently
- For code rollback: revert the commit on `main`, push, let CI redeploy

---

## Files Modified

| File | Change |
|------|--------|
| `wrangler.jsonc` | Worker name → `nuteczki` |
| `package.json` | Package name → `nuteczki`, add `deploy` script |
| `supabase/config.toml` | `project_id` → `nuteczki` |
| `.github/workflows/ci.yml` | Branch `master` → `main`, add `deploy` job |
| `src/layouts/Layout.astro` | Default title → `Nuteczki` |
| `.dev.vars` _(new, gitignored)_ | Local Cloudflare dev secrets |

## Verification

After all phases, the app should be:
1. Live at `https://nuteczki.<subdomain>.workers.dev` with no warning banners
2. Auth flow working end-to-end (signup → signin → dashboard → signout)
3. Auto-deploying on push to `main` via GitHub Actions
4. Monitorable via `npx wrangler tail --format json`
