<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Modular Code-Review Agent (Claude Agent SDK)

- **Plan**: context/changes/tool-loop-agent/plan.md
- **Scope**: All 4 phases (full plan)
- **Date**: 2026-06-16
- **Verdict**: APPROVED
- **Findings**: 0 critical · 1 warning · 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

All automated criteria re-verified green: typecheck, build, offline smoke (4/4 ✓, exit 0),
JSON-Schema top-level keys exactly `type/properties/required/additionalProperties` (no
`$ref`/`$defs`/`$schema`), README layout matches the tree, naming consistent at
`@nuteczki/code-reviewer`, old monolith (`src/reviewer.ts`) and nested cruft tree removed.

## Findings

### F1 — `overrides` can silently defeat the read-only guarantee

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/agent/reviewer.ts:35-46
- **Detail**: The agent's core promise is "read-only" (allowedTools Read/Glob/Grep,
  permissionMode "default"). But `...overrides` is spread LAST, after `allowedTools`,
  `permissionMode`, and `outputFormat`. A caller passing
  `overrides: { allowedTools: ["Write","Bash"], permissionMode: "bypassPermissions" }`
  silently turns this into a write-capable, auto-approving agent. The plan's "What We're
  NOT Doing" pins the read-only allow-list as an invariant; the escape hatch quietly makes
  it optional. No external callers exist today, so blast radius is low — but a future eval
  provider or HTTP handler could trip it unknowingly.
- **Fix**: Re-pin the safety-critical keys after the spread, e.g.
  `{ ...options, ...overrides, allowedTools: [...REVIEW_TOOLS], permissionMode }` —
  preserves the escape hatch for model/maxTurns/cwd while keeping the read-only guarantee
  non-overridable. (If overridable tools are genuinely wanted, instead document the caveat
  on the `overrides` JSDoc in types.ts:23.)
- **Decision**: FIXED

### F2 — `runReview` can reject; contract only describes graceful failure

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: packages/code-reviewer/src/agent/reviewer.ts:51 ; packages/code-reviewer/src/cli.ts:76
- **Detail**: The defensive-parse design handles `error_max_structured_output_retries`
  gracefully — that arrives as a `result` message, so `report` stays undefined and `isError`
  is set. But an SDK-level throw (missing auth, network failure, abort) rejects the async
  iterator instead. `runReview` has no try/catch, so the promise rejects — and the
  `ReviewResult` JSDoc (types.ts:28-47) documents only the isError/undefined-report path, not
  that the call can throw. The CLI's top-level `await runReview(...)` (cli.ts:76) has no catch,
  so an auth failure prints an unhandled-rejection stack trace rather than the clean
  "No structured report" + summary path the rest of the CLI builds.
- **Fix**: Wrap the CLI `await` in try/catch to print a one-line error + exit 1, and note in
  the `ReviewResult` JSDoc that `runReview` rejects on SDK-level failures (vs. returning
  isError for schema/model failures).
- **Decision**: FIXED

### F3 — Live-run manual criteria not independently verifiable from diff

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md Progress 2.3, 2.4, 3.6, 3.7
- **Detail**: Four manual criteria are checked complete but assert live, token-spending
  behavior (populated valid report; graceful `error_max_structured_output_retries`;
  severity-grouped render; `--json` JSON shape) that leaves no diff evidence. Not flagging as
  rubber-stamping — the code clearly supports all four (defensive parse, SEVERITY_ORDER render,
  `JSON.stringify(result.report ?? null)`), and the offline checks were re-run green. Just
  noting no live run was executed to confirm them during this review.
- **Fix**: None needed — acknowledge the live paths rest on the author's recorded runs, not
  this review.
- **Decision**: ACCEPTED — live paths rest on the author's recorded runs, not this review.
