---
project: Nuteczki
researched_at: 2026-05-23
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro v6 + React 19
  runtime: Cloudflare Workers (workerd / V8 isolates)
---

## Recommendation

**Deploy on Cloudflare Workers.**

Cloudflare is the native deployment target already specified in the tech stack — the project ships with `@astrojs/cloudflare` adapter and `wrangler.jsonc` configured. It scored Pass on all five agent-friendly criteria: full CLI-first operations via wrangler, fully serverless with zero infrastructure management, best-in-class agent-readable docs (llms.txt + markdown via Accept header), deterministic `wrangler deploy` with structured output, and 15+ GA MCP servers. The free tier covers 100,000 requests/day — more than sufficient for this MVP's small-scale, single-region use case. No adapter swap, no Docker configuration, no new vendor relationship required.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Score |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass | 5/5 |
| **Vercel** | Pass | Pass | Pass | Pass | Pass | 5/5 |
| **Railway** | Pass | Partial | Pass | Pass | Partial | 3P 2Pt |
| **Netlify** | Partial | Pass | Pass | Partial | Pass | 3P 2Pt |
| **Render** | Partial | Partial | Pass | Partial | Partial | 1P 4Pt |
| **Fly.io** | Partial | Partial | Partial | Partial | Partial | 0P 5Pt |

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Native tech-stack match eliminates migration friction — the adapter, config, and dev tooling are already in the project. The free tier (100k requests/day, ~3M/month) far exceeds MVP needs. Wrangler CLI v4 (GA) covers deploy, rollback, logs, and secrets. Agent-readable docs via `llms.txt` and per-page markdown endpoints are the strongest in the field. 15+ managed MCP servers at `mcp.cloudflare.com` provide structured tool access to Workers builds, observability, and DNS — all GA. The workerd runtime runs Astro 6 SSR natively with the `@astrojs/cloudflare` adapter (GA), and local dev now runs on workerd directly (Astro 6 improvement), giving high dev/prod parity.

#### 2. Vercel

Matched Cloudflare on all five criteria. The `@astrojs/vercel` adapter (v10.0.7, GA) supports SSR via serverless functions with ISR. The Vercel MCP server is GA (read-only). `llms-full.txt` is available. The gap vs. Cloudflare: the Hobby tier prohibits commercial use, so the minimum viable plan is Pro at $20/month/seat. Cold starts of 200-500ms on serverless functions are noticeable for the 200ms feedback requirement in the PRD. Adopting Vercel would require swapping the Astro adapter and removing `wrangler.jsonc` — unnecessary migration cost given Cloudflare already fits.

#### 3. Railway

Good developer experience with fast deploys and a persistent Node.js process (no cold starts, no V8 isolate constraints). The `railway` CLI (GA) covers deploy, logs, variables, and SSH. Docs serve `llms-full.txt` and are open-source markdown on GitHub. The gaps: Railpack (the build system) is beta (launched March 2026), and the MCP server is self-described as "work in progress" with no GA label. Minimum cost is $5/month (Hobby plan). Adopting Railway would require swapping to `@astrojs/node` adapter and abandoning the edge-first architecture.

### Dropped Platforms

- **Netlify**: No CLI rollback command — must re-publish via API or dashboard. Credit-based pricing pauses the entire site when credits are exhausted, which is dangerous for an SSR app. Free tier's 300 credits/month may not sustain 100k SSR requests.
- **Render**: Rollback is API/dashboard only. Free tier spins down after 15 minutes with 30-60s cold starts. The MCP server (GA) is read-heavy and cannot trigger deploys. Minimum usable tier is $7/month.
- **Fly.io**: No free tier (removed Oct 2024). Astro 5+/6 auto-detection in `fly launch` is broken — requires a manually written Dockerfile. No `llms.txt` (returns 404). MCP server is experimental. The highest operational overhead of all six candidates for an MVP.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **workerd is not Node.js.** Despite `nodejs_compat`, dependencies reaching for `fs`, `net`, or `child_process` will fail. The compatibility surface has gaps you discover only when a deep dependency touches an unsupported API.
2. **10ms CPU limit on free tier is tight for SSR.** Each Astro SSR render must complete within 10ms of CPU time. A page rendering React islands and calling Supabase can brush this limit as the component tree grows. Exceeding it produces a generic error with no useful diagnostic.
3. **Bundle size ceiling.** 3MB compressed (free) / 10MB compressed (paid). Astro + React 19 + any music notation library (VexFlow, Tone.js) could push against this limit. The error is a deploy-time wall, not a graceful degradation.
4. **Pages deployment path is deprecated.** The `@astrojs/cloudflare` adapter v13 targets Workers exclusively. Community guides referencing "Cloudflare Pages" deployment are outdated and noisy in search results.
5. **No persistent connection pool to Supabase.** Each Worker invocation creates a fresh HTTP client — no connection reuse across requests. At low traffic this is fine; at scale it multiplies connections to Supabase's Postgres.

### Pre-Mortem — How This Could Fail

