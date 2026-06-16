# Code Review in CI — Implementation Plan

## Overview

Run an advisory AI code review on every pull request to `main` and surface its
verdict back on the PR (one idempotent comment + exactly one `review/*` label),
giving a solo developer a structured second opinion without a human reviewer in
the loop. The review judgment reuses the in-repo `@nuteczki/code-reviewer`
package; the GitHub side-effects live in a thin composite action; supply-chain
hygiene (SHA-pinned actions + Dependabot) is hardened along the way.

## Current State Analysis

- **`@nuteczki/code-reviewer`** (`packages/code-reviewer/`) is a standalone,
  read-only Agent-SDK reviewer. Its structured contract today is `summary` +
  one `score` (0–100) + a flat `findings[]` array
  (`packages/code-reviewer/src/schemas/review.ts:29-33`). **No per-criterion
  structure exists.** The Zod object is the single source of truth — the SDK
  JSON Schema (`reviewReportJsonSchema`) and the `ReviewReport` TS type are both
  derived from it.
- **Read-only guarantee is solid** (`reviewer.ts:44-47`): `allowedTools` =
  `["Read","Glob","Grep"]` and `permissionMode: "default"` are re-pinned *after*
  the `overrides` spread. **Consequence:** the agent has no `Bash`, so it cannot
  run `git diff` itself — the diff must be produced by the workflow and handed to
  the agent.
- **Knobs already wired** (`reviewer.ts:25-33`, `types.ts:5-29`):
  `loadProjectSettings` (default `false` → `settingSources: ["project"]` when
  true), `model` (no default), `maxTurns` (default 12). Exposed on the CLI as
  `--project-settings`, `--model`, `--max-turns` (`cli.ts:25-35`).
- **Failure contract** (`types.ts:31-38`, `reviewer.ts`): a schema/model failure
  returns normally with `report` undefined + `isError` true; an SDK-level failure
  (auth/network/abort) **rejects** the promise. The CLI already maps both to a
  non-zero exit (`cli.ts:87-93,110-111`).
- **Invocation surface** (`cli.ts`): `npm run review -- "<target>" --json` prints
  `JSON.stringify(report ?? null)` to stdout; streamed text + an
  `outcome · turns · cost · session` line go to stderr. **No `bin`, no stdin** —
  `target` is an argv positional, but `target` may be *a file path the agent
  Reads*, which sidesteps the argv size limit for large diffs.
- **CI** (`.github/workflows/ci.yml`): `ci` + `e2e` run on `push`/`pull_request`
  to `main`; `deploy` is push-only and `needs: [ci, e2e]`. **PRs run `ci` + `e2e`
  but not `deploy`.** No top-level `permissions`, no `concurrency`. All four
  actions are **unpinned floating tags** (`checkout@v4`, `setup-node@v4`,
  `upload-artifact@v4`, `supabase/setup-cli@v1`). `ANTHROPIC_API_KEY` is **not**
  yet a repo secret. The package is a standalone sibling (own lockfile) — the job
  must `npm ci` inside `packages/code-reviewer`.

## Desired End State

Opening or updating a PR to `main` (from a same-repo branch) triggers a `review`
job that runs alongside `ci`/`e2e`. The PR receives one idempotent comment with
the prose summary, six 1–10 criterion scores, and severity-grouped findings, and
carries exactly one `review/{pass,comment,changes-requested,error}` label
matching the rolled-up verdict. Adding `review/retry` re-runs the review and is
consumed. A review failure yields `review/error` and never reds `ci`/`e2e`/
`deploy`. Every `uses:` in the workflow and the action is pinned to a full commit
SHA with a `# vX.Y.Z` comment, and Dependabot watches both the actions and the
package lockfile.

**Verify:** open a test PR → see the comment + a single label; push again → the
same comment updates in place; add `review/retry` → re-runs and the label clears;
temporarily break the API key → `review/error`, `ci`/`e2e` still green.

### Key Discoveries

- Schema is the load-bearing decision — the `C1/C2/C4 < 5` gate is only
  expressible if the six criteria exist as typed fields
  (`research.md` Area 1; `schemas/review.ts:29-33`).
- The agent cannot self-fetch the diff (no `Bash`) — workflow must inject it
  (`reviewer.ts:44-47`, `tools.ts:5`).
