---
date: 2026-06-16T12:00:22Z
researcher: Claude (Opus 4.8)
git_commit: e499142adb60e3fc5c0ae175e8cab772bf47535d
branch: main
repository: marcstee/nuteczki
topic: "Code review on CI in GitHub Actions, reusing packages/code-reviewer"
tags: [research, codebase, ci, github-actions, code-reviewer, security, supply-chain]
status: complete
last_updated: 2026-06-16
last_updated_by: Claude (Opus 4.8)
---

# Research: Code Review on CI in GitHub Actions

**Date**: 2026-06-16T12:00:22Z
**Researcher**: Claude (Opus 4.8)
**Git Commit**: e499142adb60e3fc5c0ae175e8cab772bf47535d
**Branch**: main
**Repository**: marcstee/nuteczki

## Research Question

Research code review on CI in GitHub Actions, grounded in
[requirements.md](context/changes/code-review-in-ci/requirements.md): run an AI
code review on every PR to `main`, reusing the in-repo
[`packages/code-reviewer`](packages/code-reviewer) Agent-SDK reviewer with thin
GitHub glue (idempotent comment, verdict label, retry label), with every action
pinned to a full commit SHA. The five open questions in the requirements
(tool choice, scale reconciliation, `loadProjectSettings`, blocking vs advisory,
model) frame the planning decisions this research must de-risk.

## Summary

The requirements' lean is **validated by the evidence**: reuse
`packages/code-reviewer` for the review itself and keep the GitHub plumbing thin
in a composite action driven by `actions/github-script`. Specifically:

1. **Schema reconciliation (Open Q2)** — the package today returns a single
   **0–100 `score`** + `summary` + a flat `findings[]` array
   (`severity`/`file`/`line?`/`description?`/`fix?`). There is **no per-criterion
   structure**. The six 1–10 criteria are net-new. The cleaner path is to
   **extend the Zod schema** in one file (`src/schemas/review.ts`) — the JSON
   Schema and TS types regenerate from it automatically — rather than try to
   reverse-derive six criteria from one overall score.
2. **Read-only + `loadProjectSettings` (Open Q3)** — the read-only guarantee is
   robust (3-tool allow-list re-pinned *after* the overrides spread,
   `permissionMode: "default"`). `loadProjectSettings` **already exists**
   (default `false`, `--project-settings` flag). Passing it `true` is a one-line
   change to get CLAUDE.md/lessons.md convention-awareness.
3. **GitHub plumbing** — do it ourselves with `actions/github-script`. The
   marketplace `anthropics/claude-code-action` has **multiple open bugs in its
   sticky-comment / idempotency layer** and breaks under `pull_request_target`,
   so it is the wrong tool for the "one updating comment + exactly one label"
   contract. Concrete idempotent snippets are in this doc (§GitHub Plumbing).
4. **Package public surface** — the CI layer calls `runReview(opts)` (one
   free-text `target` string for the diff, plus `cwd`), or shells out via
   `npm run review -- "<target>" --json`. **No `bin` entry**, **not a workspace**
   (standalone `@nuteczki/code-reviewer`, Node 22.14.0 via `.nvmrc`, npm).
5. **Supply-chain (HARD RULE)** — all current `ci.yml` actions are unpinned
   floating tags *and* 1–2 majors stale. Verified latest SHAs are tabulated
   below for paste-in. Dependabot github-actions bumps both the SHA and the
   `# vX.Y.Z` comment, but only if the version sits at the **end** of the
   comment.

## Detailed Findings

### Area 1 — `packages/code-reviewer` schema (Open Q2: scale reconciliation)

The current structured contract, from
[`src/schemas/review.ts:29-33`](packages/code-reviewer/src/schemas/review.ts):

```ts
export const reviewReportSchema = z.object({
  summary: z.string(),
  score: z.number().int().min(0).max(100),
  findings: z.array(findingSchema),
});
```

Each finding, [`src/schemas/review.ts:19-25`](packages/code-reviewer/src/schemas/review.ts):

```ts
export const findingSchema = z.object({
  severity: severitySchema,          // z.enum(["high","medium","low"]) — line 11
  file: z.string(),
  line: z.number().int().optional(),
  description: z.string(),            // NOTE: `description`, not `message`
  fix: z.string().optional(),        // NOTE: `fix`, not `suggestion`
});
```

