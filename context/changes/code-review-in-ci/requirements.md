# Requirements — Code Review in CI

> Input to `/10x-plan`. Describes WHAT the change must do, not HOW.

## Goal

Run an AI code review automatically on every pull request to `main` and surface
its verdict back on the PR (comment + labels), so a solo developer shipping
after-hours gets a second pair of eyes without a human reviewer in the loop.

## Concept

- A GitHub Actions workflow runs on every pull request targeting the `main`
  branch (`on: pull_request`, `branches: [main]`).
- The review logic lives in a **composite action** (under `.github/actions/`),
  so the workflow file stays small and the review step is easy to read, reuse,
  and test in isolation from the CI plumbing.
- The review is **advisory by default**: it posts feedback and labels but does
  not, in the first cut, hard-block merge. Whether a `changes-requested` verdict
  becomes a required status check is an open decision (see *Open questions*).
- Runs alongside the existing `ci` and `e2e` jobs in
  `.github/workflows/ci.yml`; it must not gate `deploy` unless we explicitly
  decide to make it blocking.

## Input parameters

- PR title and description (intent: what the author says the change does).
- The PR `git diff` (`base...head`).
- The list of changed file paths (lets the reviewer prioritise risk surfaces —
  `src/pages/api/`, `src/components/drill/`, `src/components/staff/`).
- Read-only access to the rest of the repo tree for context. The
  `packages/code-reviewer` agent runs with a read-only `Read`/`Glob`/`Grep`
  allow-list, so it can pull in surrounding code and the project's conventions
  (`CLAUDE.md`, `context/foundation/lessons.md`) rather than judging the diff in
  a vacuum. Decision needed: pass `loadProjectSettings: true` so the review
  respects repo conventions, vs. keep runs self-contained.

## Code Review Criteria

The reviewer scores the change on the six criteria below. **Each criterion is
scored on a 1–10 integer scale**, where **1 is the worst possible** and **10 is
the best possible**; the anchors below define both ends so scores are
repeatable. Criteria are weighted toward this project's hard rules
(`CLAUDE.md`), its top risks (`context/foundation/test-plan.md` §2), and its
recorded lessons (`context/foundation/lessons.md`).

Every score below 8 should be backed by at least one concrete finding (file +
why), so a score is never an unexplained number.

### C1 — Correctness & Logic

Does the change do what the PR claims, without breaking existing behaviour or
domain invariants?

- **1:** Logically broken or regressive — wrong output, an off-by-one in domain
  logic (e.g. a note renders one staff line/space off, teaching the wrong
  pitch), an exercise whose correct answer is missing from the options, or
  behaviour that contradicts the PR description.
- **10:** Logic provably matches stated intent; domain invariants hold (every
  generated exercise is winnable and musically correct, summary counts reconcile
  to the answer sequence); no regressions; edge cases are reasoned through.

### C2 — Security & Data Integrity

Does the change keep secrets out, enforce authorization, and refuse to lose data
silently?

- **1:** Commits a secret (`.env` / `.dev.vars`, `SUPABASE_*` values), opens an
  authorization hole (checks "logged in" but not "owns this row" — cross-family
  IDOR on the sessions endpoint), exposes a server-only secret to the client, or
  introduces a silent data-loss path (treats an HTTP 200 / no thrown error as
  proof of persistence — the Q2 production burn).
- **10:** No secrets in the diff; server-only secrets stay server-side;
  row-level ownership is enforced server-side on every read/delete; writes fail
  loud, never silently; new protected routes are registered in
  `src/middleware.ts` `PROTECTED_ROUTES`.

### C3 — Project Conventions & Architecture Fit

Does the change follow the repo's hard rules and idioms?

- **1:** Violates a hard rule — `set:html` in an Astro component, a bypassed
  `react-compiler` rule, a leftover `console.log`, deep relative imports instead
  of the `@/*` alias, React used for static content that should be Astro, a
  shadcn/ui primitive placed outside `src/components/ui/`, or a Tailwind v4
  font-size token without the required `text-[length:var(--token)]` hint.
- **10:** Fully idiomatic — Astro for static / React only for interactive
  islands, `@/*` imports, shadcn primitives in `ui/`, Tailwind v4 conventions
  honoured, lint + typecheck clean, and naming/comment density matching the
  surrounding code.