- `anthropics/claude-code-action` has open idempotency bugs (#1108, #960, #705)
  — do the comment/label/retry plumbing ourselves with `actions/github-script`
  (`research.md` Area 8).
- Dependabot github-actions bumps the SHA **and** rewrites the `# vX.Y.Z` comment
  only if the version sits at the **end** of the comment (`research.md` Area 6).
- Fork PRs under plain `pull_request` get no secrets — gate the job to same-repo
  branches with `head.repo.fork == false` (`research.md` Area 7).

## What We're NOT Doing

- **Not** making `review/changes-requested` a required, merge-blocking status
  check. Advisory only this change — the job stays off `deploy.needs` and is not
  added to branch protection.
- **Not** reviewing PRs from forks (no secrets available under `pull_request`;
  `pull_request_target` is avoided).
- **Not** auto-applying suggested fixes — the agent is read-only by design.
- **Not** judging business alignment (whether the change is the *right* thing to
  build) — the criteria are engineering-quality only.
- **Not** retaining the legacy 0–100 `score` — the six criteria replace it as the
  single quality signal (the package has no external consumers; CI is its first).

## Implementation Approach

Three phases, each independently verifiable. Phase 1 changes only the package
(offline-testable via `npm run smoke`, no model call, no CI). Phase 2 adds the
composite action that owns all GitHub side-effects and the diff plumbing. Phase 3
wires the workflow job, hardens supply-chain, and adds Dependabot. The split
keeps the risky business rule (verdict thresholds) and the comment format inside
the package where they are unit-tested, and keeps the YAML/`github-script` glue
thin.

**Decisions locked in questioning (see plan-brief.md for the table):** extend the
Zod schema with six criteria; `loadProjectSettings: true`; shell-out invocation
with the diff passed as a temp-file path; verdict + comment rendering live in the
package; model `claude-sonnet-4-6`; advisory only.

## Critical Implementation Details

- **JSON Schema must stay inline (no `$ref`/`$defs`).** `reviewReportJsonSchema`
  is generated with `z.toJSONSchema(..., { reused: "inline" })` precisely because
  a top-level `$defs`/`$ref` is the most likely cause of
  `error_max_structured_output_retries` (`schemas/review.ts:47-64`). When adding
  the `criteria` object, confirm the generated schema's top-level keys remain
  `type`/`properties`/`required`/`additionalProperties` and that no `$ref`
  appears (the smoke check already asserts shape — extend it).
- **Diff acquisition needs full history.** `git diff base...head` only works if
  the merge-base is present — the workflow checkout must use `fetch-depth: 0`.
  The agent reads the diff *file*, so the action writes it to a path under the
  runner workspace and includes that path in the `target` instruction.
- **Failure must not red the job.** Wrap the review invocation so both a non-zero
  CLI exit (no valid report) and any thrown error map to the `review/error` label
  via the `github-script` step; the action's final status stays success so
  `ci`/`e2e`/`deploy` are unaffected.

## Phase 1: Reviewer package — criteria schema, prompt, verdict + comment modules

### Overview

Replace the single `score` with a six-criterion (1–10) `criteria` block, teach
the prompt to emit it, and add two exported, offline-tested helpers the action
will consume: `computeVerdict` and `renderComment`. Update the CLI renderer and
the smoke checks to the new contract.

### Changes Required

#### 1. Criteria schema

**File**: `packages/code-reviewer/src/schemas/review.ts`

**Intent**: Carry the six review criteria as typed 1–10 integers so the verdict
gate (`C1/C2/C4 < 5`, "every criterion ≥ 8") is computable from the parsed
report. The single `score` field is removed; the criteria are the new signal.

**Contract**: Add a `criteriaSchema` object with six integer fields
`z.number().int().min(1).max(10)` keyed by stable names —
`correctness` (C1), `security` (C2), `conventions` (C3), `testing` (C4),
`readability` (C5), `errorHandling` (C6). Replace `score` in `reviewReportSchema`
with `criteria: criteriaSchema`. `findingSchema` is unchanged
(`severity`/`file`/`line?`/`description?`/`fix?`). Keep `reviewReportJsonSchema`
generation exactly as-is (`reused: "inline"`, `stripSchemaMeta`,
`additionalProperties: false`) and verify it emits no `$ref`. Export
`criteriaSchema` + its inferred `Criteria` type alongside the existing exports.

#### 2. System prompt

**File**: `packages/code-reviewer/src/prompts/reviewer.ts`

**Intent**: Tell the model to emit the six criteria with the requirements'
anchors, and enforce the "any criterion < 8 ⇒ at least one concrete finding"
rule so scores are never unexplained numbers.

**Contract**: Replace the `score` instruction with a `criteria` block listing the
six fields, each with a one-line description and the 1 (worst) / 10 (best)
meaning drawn from `requirements.md §Code Review Criteria`. Add the rule: a score
below 8 on any criterion must be backed by ≥1 finding naming the file and why.
Keep the severity vocabulary (`high`/`medium`/`low`) in lock-step with
`severitySchema`. The prompt must still instruct: return an empty `findings` list
when the change is clean rather than manufacturing findings.

#### 3. Verdict computation

**File**: `packages/code-reviewer/src/report/verdict.ts` (new)

**Intent**: Roll the parsed report up to one of four verdicts, deterministically,
so the rule lives in tested code rather than YAML-embedded JS.

**Contract**: Export `type Verdict = "pass" | "comment" | "changes-requested" | "error"`
and `computeVerdict(report: ReviewReport): Exclude<Verdict, "error">` implementing
`requirements.md §Verdict → status mapping`:
- `changes-requested` — any high-severity finding, or `correctness`/`security`/
  `testing` (C1/C2/C4) < 5.
- `pass` — no high or medium findings, and every criterion ≥ 8.
- `comment` — otherwise (low/medium findings, or any criterion 5–7).
(`error` is owned by the action when no valid report exists — not produced here.)

#### 4. Comment renderer

**File**: `packages/code-reviewer/src/report/comment.ts` (new)

**Intent**: Produce the idempotent PR-comment markdown from a report, so the
comment format is unit-coverable and the action just posts the string.

**Contract**: Export `const REVIEW_MARKER = "<!-- ai-code-review -->"` and
`renderComment(report: ReviewReport, meta: { verdict: Verdict; costUsd?: number; turns?: number; commitSha?: string }): string`.
Output begins with `REVIEW_MARKER` on its own line, then: a heading with the
verdict, the prose `summary`, a six-row criterion-score table/list, findings
grouped high → medium → low (each `file` or `file:line`, description, and `fix`
when present), and a footer line with model/cost/turns/commit. When `findings`
is empty, render an explicit "No findings." line.

#### 5. Package exports

**File**: `packages/code-reviewer/src/index.ts` (and `src/report/index.ts` new barrel)

**Intent**: Make the new helpers importable by the action without reaching into
internals, mirroring the existing export style.

**Contract**: Re-export `computeVerdict`, `renderComment`, `REVIEW_MARKER`, and
the `Verdict`/`Criteria` types from `index.ts`. Add a `src/report/index.ts`
barrel for `verdict.ts` + `comment.ts`.

#### 6. CLI renderer

**File**: `packages/code-reviewer/src/cli.ts`

**Intent**: Keep the terminal output working after `score` is removed.

**Contract**: In `renderReport`, replace the `Score: N/100` line with the six
criterion scores (and optionally the computed verdict via `computeVerdict`). No
flag/argument changes.

#### 7. Smoke checks

**File**: `packages/code-reviewer/src/smoke.ts`

**Intent**: Cover the new contract offline (no model call) — the JSON Schema
shape with `criteria`, a schema round-trip, and the verdict thresholds.

**Contract**: Extend the existing boolean checks: (a) the round-trip fixture now
includes a valid `criteria` block; (b) `reviewReportJsonSchema` still has exactly
the four top-level keys and no `$ref`; (c) `computeVerdict` returns
`changes-requested` for a high finding and for C1/C2/C4 < 5, `pass` for all-≥8 /
no high-medium, and `comment` for a mid-range case.

### Success Criteria

#### Automated Verification

- Typecheck passes in the package: `cd packages/code-reviewer && npx tsc --noEmit`
- Lint passes in the package: `cd packages/code-reviewer && npm run lint`
- Offline smoke passes: `cd packages/code-reviewer && npm run smoke`
- The generated `reviewReportJsonSchema` contains no `$ref`/`$defs` (asserted by smoke)

#### Manual Verification

- A live `npm run review -- "<some path>" --json` returns a report whose
  `criteria` has all six integer fields in 1–10 and no `score` key
- The CLI human render shows the six criterion scores, grouped findings, and a
  sensible verdict

**Implementation Note**: After Phase 1 automated verification passes, pause for
manual confirmation (one live `npm run review` check) before Phase 2.

---

## Phase 2: Composite action — diff acquisition, review run, comment/labels/retry

### Overview

A composite action that produces the PR diff, runs the reviewer, and performs all
GitHub side-effects (sticky comment, single verdict label, retry consumption,
error mapping) via `actions/github-script`.

### Changes Required

#### 1. Composite action definition

**File**: `.github/actions/ai-code-review/action.yml` (new)

**Intent**: Encapsulate diff acquisition + review + GitHub plumbing so the
workflow file stays small and the review step is testable in isolation.

**Contract**: `runs.using: "composite"`. Inputs: `anthropic_api_key` (required),
`github_token` (required), `model` (default `claude-sonnet-4-6`), `base_sha`,
`head_sha`. Steps, in order:
1. Compute the diff: `git diff <base_sha>...<head_sha>` to a workspace file
   (e.g. `$RUNNER_TEMP/pr.diff`) and the changed-file list to a variable. (Relies
   on the workflow's `fetch-depth: 0` checkout.)
2. `npm ci` inside `packages/code-reviewer`.
3. Run the review: `npm run review -- "<instruction>" --project-settings --model <model> --json`,
   where `<instruction>` names the PR title/body, the changed-file list, and the
   path to the diff file for the agent to Read; capture stdout (the JSON report)
   to a file and the exit code. `ANTHROPIC_API_KEY` from the input env.
4. `actions/github-script` (SHA-pinned) step that reads the report JSON and
   performs the side-effects below. Wrapped so that a missing/invalid report or a
   non-zero review exit sets `verdict = "error"` rather than failing the step.

#### 2. Sticky comment + label swap + retry (inside the github-script step)

**File**: `.github/actions/ai-code-review/action.yml` (the `github-script` block)

**Intent**: Exactly one updating comment, exactly one verdict label, a one-shot
retry button, and labels that exist before use.

**Contract**:
- **Verdict source**: when a valid report exists, the script imports/derives the
  verdict and comment markdown from the package output (the review step writes the
  rendered comment + verdict to files alongside the JSON, produced via
  `computeVerdict`/`renderComment`); on error it builds a short `review/error`
  comment inline.
- **Idempotent comment**: paginate `issues.listComments`, find the one containing
  `REVIEW_MARKER`, `updateComment` if found else `createComment`.
- **Label bootstrap**: ensure the five labels (`review/pass`, `review/comment`,
  `review/changes-requested`, `review/error`, `review/retry`) exist —
  `createLabel` swallowing the 422-already-exists.
- **Single verdict label**: remove the other three `review/{pass,comment,
  changes-requested,error}` labels (swallow 404), then `addLabels` the desired one.
- **One-shot retry**: as the job's first label action, `removeLabel('review/retry')`
  (swallow 404) so the label is consumed on every run.

#### 3. Review instruction + diff handoff

**File**: `.github/actions/ai-code-review/action.yml` (review step)

**Intent**: Give the read-only agent everything it needs in `target` without
blowing the argv limit.

**Contract**: The `target` string contains the PR title, body, the changed-file
list (to prioritise risk surfaces — `src/pages/api/`, `src/components/drill/`,
`src/components/staff/`), and an explicit instruction to Read the diff at
`$RUNNER_TEMP/pr.diff` plus any surrounding files it needs. The large diff is
never inlined into argv.

### Success Criteria

#### Automated Verification

- Action YAML is valid (parsed without error by the workflow on first run, or
  `actionlint .github/actions/ai-code-review/action.yml` if available)
- All `uses:` inside the action are pinned to a full 40-char SHA with a `# vX.Y.Z`
  comment (grep: no `uses:.*@v[0-9]` in the action file)

#### Manual Verification

- Running the action on a test PR posts a single comment containing the summary,
  six scores, and grouped findings
- Exactly one `review/*` verdict label is applied; re-running updates the same
  comment and does not create a second
- A forced review failure (bad key) results in a `review/error` label + comment,
  and the step does not fail

**Implementation Note**: Pause after Phase 2 for a manual end-to-end check on a
throwaway PR before wiring the workflow trigger in Phase 3.

---

## Phase 3: Workflow wiring + supply-chain hardening + Dependabot

### Overview

Add the advisory `review` job to `ci.yml`, SHA-pin every existing action, and add
Dependabot so SHA bumps flow through reviewed PRs.

### Changes Required

#### 1. Review job

**File**: `.github/workflows/ci.yml`

**Intent**: Trigger the review on PR open/update/retry from same-repo branches,
parallel to `ci`/`e2e`, without gating `deploy`.

**Contract**:
- Extend the `pull_request` trigger `types: [opened, synchronize, reopened, labeled]`.
- New `review` job (not in `deploy.needs`):
  - `if: github.event.pull_request.head.repo.fork == false && (github.event.action != 'labeled' || github.event.label.name == 'review/retry')`
  - `permissions: { contents: read, pull-requests: write, issues: write }`
  - `concurrency: { group: ai-review-${{ github.event.pull_request.number || github.sha }}, cancel-in-progress: true }`
  - Steps: `actions/checkout` with `fetch-depth: 0` → `actions/setup-node`
    (Node 22) → the composite action with
    `anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}`,
    `github_token: ${{ secrets.GITHUB_TOKEN }}`,
    `base_sha: ${{ github.event.pull_request.base.sha }}`,
    `head_sha: ${{ github.event.pull_request.head.sha }}`.

#### 2. SHA-pin existing actions

**File**: `.github/workflows/ci.yml`

**Intent**: Freeze the exact code that runs inside our pipeline with our secrets —
the `tj-actions/changed-files` (CVE-2025-30066) supply-chain class.

**Contract**: Replace each floating tag with a full 40-char SHA + trailing
`# vX.Y.Z` comment (version string last so Dependabot can rewrite it). Re-verify
each SHA at implementation time via `gh api repos/<owner>/<repo>/git/ref/tags/<tag>`
(the values in `research.md` Area 6 are a starting point, captured 2026-06-16):
`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`,
`supabase/setup-cli`, and `actions/github-script` (used by the action).
**Preserve** the `version: 2.98.2` Supabase CLI *input* (that pin is orthogonal
to the action SHA and load-bearing — see the comment at `ci.yml:37-42`).

#### 3. Dependabot

**File**: `.github/dependabot.yml` (new)

**Intent**: Pair every SHA pin with automated bumps so security patches flow
through a reviewed PR instead of arriving under a moving tag.

**Contract**: `version: 2` with two `updates` entries —
`package-ecosystem: "github-actions"` at `directory: "/"`, and
`package-ecosystem: "npm"` at `directory: "/packages/code-reviewer"` (the
github-actions entry does not cover the package's own lockfile). Weekly schedule.

### Success Criteria

#### Automated Verification

- No floating-tag `uses:` remain: `grep -rnE 'uses:.*@v[0-9]' .github/` returns nothing
- Every `uses:` carries a `# vX.Y.Z` comment with the version at the end of the line
- `.github/dependabot.yml` exists and is valid YAML with both ecosystems
- The `ci` and `e2e` jobs still pass on a PR after the pin changes

#### Manual Verification

- `ANTHROPIC_API_KEY` is added to repo secrets (one-time setup, outside the diff)
- Opening a fresh PR to `main` triggers the `review` job and it appears parallel
  to `ci`/`e2e`, not blocking `deploy`
- The PR gets the idempotent comment + single label; `review/retry` re-runs and
  is consumed
- Forcing a review error yields `review/error` while `ci`/`e2e`/`deploy` stay
  unaffected
- Dependabot opens (or is visible as configured for) github-actions + npm updates

**Implementation Note**: This phase is the first time the review runs on real PR
infrastructure. Confirm the full acceptance list in `requirements.md §Success
criteria` on a throwaway PR before considering the change complete.

---

## Testing Strategy

### Unit Tests (offline, in the package smoke)

- `computeVerdict` returns the correct verdict for: a high finding present;
  C1/C2/C4 below 5; all criteria ≥ 8 with no high/medium; a mid-range case.
- `reviewReportJsonSchema` shape: exactly four top-level keys, no `$ref`/`$defs`.
- Schema round-trip of a fixture report including the `criteria` block.

### Integration / E2E (manual, on a throwaway PR)

- Open PR → comment + single label appear.
- Push again → same comment updates in place (no duplicate).
- Add `review/retry` → re-runs, label consumed.
- Forced failure (bad key) → `review/error`, `ci`/`e2e`/`deploy` unaffected.
- Fork PR (if testable) → review job skipped.

### Manual Testing Steps

1. Land Phase 1; run `npm run smoke` + one live `npm run review --json` and
   inspect the `criteria` block.
2. Land Phase 2; run the action against a throwaway PR via a temporary trigger
   and verify comment/label/retry/error behaviour.
3. Land Phase 3; open a real PR and walk the `requirements.md` acceptance list.

## Performance Considerations

- Each review is a metered model call — `maxTurns` stays at 12 and `concurrency`
  cancels superseded runs on re-push/re-retry. Model is `claude-sonnet-4-6` for
  cost/latency on routine PRs. Cost per run is logged in the comment footer
  (`costUsd`).

## Migration Notes

- Removing `score` from `ReviewReport` is a breaking change to the package
  contract, but the package has no external consumers — CI is its first. The CLI
  renderer and smoke are updated in the same phase, so there is no window where
  the package is internally inconsistent.

## References

- Requirements: `context/changes/code-review-in-ci/requirements.md`
- Research: `context/changes/code-review-in-ci/research.md`
- Package entry: `packages/code-reviewer/src/agent/reviewer.ts:20-87`
- Schema source: `packages/code-reviewer/src/schemas/review.ts:29-64`
- CLI: `packages/code-reviewer/src/cli.ts`
- Existing CI: `.github/workflows/ci.yml`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step
> lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reviewer package — criteria schema, prompt, verdict + comment modules

#### Automated

- [x] 1.1 Typecheck passes in the package: `cd packages/code-reviewer && npx tsc --noEmit`
- [x] 1.2 Lint passes in the package: `cd packages/code-reviewer && npm run lint`
- [x] 1.3 Offline smoke passes: `cd packages/code-reviewer && npm run smoke`
- [x] 1.4 Generated `reviewReportJsonSchema` contains no `$ref`/`$defs` (asserted by smoke)

#### Manual

- [x] 1.5 Live `npm run review --json` returns a `criteria` block with six 1–10 integers and no `score`
- [x] 1.6 CLI human render shows six criterion scores, grouped findings, and a verdict

### Phase 2: Composite action — diff acquisition, review run, comment/labels/retry

#### Automated

- [x] 2.1 Action YAML parses without error (or `actionlint` clean if available) — f1264aa
- [x] 2.2 All `uses:` inside the action are SHA-pinned with a `# vX.Y.Z` comment (no `@v[0-9]`) — f1264aa

#### Manual

- [x] 2.3 Running the action on a test PR posts one comment with summary, six scores, grouped findings — f1264aa
- [x] 2.4 Exactly one `review/*` label applied; re-run updates the same comment (no duplicate) — f1264aa
- [x] 2.5 Forced review failure yields `review/error` label + comment, step does not fail — f1264aa

### Phase 3: Workflow wiring + supply-chain hardening + Dependabot

#### Automated

- [x] 3.1 No floating-tag `uses:` remain: `grep -rnE 'uses:.*@v[0-9]' .github/` returns nothing
- [x] 3.2 Every `uses:` carries a trailing `# vX.Y.Z` comment
- [x] 3.3 `.github/dependabot.yml` exists, valid YAML, both ecosystems
- [ ] 3.4 `ci` and `e2e` jobs still pass on a PR after the pin changes

#### Manual

- [ ] 3.5 `ANTHROPIC_API_KEY` added to repo secrets
- [ ] 3.6 Fresh PR triggers the `review` job parallel to `ci`/`e2e`, not gating `deploy`
- [ ] 3.7 PR gets idempotent comment + single label; `review/retry` re-runs and is consumed
- [ ] 3.8 Forced review error yields `review/error` while `ci`/`e2e`/`deploy` stay unaffected
- [ ] 3.9 Dependabot configured for github-actions + npm package lockfile