- **No per-criterion (1–10) scoring exists** — one overall `score`, severity-tagged
  findings only. The six criteria (C1–C6) from
  [requirements.md §Code Review Criteria](context/changes/code-review-in-ci/requirements.md)
  are entirely new structure.
- The JSON Schema fed to the SDK is **derived** from this Zod object via
  `z.toJSONSchema(reviewReportSchema, { reused: "inline" })` with `$schema`
  stripped and `additionalProperties: false`
  ([`src/schemas/review.ts:41-64`](packages/code-reviewer/src/schemas/review.ts)).
  The system prompt mirrors these fields verbatim
  ([`src/prompts/reviewer.ts:12-23`](packages/code-reviewer/src/prompts/reviewer.ts)).
- Both `reviewReportSchema` and `reviewReportJsonSchema` are exported
  ([`src/index.ts:15-21`](packages/code-reviewer/src/index.ts)), so **extending
  the schema is a single-file edit** — add six `z.number().int().min(1).max(10)`
  criterion fields (plus, per the requirements, the rule that any score < 8
  carries at least one finding), update the system prompt to emit them, and the
  JSON Schema + `ReviewReport` TS type regenerate. The inline (no `$ref`/`$defs`)
  generation was the documented "#1 structured-output risk" the package already
  solved ([archive plan.md lines 106-137](context/archive/2026-06-15-tool-loop-agent/plan.md));
  keep that constraint when extending.

**Verdict-mapping note:** the
[requirements' verdict table](context/changes/code-review-in-ci/requirements.md)
keys on `C1/C2/C4 < 5` and on high/medium/low finding counts. If the schema is
extended to carry the six criterion scores, the CI layer can compute the verdict
deterministically from the parsed `ReviewReport`; if instead the verdict is
derived from the legacy `score` + severities, C1/C2/C4 thresholds can't be
expressed. **This is the strongest argument for extending the schema over
deriving.**

### Area 2 — Read-only guarantee & `loadProjectSettings` (Open Q3)

**Read-only allow-list** —
[`src/agent/tools.ts:5`](packages/code-reviewer/src/agent/tools.ts):
```ts
export const REVIEW_TOOLS = ["Read", "Glob", "Grep"] as const;
```
Enforced in [`src/agent/reviewer.ts:35-48`](packages/code-reviewer/src/agent/reviewer.ts):
`allowedTools` and `permissionMode` are re-pinned **after** the `...overrides`
spread so a caller's overrides cannot defeat them (this is what the
`eea211d` "harden read-only guarantee" commit did). `permissionMode` is
`"default"` ([`reviewer.ts:32`](packages/code-reviewer/src/agent/reviewer.ts)).
No `Bash`/`Write`/`Edit`. **Consequence for CI:** the agent cannot run
`git diff` itself — the diff must be **passed in** via the `target` string.

**`loadProjectSettings` already exists** —
[`src/agent/types.ts:13-18`](packages/code-reviewer/src/agent/types.ts) declares
it, [`reviewer.ts:26,33`](packages/code-reviewer/src/agent/reviewer.ts) defaults
it to `false` and maps it to `settingSources: ["project"]` when true; exposed as
`--project-settings` ([`cli.ts:31,83`](packages/code-reviewer/src/cli.ts)). To
honour repo conventions (CLAUDE.md, lessons.md) in the review, just pass
`loadProjectSettings: true`. **Trade-off for planning:** `true` = convention-aware
review (recommended given the criteria explicitly weight CLAUDE.md hard rules and
lessons.md); `false` = self-contained/deterministic runs.

### Area 3 — Cost / model knobs (Open Q5: model)

[`src/agent/types.ts:5-29`](packages/code-reviewer/src/agent/types.ts) options:
`target` (required), `cwd?`, `model?`, `maxTurns?`, `loadProjectSettings?`,
`abortController?`, `onText?`, `overrides?`.

- **`maxTurns` default = 12** ([`reviewer.ts:25`](packages/code-reviewer/src/agent/reviewer.ts));
  CLI `--max-turns`. Matches the cost cap the requirements name.
