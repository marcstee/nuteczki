---
bootstrapped_at: 2026-05-19T20:28:08Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: nuteczki
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: nuteczki
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

Solo developer shipping a children's music drill PWA in 3 weeks after-hours with auth as the only technology-forcing feature. Astro + Supabase + Cloudflare is the recommended default for web-app + JS and clears all four agent-friendly gates (typed, convention-based, popular in training data, well-documented). Supabase handles auth (FR-001) and session persistence out of the box, removing the need for a separate auth provider or database setup. Cloudflare Pages gives edge-deployed PWA hosting on a generous free tier. Scaffolding confidence is first-class — the starter has a valid CLI and is expected to scaffold smoothly.

## Pre-scaffold verification

| Signal        | Value                                       | Severity | Notes                        |
| ------------- | ------------------------------------------- | -------- | ---------------------------- |
| npm package   | not run                                     | —        | cmd_template uses git clone, not npm create |
| GitHub repo   | przeprogramowani/10x-astro-starter last pushed 2026-05-17 | fresh    | from card.docs_url           |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 18
**Conflicts (.scaffold siblings)**: CLAUDE.md
**.gitignore handling**: append-merged (23 new lines from starter, de-duped against existing)
**.bootstrap-scaffold/.git/ deleted**: yes (upstream starter history removed)
**.bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 10 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/3/0 direct of total 0/1/10/0

#### HIGH findings

- **devalue** v5.6.3–5.8.0 — DoS via sparse array deserialization (GHSA-77vg-94rm-hx3p, CVSS 7.5). Transitive dependency. Fix available: `npm audit fix`.

#### MODERATE findings

- **ws** v8.0.0–8.20.0 — Uninitialized memory disclosure (GHSA-58qx-3vcg-4xpx, CVSS 4.4). Transitive, via miniflare/supabase-realtime-js. Fix available for wrangler chain.
- **yaml** v2.0.0–2.8.2 — Stack overflow via deeply nested YAML collections (GHSA-48c2-rrv3-qjmp, CVSS 4.3). Transitive, via yaml-language-server. Fix: upgrade @astrojs/check.
- **@astrojs/check** — moderate, direct. Via @astrojs/language-server (transitive yaml chain). Fix: downgrade to 0.9.2 (semver-major).
- **@astrojs/cloudflare** — moderate, direct. Via @cloudflare/vite-plugin and wrangler (ws chain). Fix: downgrade to 12.6.13 (semver-major).
- **@astrojs/language-server** — moderate, transitive. Via volar-service-yaml.
- **@cloudflare/vite-plugin** — moderate, transitive. Via miniflare, wrangler, ws.
- **miniflare** — moderate, transitive. Via ws.
- **volar-service-yaml** — moderate, transitive. Via yaml-language-server.
- **wrangler** — moderate, direct. Via miniflare (ws chain). Fix: downgrade to 3.107.3 (semver-major).
- **yaml-language-server** — moderate, transitive. Via yaml.

## Hints recorded but not acted on

| Hint                       | Value                |
| -------------------------- | -------------------- |
| bootstrapper_confidence    | first-class          |
| quality_override           | false                |
| path_taken                 | standard             |
| self_check_answers         | null                 |
| team_size                  | solo                 |
| deployment_target          | cloudflare-pages     |
| ci_provider                | github-actions       |
| ci_default_flow            | auto-deploy-on-merge |
| has_auth                   | true                 |
| has_payments               | false                |
| has_realtime               | false                |
| has_ai                     | false                |
| has_background_jobs        | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
