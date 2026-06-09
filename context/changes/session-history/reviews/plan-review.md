<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Session History View

- **Plan**: context/changes/session-history/plan.md
- **Mode**: Deep
- **Date**: 2026-06-09
- **Verdict**: SOUND (after fixes; was REVISE — F1, F2, F3 all fixed in plan)
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

8/8 paths ✓ (history.astro + src/components/history/ correctly absent; drill.astro, dashboard.astro, middleware.ts, exercises.ts, DrillSession.tsx, SessionResults.tsx, migration, Layout.astro all present). Symbols ✓ — `summarize()` signature `(readonly { isCorrect: boolean }[]) => { correct, incorrect, total, accuracyPct }` (exercises.ts:131); `PROTECTED_ROUTES = ["/dashboard", "/drill"]` (middleware.ts:4); `createClient(requestHeaders, cookies)` (lib/supabase.ts:6); `EXERCISE_TYPE_NOTE_TO_LETTER`/`EXERCISE_TYPE_LETTER_TO_NOTE` (exercises.ts:27,34); FK `answers.session_id → sessions(id)` + RLS `*_select_own` (migration:14,28,41); `bg-cosmic` @utility (global.css:113); per-type aggregation precedent `summarize(answers.filter(byType))` (DrillSession.tsx:187–191); `npm run lint`/`npm run build` + `@astrojs/check` present. brief↔plan ✓ (phases, decisions, scope match). Progress↔Phase ✓ (2 phases, all Success Criteria bullets mapped to `- [ ] N.M` items, no stray checkboxes in phase bodies). astro.config.mjs `output: "server"` confirmed (per-request SSR).

## Findings

### F1 — Query error renders the "no sessions" empty state

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §3 — fetch ("on a null client or query error, treat as no sessions / render the empty state")
- **Detail**: The plan collapses three conditions into one render: (a) unconfigured client, (b) query error, (c) genuinely zero rows. For drill.astro this collapse is benign — its fallback (uniform weights) is still a correct drill. Here it is not: during a transient Supabase outage a returning parent who HAS history is shown the first-run empty state telling them to "Start practising," as if their child's sessions never existed. The empty-state CTA actively misrepresents state. The frontmatter already has the `{data, error}` split (drill.astro:31) — the information to distinguish error from empty is in hand and is being deliberately discarded.
- **Fix**: Reserve the empty state for a *successful* query returning zero rows. On a query error (or null client), render a neutral "Couldn't load your sessions right now" glass card *without* the "Start practising" CTA.
  - Strength: Returning parents are never told they have no history; the CTA stays truthful (first-run only). One extra branch, no new query, no console call.
  - Tradeoff: One additional render branch + copy string.
  - Confidence: HIGH — error vs. empty is already separable in the frontmatter; the plan just merges them.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix in plan — Phase 1 §3 fetch contract now distinguishes error/null-client from confirmed-empty; added Error-state render bullet, manual verification, and Progress 1.9)

### F2 — Server-rendered date/time is UTC, not the parent's local time

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §3 — "a clean English date … with time … via Intl/toLocaleString, computed in the frontmatter"
- **Detail**: astro.config.mjs has `output: "server"` — the frontmatter runs per request on a Cloudflare Worker, whose system timezone is UTC. With zero client JS (a hard design constraint of this slice), there is no access to the visitor's timezone, so `toLocaleString()` formats in UTC. For a Europe/Warsaw parent (UTC+1/+2) the displayed *time* is always off by the offset, and a session started near local midnight shows the wrong *day* — on a "when did my child practise" view that is a visible correctness bug. The repo has no existing date-format precedent (grep: zero `toLocaleString`/`Intl` usages), so there's no pattern to inherit the right answer from.
- **Fix A ⭐ Recommended**: Drop the time-of-day; format date-only with an explicit fixed timeZone via `Intl.DateTimeFormat(locale, { timeZone: "Europe/Warsaw", dateStyle: "medium" })`.
  - Strength: Stable, predictable date for the single-locale MVP audience; removes the most visible error (wrong clock) without client JS.
  - Tradeoff: Hardcodes a tz; near-midnight sessions can still shift by the offset; wrong if the audience goes multi-tz.
  - Confidence: MED — Intl honors an explicit timeZone in the Workers runtime; assumes one known locale (consistent with the English-now / Polish-later note).
  - Blind spot: Exact product timezone unconfirmed — pick with user.
- **Fix B**: Keep date+time but format client-side (a `<time>` element hydrated to the visitor's local tz).
  - Strength: Always-correct local time; no hardcoded tz.
  - Tradeoff: Ships client JS — directly violates this slice's "zero client JavaScript" success criterion and the no-island scope decision, for a cosmetic gain.
  - Confidence: HIGH it works, but it breaks a stated constraint.
  - Blind spot: Re-litigates the static-page architecture decision.
- **Decision**: FIXED (Fix A — List bullet now formats date-only via Intl.DateTimeFormat with explicit timeZone "Europe/Warsaw"; time-of-day dropped, multi-tz revisit noted)

### F3 — `accuracyPct` contract wording is ambiguous about its input set

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §2 — SessionSummary contract
- **Detail**: "accuracyPct and each byType entry come from summarize() over the row's answers, filtered by exercise_type" bundles the overall and per-type computations into one sentence. Read literally it suggests accuracyPct is derived from a single filtered subset. The intended (and correct) behavior, per the precedent the plan cites, is: `accuracyPct = summarize(allAnswers).accuracyPct` (DrillSession.tsx:191, unfiltered) while `byType.{noteToLetter,letterToNote} = summarize(answers.filter(byType))` (DrillSession.tsx:187–188).
- **Fix**: Split the contract sentence so accuracyPct is explicitly the unfiltered whole-session summary and byType entries are the per-type filtered summaries.
- **Decision**: FIXED (Fix in plan — §2 contract now splits accuracyPct = summarize(allAnswers) unfiltered from byType = summarize(answers.filter(byType)))
