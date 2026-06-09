<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Basic Drill — Note-to-Letter

- **Plan**: context/changes/basic-drill-note-to-letter/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-06-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS (3 observations) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated checks re-run during review: `npx astro check` → 0 errors; `npm run lint` → exit 0 (react-compiler clean); `npm run build` → Complete. All 17 Progress checkboxes are `[x]` and the manual items are well-evidenced in the diff.

## Notes (what passed strongly)

- All 9 planned source files exist and match their contracts; no unplanned source files; every "What We're NOT Doing" boundary holds.
- Idempotent save is correct end-to-end: client-generated UUIDs minted in the event handler (not render — react-compiler clean), reused on retry, server upserts with `ignoreDuplicates`. `user_id` comes from `getUser()`, never the client.
- Scoring and the green highlight share one function (`pitchToLetter`), so `B4`→`H` is a single source of truth and the verdict can never disagree with the highlight.
- Answer count is provably exact (loop finishes when `answers.length === exerciseCount`; server re-checks length), so the `400` length guard never trips on legitimate payloads.
- The one pattern divergence (JSON `401` vs the auth routes' redirect) is explicitly justified in the plan — correct for a `fetch()`.

## Findings

### F1 — started_at trusted from client, no date-format check

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/sessions.ts:56-57, 107
- **Detail**: `parseBody` only checks `started_at` is a non-empty string, then writes it straight into the timestamptz column. A non-empty-but-not-a-date value (tamper or bug) slips past the 400 path and hits Postgres, surfacing as a 500 instead of a clean 400. The client always sends `new Date().toISOString()`, so the happy path is fine — this is a robustness gap, consistent with the plan's "trust the client" decision (which never listed `started_at` format validation).
- **Fix**: Add a cheap guard in `parseBody` — reject when `Number.isNaN(Date.parse(started_at))` — so bad input returns 400.
- **Decision**: FIXED (Date.parse guard added at sessions.ts:58)

### F2 — crypto.randomUUID() requires a secure context

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/components/drill/DrillSession.tsx:86-87
- **Detail**: `crypto.randomUUID` is only defined in a secure context. Production (Cloudflare HTTPS) and localhost dev both qualify, so the shipped paths are safe. But loading the drill over plain HTTP on a LAN IP (e.g. testing on a physical phone via `http://192.168.x.x:4321`) makes it undefined, and `handleNext` throws when finishing the session — silently breaking completion + save. The phone-width manual check (2.9) passes via localhost responsive mode, so this never surfaced.
- **Fix**: Either accept (HTTPS-only deployment) or add a tiny v4 fallback in `DrillSession` for non-secure-context dev testing.
- **Decision**: ACCEPTED — deployment is HTTPS-only (Cloudflare) and dev is localhost; both are secure contexts. Plain-HTTP LAN testing is out of scope.

### F3 — save error swallowed with no diagnostic

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Observability)
- **Location**: src/components/drill/DrillSession.tsx:58-60
- **Detail**: `persist()`'s catch sets `saveState` to `'error'` and discards the error entirely. The user gets a good non-blocking "Retry save" affordance, but a developer debugging a persistent save failure (RLS reject, 503, network) gets zero signal — and `saveSession`'s status-bearing message is thrown away. `no-console` is only a warning here, so this is a deliberate-looking quiet failure, just hard to diagnose.
- **Fix**: Keep the UX, but capture the error (e.g. `console.error` in the catch, or store a `lastError` string in state) for diagnosis.
- **Decision**: FIXED (console.error added in persist() catch at DrillSession.tsx:58-61)