- **`model` has no hard-coded default** — optional, only spread when provided
  ([`reviewer.ts:41`](packages/code-reviewer/src/agent/reviewer.ts)); falls back
  to the SDK/account default. CLI `--model <id>`. So Open Q5 (which model for CI
  cost/latency) is a free choice — set it explicitly in the workflow rather than
  relying on the account default.
- **Cost is reported, not capped**: `result.costUsd` from
  `message.total_cost_usd` ([`reviewer.ts:63`](packages/code-reviewer/src/agent/reviewer.ts)).
  Useful to log per-run in the comment footer.

### Area 4 — Public surface & how CI consumes it (Open Q1, Q4)

[`src/index.ts:12-23`](packages/code-reviewer/src/index.ts) exports `runReview`,
`REVIEW_TOOLS`, the schemas/values, and the types (`ReviewOptions`,
`ReviewResult`, `Severity`, `Finding`, `ReviewReport`, re-exported SDK types).

Entry signature
([`reviewer.ts:20`](packages/code-reviewer/src/agent/reviewer.ts)):
```ts
export async function runReview(opts: ReviewOptions): Promise<ReviewResult>
```
- **Input:** a single `target: string` — "a natural-language instruction, a file
  path, or a diff to inspect" ([`types.ts:6`](packages/code-reviewer/src/agent/types.ts)).
  **No structured slots for PR title/body/file-list/diff** — all of it is
  concatenated into `target`. `cwd` sets the readable repo root.
- **Returns** `ReviewResult` ([`types.ts:40-60`](packages/code-reviewer/src/agent/types.ts)):
  `review` (prose), `report?` (**undefined on schema failure**), `outcome`,
  `isError`, `costUsd?`, `turns?`, `sessionId?`.
- **Failure contract** ([`types.ts:31-38`](packages/code-reviewer/src/agent/types.ts)):
  schema/model failures return normally with `report` undefined + `isError` true;
  **SDK-level failures (auth/network/abort) reject the promise** — the CI layer
  must `try/catch` and map a rejection to the `review/error` verdict. This is
  exactly the requirement that "a model error surfaces as `review/error`, not a
  red `ci`/`e2e` check."

**Two ways to invoke from the composite action:**
1. **Programmatic (preferred):** `import { runReview } from "@nuteczki/code-reviewer"`
   → typed `ReviewReport`, plus `costUsd`/`outcome`/`sessionId` for the comment
   footer.
2. **Shell-out:** `npm run review -- "<target>" --json` — `--json` prints
   `JSON.stringify(result.report ?? null)` to stdout, stderr carries the
   streamed text + a `outcome · turns · cost · session` summary, and exit code is
   non-zero when the run errored or produced no valid report
   ([`cli.ts:95-111`](packages/code-reviewer/src/cli.ts)). **No `bin` entry**, so
   it's `npm run review`/`tsx src/cli.ts`, not an installed binary. **No stdin** —
   the diff must be an argv positional, a practical size limit for large PRs.

**Offline smoke** ([`src/smoke.ts`](packages/code-reviewer/src/smoke.ts), `npm run
smoke`): four boolean checks (SDK `query` is callable, `runReview` exported,
JSON Schema shape, a schema round-trip) — **no live model call**. Good as a fast
CI sanity step that costs nothing; it does **not** validate the live review.

### Area 5 — Existing CI workflow & integration surface

[`.github/workflows/ci.yml`](.github/workflows/ci.yml):

- **Triggers:** `push` to `main` and `pull_request` to `main` (lines 3–7), no
  filters.
- **Jobs:** `ci`, `e2e` (both `ubuntu-latest`, no `needs`), and `deploy` which
  `needs: [ci, e2e]` and is gated to
  `github.event_name == 'push' && github.ref == 'refs/heads/main'`. So **PRs run
  `ci` + `e2e` but not `deploy`** — the new review job slots alongside `ci`/`e2e`
  on `pull_request` and must **not** be added to `deploy.needs` (keeps it
  advisory, satisfies "must not gate deploy").
- **Permissions:** no top-level block; only the `deploy` job declares
  `contents: read` + `deployments: write` (lines 68–70). The review job needs its
  own `permissions: { contents: read, pull-requests: write }` (and
  `issues: write` for label add/remove on the issues API).