Six months in, the adaptive exercise algorithm (FR-003) needs a server-side computation step taking 15-20ms of CPU — comfortable in Node, but exceeding the Workers free-tier limit. The team upgrades to paid ($5/month, 30s CPU limit), fixing the immediate problem. Then a parent reports slow session history loads on first visit. Investigation reveals the SSR page makes three sequential Supabase queries (sessions, stats, progress indicator), each creating a fresh HTTP connection from the edge isolate. Total wall-clock is 400ms — acceptable, but the cold-path CPU spike on the first render after a deploy occasionally times out. A VexFlow update adds 800KB to the bundle, pushing compressed size to 2.9MB — 100KB from the free-tier wall. The team spends a weekend code-splitting and lazy-loading the notation renderer to stay under the limit, work that wouldn't exist on a Node-based platform. None of these are fatal, but each consumed a weekend of after-hours time that was supposed to go toward features.

### Unknown Unknowns

- **Wrangler dev vs. production parity gaps.** Astro 6's local dev runs on workerd directly, but edge cases (`crypto.subtle` availability, `Request`/`Response` class differences) can still behave differently locally vs. deployed.
- **Subrequest counting.** Each `fetch()` to Supabase counts against the 50 subrequest limit (free) or 10,000 (paid). An SSR page making 5 Supabase calls hits the free-tier limit at 10 subrequests per invocation.
- **No streaming SSR on Workers.** Astro's streaming SSR (`renderToReadableStream`) works on Node but the Workers adapter fully buffers before sending, increasing Time to First Byte for large pages.
- **Minimal error diagnostics.** When a Worker fails (CPU exceeded, memory exceeded, unhandled rejection), the client sees a generic 1101/1102 Cloudflare error page. Debugging requires `wrangler tail` — no crash dump, no stack trace in the response.

## Operational Story

- **Preview deploys**: `wrangler deploy --env preview` creates a separate Workers environment accessible via a preview URL. Branch-based previews require configuring multiple environments in `wrangler.jsonc`. Preview URLs are public by default — protect with Cloudflare Access if needed.
- **Secrets**: Set via `wrangler secret put SUPABASE_URL` (stored in Workers Secrets, encrypted at rest). Secrets are per-environment. Readable only by the Worker at runtime — not visible in the dashboard after creation. Rotation: `wrangler secret put` overwrites the existing value; no versioning.
- **Rollback**: `wrangler rollback [VERSION_ID]` reverts to a previous deployment. `wrangler versions list` shows available versions. Typical time-to-revert: seconds. Caveat: rollback does not revert Supabase schema migrations — database changes must be rolled back separately.
- **Approval**: Human-only actions: rotate primary Supabase keys, delete the Workers project, modify DNS, change billing tier. Agent-safe actions: deploy, rollback, tail logs, set non-primary secrets, list versions.
- **Logs**: `wrangler tail` streams live logs (supports `--format json` for structured output, `--env` for environment filtering). Historical logs available via Cloudflare dashboard or Logpush (paid). The Cloudflare observability MCP server provides structured log access.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| CPU limit exceeded on free tier as exercise algorithm grows | Devil's advocate | M | M | Monitor CPU time via `wrangler tail --format json`; upgrade to paid ($5/mo) when CPU consistently exceeds 8ms |
| Bundle size exceeds 3MB compressed with music notation library | Devil's advocate | M | H | Code-split notation renderer; lazy-load VexFlow only on exercise pages; monitor bundle size in CI |
| Subrequest limit (50/invocation free tier) hit by multi-query SSR pages | Unknown unknowns | L | H | Batch Supabase queries where possible; use Supabase RPC for complex reads; upgrade to paid for 10,000 limit |
| `nodejs_compat` gap breaks a transitive dependency at runtime | Devil's advocate | L | M | Pin dependencies; test SSR paths on deployed Workers (not just local dev); avoid packages with native Node dependencies |
| No streaming SSR increases TTFB on large pages | Unknown unknowns | L | L | Keep SSR pages small; prerender static pages (session history list); defer heavy rendering to client-side React islands |
| Generic error pages (1101/1102) slow down debugging | Unknown unknowns | M | L | Always run `wrangler tail` during development; add structured error logging to application code; consider Sentry for Workers |
| Stale community content references deprecated Pages deployment | Devil's advocate | M | L | Reference only official Cloudflare Workers docs and Astro adapter docs; ignore Pages-specific guides |
| Supabase connection multiplication under load | Pre-mortem | L | L | Not a concern at MVP scale (low QPS); revisit if traffic grows beyond 1,000 concurrent users |

## Getting Started

1. **Verify wrangler is installed and authenticated:**
   ```
   npx wrangler --version
   npx wrangler whoami
   ```
   If not authenticated: `npx wrangler login` (opens browser OAuth flow).

2. **Set Supabase secrets on Cloudflare:**
   ```
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_KEY
   ```
   Paste values from your `.env` file when prompted.

3. **Deploy to production:**
   ```
   npx wrangler deploy
   ```
   The project's `wrangler.jsonc` and `@astrojs/cloudflare` adapter are already configured. This single command builds and deploys.

4. **Verify the deployment:**
   ```
   npx wrangler tail --format json
   ```
   Open the deployed URL in a browser, trigger a page load, and confirm logs appear with 200 status codes.

5. **Set up a custom domain (optional):**
   Configure in Cloudflare dashboard under Workers & Pages > your project > Settings > Domains. This is a dashboard-only operation.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
