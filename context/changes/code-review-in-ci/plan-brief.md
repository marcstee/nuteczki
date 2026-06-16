# Code Review in CI — Plan Brief

> Full plan: `context/changes/code-review-in-ci/plan.md`
> Requirements: `context/changes/code-review-in-ci/requirements.md`
> Research: `context/changes/code-review-in-ci/research.md`

## What & Why

Run an advisory AI code review automatically on every pull request to `main` and
surface its verdict back on the PR (one idempotent comment + a single `review/*`
label), so a solo developer shipping after-hours gets a structured second pair of
eyes without a human reviewer in the loop.

## Starting Point

The in-repo `@nuteczki/code-reviewer` package already runs a read-only Agent-SDK
review and returns a validated structured report — but only a single 0–100
`score` + flat findings, with no CI integration. The existing `ci.yml` runs
`ci` + `e2e` on PRs (and a push-only `deploy`); all its actions are unpinned
floating tags and `ANTHROPIC_API_KEY` is not yet a secret.

## Desired End State

A same-repo PR to `main` triggers a `review` job alongside `ci`/`e2e`. The PR
gets one updating comment (prose summary, six 1–10 criterion scores,
severity-grouped findings) and exactly one `review/{pass,comment,changes-requested,error}`
label. `review/retry` re-runs and is consumed; a review failure yields
`review/error` and never reds `ci`/`e2e`/`deploy`. Every action is SHA-pinned and
Dependabot watches them.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Tool | Reuse `packages/code-reviewer` + `github-script` glue | The marketplace action has open idempotency bugs; the package already encodes read-only + structured output | Requirements / Research |
| Criteria schema | Extend Zod schema, replace `score` with six 1–10 criteria | The `C1/C2/C4 < 5` gate is only expressible from typed criterion fields | Plan |
| Convention-awareness | `loadProjectSettings: true` | The criteria are written around CLAUDE.md hard rules + lessons.md | Plan |
| Invocation | Shell-out `npm run review --json`, diff passed as temp-file path | Sidesteps the argv size limit for large PRs (agent Reads the file) | Plan |
| Verdict + comment logic | Live in the package (`computeVerdict`, `renderComment`), offline-tested | Keeps the load-bearing threshold rule out of untested YAML JS | Plan |
| Model | `claude-sonnet-4-6` | Strong review quality at lower cost/latency for routine per-PR runs | Plan |
| Blocking | Advisory only this change | Matches "start advisory"; a model error never reds CI | Requirements / Plan |
| Supply-chain | SHA-pin all actions + Dependabot | `tj-actions/changed-files` (CVE-2025-30066) — a moved tag is a secret-exfil path | Requirements / Research |

## Scope

**In scope:** six-criterion schema + prompt + verdict/comment modules in the
package; a composite action doing diff acquisition + review + comment/labels/retry;
the advisory `review` job; SHA-pinning every action; Dependabot.

**Out of scope:** merge-blocking/required check; fork PR review; auto-applying
fixes; business-alignment judgment; retaining the legacy `score`.

## Architecture / Approach

`ci.yml` `review` job (same-repo only, least-privilege token, `fetch-depth: 0`,
concurrency-cancel) → composite action `.github/actions/ai-code-review`: compute
`git diff base...head` to a file → `npm ci` in the package → `npm run review --
"<title/body/file-list + diff path>" --project-settings --model claude-sonnet-4-6
--json` → `github-script` reads the package-rendered comment + verdict, posts the
sticky comment (HTML marker), swaps to one label, consumes `review/retry`, maps
any failure to `review/error`. Verdict thresholds + comment markdown live in the
package and are covered by the offline smoke (no model call).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Reviewer package | Six-criterion schema + prompt, tested `computeVerdict`/`renderComment`, updated CLI + smoke | JSON Schema must stay inline (no `$ref`) to avoid `error_max_structured_output_retries` |
| 2. Composite action | Diff acquisition + review run + sticky comment / single label / retry / error mapping | Idempotency (one comment, one label) and failure-never-reds-CI |
| 3. Workflow + supply-chain | Advisory `review` job, SHA-pinned actions, Dependabot | Preserving the `version: 2.98.2` Supabase input; verifying SHAs are current |

**Prerequisites:** `ANTHROPIC_API_KEY` added to repo secrets (one-time, outside
the diff); SHAs re-verified at implementation time via `gh api`.
**Estimated effort:** ~3 sessions, one per phase, with a manual PR check after
phases 2 and 3.

## Open Risks & Assumptions

- SHA values in research are dated 2026-06-16 — re-verify each at implementation
  time; tags can advance.
- The agent must actually Read the injected diff path — the instruction wording
  matters; verify on a real run that it inspects the diff, not just the file list.
- Removing `score` is a breaking package change, mitigated by no external
  consumers and same-phase CLI/smoke updates.

## Success Criteria (Summary)

- A PR to `main` gets an idempotent comment with the summary, six 1–10 scores,
  and grouped findings, plus exactly one matching `review/*` label.
- `review/retry` re-runs the review and is consumed; a failure yields
  `review/error` without affecting `ci`/`e2e`/`deploy`.
- No secret in the workflow/action source; every action SHA-pinned with
  Dependabot configured.