- **Concurrency:** none today — net-new for the review job.
- **Secrets in use:** `SUPABASE_URL/KEY` (ci, deploy), `E2E_EMAIL/PASSWORD`
  (e2e), `SUPABASE_ACCESS_TOKEN/PROJECT_REF/DB_PASSWORD` + `CLOUDFLARE_*`
  (deploy). `ANTHROPIC_API_KEY` is **net-new** and must be added to repo secrets.
- **Stack facts for the review job:** Node **22.14.0** (`.nvmrc`); **npm**
  (`package-lock.json`); `packages/code-reviewer` is a **standalone sibling**,
  not a workspace — the job must `npm ci` inside `packages/code-reviewer`
  separately (its own lockfile).

### Area 6 — Supply-chain: SHA pins (HARD RULE) & Dependabot

**Current state:** every `uses:` in `ci.yml` is a floating tag **and** stale —
`actions/checkout@v4`, `setup-node@v4`, `upload-artifact@v4`, `supabase/setup-cli@v1`.

**Verified latest SHAs (resolved live via `gh api` on 2026-06-16)** — paste-ready:

| Action | Tag | Pin |
| --- | --- | --- |
| actions/checkout | v6.0.3 | `actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3` |
| actions/setup-node | v6.4.0 | `actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0` |
| actions/upload-artifact | v7.0.1 | `actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1` |
| actions/github-script | v9.0.0 | `actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3 # v9.0.0` |
| supabase/setup-cli | v2.1.1 | `supabase/setup-cli@3c2f5e2ae34c34e428e8e206e2c4d21fa2d20fbf # v2.1.1` |
| anthropics/claude-code-action | v1.0.149 | `anthropics/claude-code-action@4d7e1f0cd85743fdc93b1c8040ab54395da024e2 # v1.0.149` |

> Verify each SHA again at implementation time (`gh api repos/<owner>/<repo>/git/ref/tags/<tag>`) —
> tags can advance between now and planning. Note the e2e job deliberately pins
> Supabase CLI to **2.98.2** (a `version:` input, not the action ref) because
> "2.106.x images lack table grants" — that version pin is orthogonal to SHA-pinning
> the action and must be preserved. A conservative `actions/checkout@v5.0.0`
> (`08c6903cd8c0fde910a37f88322edcfb5dd907a8`) is also verified if a smaller bump
> is preferred over v6.

**Rationale (cite in the workflow):** the **tj-actions/changed-files** incident
(2025-03-14, **CVE-2025-30066**) — an attacker repointed nearly all version tags
to a commit that dumped runner memory and printed secrets into public logs; SHA-pinned
consumers were unaffected because SHAs are immutable.

**Dependabot:** github-actions updates **bump the SHA and rewrite the `# vX.Y.Z`
comment**, but **only if the version string is at the end of the comment** — keep
comments in the exact `# vX.Y.Z` form, nothing trailing. The npm package needs
its **own** entry; the github-actions entry at `/` does not cover it:

```yaml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule: { interval: "weekly" }
  - package-ecosystem: "npm"
    directory: "/packages/code-reviewer"
    schedule: { interval: "weekly" }
```

### Area 7 — Fork-PR safety (Open: fork handling)

- Plain **`pull_request`**: for fork PRs, `GITHUB_TOKEN` is read-only and **secrets
  are not injected** — an AI review literally cannot run with `ANTHROPIC_API_KEY`
  on a fork PR.
- **`pull_request_target`**: runs in base-repo context **with secrets**; the
  injection risk is checking out attacker-controlled `head.sha` while secrets are
  in scope. Avoid.
- **Recommended (solo repo):** stay on plain `pull_request` and gate the job to
  same-repo branches:
  ```yaml
  if: github.event.pull_request.head.repo.fork == false
  ```
  This eliminates the entire injection class and matches the requirements'
  "restricting reviews to same-repo branches is acceptable."

### Area 8 — GitHub plumbing: idempotent comment, labels, retry, concurrency