### C4 — Test Coverage & Discipline

Are the touched risk surfaces tested, at the right layer, without the
anti-patterns this project has explicitly banned?

- **1:** Touches a risk surface (exercise generation, persistence, summary,
  auth/ownership, adaptive selection) with no test — **or** adds tests that mock
  the Supabase schema, mirror the implementation, or compute the expected value
  with the same code under test (tautology / oracle violation).
- **10:** New or changed risk surfaces are covered at the cheapest layer that
  gives a real signal; integration tests hit the **real local schema** (no
  schema mock); oracle values come from an independent source; e2e follows the
  locator rules and never uses `waitForTimeout`; tests are independent and clean
  up after themselves.

### C5 — Readability & Maintainability

Could the next contributor (or agent) understand and safely change this code?

- **1:** Unclear naming, dead code, copy-paste duplication, magic values, and no
  rationale for non-obvious choices — a future maintainer would be lost.
- **10:** Self-documenting names, single-responsibility units, comments only
  where the *why* is non-obvious, consistent with existing patterns; the diff
  reads like the surrounding code.

### C6 — Error Handling & Resilience

Are failure paths and edge cases handled rather than assumed away?

- **1:** Unhandled promise rejections, swallowed errors, happy-path-only logic;
  failure modes (failed insert, offline/PWA, stale token, empty/boundary input)
  are ignored or fail silently.
- **10:** Failure paths are handled and surfaced to the user/caller; async
  errors are caught; empty/boundary/edge inputs are handled; any degradation is
  explicit, not silent.

### Verdict → status mapping

The per-criterion scores and findings roll up into one PR verdict, which drives
the label (see *Expected side-effects*):

| Verdict | Condition | Label |
| --- | --- | --- |
| **pass** | No high or medium findings, and every criterion ≥ 8 | `review/pass` |
| **comment** | Only low/medium findings, or any criterion in 5–7 | `review/comment` |
| **changes-requested** | Any high-severity finding, or C1/C2/C4 < 5 | `review/changes-requested` |
| **error** | The review job itself failed to produce a valid report | `review/error` |

> Note: `C1/C2/C4 < 5` makes correctness, security/data-integrity, and
> test-discipline the load-bearing gates — they reflect this project's top
> documented risks. Tune the exact thresholds during planning.

## Expected side-effects

- **PR comment with the review summary** — the prose `summary`, the six
  criterion scores, and the findings grouped by severity (high → medium → low),
  each with file (and line, when it applies) and a suggested fix where one
  exists. The comment must be **idempotent**: update the existing review comment
  on re-run rather than appending a new one each time (e.g. an HTML-marker
  anchor the action greps for).
- **Status label per verdict** — exactly one of `review/pass`,
  `review/comment`, `review/changes-requested`, `review/error` on the PR;
  applying the new one removes the previously-applied review label so a PR
  never carries two verdicts at once.
- **Retry option based on a label** — adding a `review/retry` label re-triggers
  the review on the current head SHA (workflow listens for the `labeled`
  event); the action removes `review/retry` when it starts so the label is a
  one-shot button.

## Constraints

- **Pin every action to a full commit SHA — never a moving tag (HARD RULE).**
  All `uses:` references in this change's workflow and composite action MUST be
  pinned to a full 40-char commit SHA (`uses: owner/action@<sha>`), with a
  trailing `# vX.Y.Z` comment naming the version. A tag like `@v4` is a mutable
  pointer the action's owner can repoint to other code at any time; the action
  runs **inside our pipeline with access to our secrets** (`ANTHROPIC_API_KEY`,
  `GITHUB_TOKEN`, `SUPABASE_*`), so a moved tag is a secret-exfiltration path —
  exactly the `tj-actions/changed-files` supply-chain attack (Mar 2025), where
  version tags were rewritten to point at malicious code. A SHA is
  content-addressed and freezes precisely the code we reviewed. This applies
  with extra force to third-party / marketplace actions we trust least (e.g.
  Claude Code Action). While we are here, the existing unpinned `@v*` actions in
  `.github/workflows/ci.yml` should be pinned too.
