---
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
---

## Why this stack

Solo developer shipping a children's music drill PWA in 3 weeks after-hours with auth as the only technology-forcing feature. Astro + Supabase + Cloudflare is the recommended default for web-app + JS and clears all four agent-friendly gates (typed, convention-based, popular in training data, well-documented). Supabase handles auth (FR-001) and session persistence out of the box, removing the need for a separate auth provider or database setup. Cloudflare Pages gives edge-deployed PWA hosting on a generous free tier. Scaffolding confidence is first-class — the starter has a valid CLI and is expected to scaffold smoothly.