**Tool choice (Open Q1) — reuse the package, glue with `actions/github-script`.**
`anthropics/claude-code-action` has open bugs that break the exact contract we
need: `use_sticky_comment` is ignored in prompt/"agent" mode (issue #1108), fails
to find the existing comment when a custom token is used → posts a new comment
every run (issue #960), and doesn't work under `pull_request_target` (issue #705).
Its real value (Bedrock/Vertex auth switches) we don't need. So keep it out of
the critical path; do comment/label/retry ourselves.

**(a) Idempotent comment** — embed an HTML marker, paginate existing comments,
update-or-create:
```js
const marker = '<!-- ai-code-review -->';
const body = `${marker}\n${process.env.REVIEW_BODY}`;
const comments = await github.paginate(github.rest.issues.listComments,
  { ...context.repo, issue_number: context.issue.number, per_page: 100 });
const existing = comments.find(c => c.body.includes(marker));
existing
  ? await github.rest.issues.updateComment({ ...context.repo, comment_id: existing.id, body })
  : await github.rest.issues.createComment({ ...context.repo, issue_number: context.issue.number, body });
```

**(b) Exactly one verdict label** — remove the other labels in the set (swallow
404), then `addLabels` (idempotent). Use the requirements' `review/*` names
(`review/pass`, `review/comment`, `review/changes-requested`, `review/error`) —
GitHub label names may contain `/`.
```js
const set = ['review/pass','review/comment','review/changes-requested','review/error'];
for (const name of set.filter(l => l !== desired))
  try { await github.rest.issues.removeLabel({ ...context.repo, issue_number, name }); }
  catch (e) { if (e.status !== 404) throw e; }
await github.rest.issues.addLabels({ ...context.repo, issue_number, labels: [desired] });
```

**(c) One-shot retry label** — listen for `labeled`, filter to `review/retry`,
remove it as the job's first step:
```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, labeled]
jobs:
  review:
    if: >
      github.event.pull_request.head.repo.fork == false &&
      (github.event.action != 'labeled' || github.event.label.name == 'review/retry')
```

**(d) Concurrency** — cancel superseded runs on re-push/re-retry:
```yaml
concurrency:
  group: ai-review-${{ github.event.pull_request.number || github.sha }}
  cancel-in-progress: true
```

## Code References

- [`packages/code-reviewer/src/schemas/review.ts:11-64`](packages/code-reviewer/src/schemas/review.ts) — Zod schema (0–100 `score`, findings), derived JSON Schema; the schema-extension surface for the six criteria.
- [`packages/code-reviewer/src/agent/reviewer.ts:20-79`](packages/code-reviewer/src/agent/reviewer.ts) — `runReview` entry; read-only re-pin after overrides; `maxTurns`/`model`/`loadProjectSettings`/`cost` wiring; `safeParse` validation.
- [`packages/code-reviewer/src/agent/types.ts:5-60`](packages/code-reviewer/src/agent/types.ts) — `ReviewOptions` / `ReviewResult`; failure contract (promise rejects on SDK errors).
- [`packages/code-reviewer/src/agent/tools.ts:5`](packages/code-reviewer/src/agent/tools.ts) — `REVIEW_TOOLS = ["Read","Glob","Grep"]`.
- [`packages/code-reviewer/src/index.ts:12-23`](packages/code-reviewer/src/index.ts) — public exports.
- [`packages/code-reviewer/src/cli.ts:25-111`](packages/code-reviewer/src/cli.ts) — arg parsing, `--json` stdout, exit codes (no `bin`, no stdin).
- [`packages/code-reviewer/src/smoke.ts`](packages/code-reviewer/src/smoke.ts) — offline smoke (no model call).
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — ci/e2e/deploy jobs, unpinned actions, secrets, no concurrency, no top-level permissions.

## Architecture Insights

- **The review schema is the load-bearing decision.** Everything downstream
  (verdict mapping, comment rendering, the `C1/C2/C4 < 5` gate) depends on whether
  the six criteria exist as structured fields. Extending the Zod schema is a
  contained, single-source-of-truth edit; deriving from the legacy `score`
  cannot express the criterion-level gates the requirements specify.
- **Separation of concerns is already correct in the package:** the agent owns
  *judgment* (read-only, structured output, cost), and the requirements want the
  composite action to own *GitHub side-effects* (comment/label/retry). The package
  was explicitly built to be "cleanly importable" with CI integration deferred —
  this change is that deferred work.
- **Determinism boundary:** map promise-rejection and `report === undefined` to
  `review/error` and **never** fail the job in a way that reds `ci`/`e2e`. The
  review job stays off `deploy.needs`.
- **Security posture is two-layered:** SHA-pinning (freeze the code that runs with
  our secrets) + fork-skipping (don't run with secrets on untrusted code) +
  least-privilege token (`contents: read`, `pull-requests: write`,
  `issues: write`).

## Historical Context (from prior changes)

- [`context/archive/2026-06-15-tool-loop-agent/plan.md`](context/archive/2026-06-15-tool-loop-agent/plan.md) —
  built the package. Designed the `summary`/`score`/`findings` schema (severity
  `high/medium/low`, optional `line`/`fix`), the inline JSON Schema generation
  (the documented `error_max_structured_output_retries` risk), and the read-only
  guarantee. **Explicitly deferred:** "no CI gating semantics," no comment/label
  integration, no eval env — left as future work, which is this change.
- [`context/archive/2026-06-15-tool-loop-agent/reviews/impl-review.md`](context/archive/2026-06-15-tool-loop-agent/reviews/impl-review.md) —
  the read-only-after-overrides re-pin and the CLI try/catch came from this review;
  both matter to the CI failure contract.
- [`context/archive/2026-06-11-critical-flow-e2e/`](context/archive/2026-06-11-critical-flow-e2e/) +
  [test-plan.md §6.3/§6.6](context/foundation/test-plan.md) — the `e2e` job is the
  precedent for adding a PR-time job (Supabase setup, artifact upload on failure,
  same-repo secret use); the review job mirrors its placement (parallel to `ci`,
  not in `deploy.needs`).

## Related Research

- [`context/changes/code-review-in-ci/requirements.md`](context/changes/code-review-in-ci/requirements.md) — the WHAT this research grounds.
- [`context/foundation/test-plan.md` §2 Risk Map](context/foundation/test-plan.md) — the six review criteria are weighted toward these risks (#1 dead-end exercise, #3 silent save / Q2 burn, #6 IDOR); the criterion anchors in requirements.md quote them directly.
- [`context/foundation/lessons.md`](context/foundation/lessons.md) — "HTTP 200 ≠ persisted" (C2/C6 anchor) and the Tailwind v4 `length:` hint (C3 anchor) are concrete findings the review should catch; argues for `loadProjectSettings: true`.

## Open Questions (for planning)

1. **Open Q2 (schema):** extend `reviewReportSchema` with six 1–10 criterion
   fields (recommended — needed for the `C1/C2/C4 < 5` gate) vs derive from the
   legacy `score`. If extending: keep `line`/`fix` optional, keep JSON Schema
   inline (no `$ref`/`$defs`), update the system prompt to emit all six +
   the "any score < 8 ⇒ ≥1 finding" rule.
2. **Open Q3 (`loadProjectSettings`):** recommend `true` so the review honours
   CLAUDE.md hard rules + lessons.md (the criteria are written around them);
   confirm the cost/determinism trade-off is acceptable.
3. **Open Q1 (tool choice):** reuse `packages/code-reviewer` + `github-script`
   glue (validated). Decide programmatic import vs `npm run review -- --json`
   shell-out, and how to pass a large diff (argv size limit — may need to write
   the diff to a temp file and pass a path, since `target` accepts a file path).
4. **Open Q5 (model):** pick an explicit CI model id (no package default) trading
   cost/latency for routine PRs; set via `model`/`--model`.
5. **Open Q4 (blocking vs advisory):** start advisory (off `deploy.needs`, no
   required check); revisit making `review/changes-requested` a required check
   once the verdict proves reliable.
6. **Diff acquisition:** the agent can't run `git diff` (read-only, no `Bash`) —
   the workflow must produce `base...head` and the changed-file list and inject
   them into `target`. Decide where (a workflow step using `git` after a full-history
   checkout, `fetch-depth: 0`).
7. **Label bootstrapping:** the five `review/*` labels (incl. `review/retry`)
   must exist in the repo or be created idempotently on first run.