- **Automate the SHA bumps (the corollary).** A SHA pin also freezes the
  action's *security patches*, so pair it with Dependabot — add
  `.github/dependabot.yml` with `package-ecosystem: "github-actions"`. Dependabot
  understands SHA pins: it bumps the SHA *and* the version comment in a PR we
  review before merge, so updates flow through a deliberate gate instead of
  arriving silently under a moving tag.
- **Secrets:** the review needs `ANTHROPIC_API_KEY` (or the Claude Code Action's
  auth). Never commit it; read it from GitHub Actions secrets. Follow the repo
  hard rule — secrets are server/CI-only.
- **Permissions:** the workflow needs `pull-requests: write` (comment + labels)
  and `contents: read`. Grant the minimum; do not widen the default token.
- **Fork-PR safety:** secrets are not exposed to workflows triggered by forked
  PRs under the plain `pull_request` event. Decide explicitly how (or whether)
  to review fork PRs — `pull_request_target` carries real injection risk and
  should be avoided or tightly sandboxed. For a solo repo, restricting reviews
  to same-repo branches is acceptable.
- **Cost & latency:** each review is a metered model call. Cap agent turns
  (the package defaults to `maxTurns: 12`), and use `concurrency` to cancel
  superseded runs when a PR is pushed again.
- **Determinism of CI:** the review must never fail the *other* CI jobs. A model
  error surfaces as the `review/error` label, not a red `ci`/`e2e` check.

## Potential tools to use

- **`packages/code-reviewer`** (this repo) — the existing Claude Agent SDK
  reviewer. Already emits a validated structured report and runs read-only.
  - **Schema mismatch to resolve:** it currently returns a single `score`
    **0–100** plus `high/medium/low` findings — not the six **1–10** criteria
    above. Adopting these criteria means either extending
    `packages/code-reviewer/src/schemas/review.ts` (add per-criterion 1–10
    scores) and its system prompt, or having the CI layer derive the verdict
    from the existing findings. Pick one in planning.
  - Pro: full control, testable offline (`npm run smoke`), no marketplace action
    to vet. Con: we own the GitHub plumbing (diff fetch, comment, labels).
- **Claude Code Action** (GitHub marketplace) — likely faster to wire for the
  comment/label plumbing. Con: less control over the structured contract above;
  may duplicate what `packages/code-reviewer` already does well.

> Recommendation to validate in planning: reuse `packages/code-reviewer` for the
> review itself (it already encodes the read-only guarantee and a structured
> contract), and keep the GitHub glue — comment, labels, retry — thin in the
> composite action.

## Out of scope / parked for later

- **Business alignment** — judging whether the change is the *right* thing to
  build (vs. whether it is built well). Parked; the criteria above are
  engineering-quality only.
- Making the review a **required, merge-blocking** status check (start
  advisory; revisit once the verdict proves reliable).
- Reviewing PRs from **forks** (see fork-PR safety constraint).
- Auto-applying suggested fixes (the agent is read-only by design).

## Success criteria (acceptance)

1. Opening or updating a PR to `main` triggers the review workflow.
2. The PR receives an idempotent comment containing the summary, six 1–10
   criterion scores, and severity-grouped findings.
3. Exactly one `review/*` verdict label is present and matches the rolled-up
   verdict.
4. Adding `review/retry` re-runs the review and the label is consumed.
5. A review failure yields `review/error`, and the `ci`/`e2e`/`deploy` jobs are
   unaffected.
6. No secret is present in the workflow or composite-action source; the action
   reads `ANTHROPIC_API_KEY` from GitHub secrets only.

## Open questions (decide in planning)

1. **Tool choice** — `packages/code-reviewer` vs Claude Code Action (lean:
   reuse the package).
2. **Scale reconciliation** — extend the package's schema to the six 1–10
   criteria, or derive the verdict from its existing 0–100 score + findings.
3. **`loadProjectSettings`** — load `CLAUDE.md`/settings into the review for
   convention-awareness, or keep runs self-contained?
4. **Blocking vs advisory** — does `review/changes-requested` ever become a
   required check?
5. **Model** — which model id for CI cost/latency (e.g. a faster model for
   routine PRs)?
