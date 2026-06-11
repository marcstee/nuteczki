---
date: 2026-06-11T21:29:16+0200
researcher: Marcstee
git_commit: d2e77dac4a342810485200221534866fafb57482
branch: main
repository: nuteczki
topic: "Critical-flow e2e (Phase 3 / Risk #7): grounding the drill-completion flow for /10x-e2e"
tags: [research, codebase, drill, e2e, session-lifecycle, persistence, risk-7]
status: complete
last_updated: 2026-06-11
last_updated_by: Marcstee
---

# Research: Critical-flow e2e — drill session start → complete → persist

**Date**: 2026-06-11T21:29:16+0200
**Researcher**: Marcstee
**Git Commit**: d2e77dac4a342810485200221534866fafb57482
**Branch**: main
**Repository**: nuteczki

## Research Question

Ground the context `/10x-e2e` needs to drive **Risk #7 — Broken assembled
session flow**: "every piece passes in isolation, but the wired-together drill
can't actually be _completed_ in the browser: feedback never advances,
auto-finish doesn't fire, or the summary/save is never reached" (test-plan.md
§2). Per the Risk Response table, research must ground **the session lifecycle
entry point, the auto-finish trigger, and how the completed session reaches
persistence** — and stay out of exercise _correctness_ (that is #1/#2/#4).

## Summary

The drill is a **single React island** (`DrillSession.tsx`, `client:load`) with
an explicit three-phase state machine — `setup → active → finished` — and **no
auto-advance timers anywhere**. Every transition is a synchronous, click-driven
state change, which is ideal for a deterministic DOM-snapshot e2e (nothing to
wait out; wait for the _result_ of each click).

Five facts dominate the e2e design:

1. **The drill does not start on page load.** A setup screen ("Ile nutek?")
   gates the session behind a count button (`5` / `10` / `20`).
2. **Advance is an explicit "Dalej" (Next) button that only renders _after_ an
   answer.** No timer. The test must wait for "Dalej" (or the feedback text)
   before clicking it.
3. **Auto-finish fires on the "Dalej" press of the _last_ exercise, not on the
   last answer tap.** `handleNext` gates finish on `answers.length >=
   exerciseCount`. A test that stops after tapping the final answer never
   reaches the summary. **This is the single most likely way the e2e is written
   wrong.**
4. **The save is automatic, fire-and-forget, and decoupled from the summary.**
   The summary ("Koniec sesji!") renders immediately; the `POST /api/sessions`
   resolves in the background and surfaces only as a quiet "Zapisywanie…" →
   "Zapisano" indicator. To assert persistence, wait for "Zapisano" or
   `waitForResponse` on the POST — **never** treat the summary appearing as
   proof of save.
5. **Playwright is already fully configured** with storage-state auth
   (`e2e/auth.setup.ts`, `playwright.config.ts`, `@playwright/test ^1.60.0`).
   `/drill` is a protected route; the existing auth setup makes every test
   signed-in automatically. No new infra is needed — only the spec.

One **locator gap** the e2e author must resolve: the letter-to-note option
buttons have **no accessible name** (they wrap only an SVG `<Staff>`), so they
cannot be targeted by role+name. For a _flow_ test this is fine (click any
option to advance — correctness is out of scope per the anti-pattern), but it is
a genuine accessibility/locator hole worth flagging (see Open Questions).

## Detailed Findings

### A. The assembled flow (state machine)

Entry: `src/pages/drill.astro:51` renders `<DrillSession client:load
weights={weights} />`. The island hydrates on load; `drill.astro:27-46` does the
only server work (builds adaptive `weights` from the `note_error_stats` view,
falling back to `EMPTY_WEIGHTS`) — orchestration-irrelevant for the flow.

Orchestrator: `src/components/drill/DrillSession.tsx:61`. State (lines 62-74):
`phase`, `exerciseCount`, `exercises` (pre-built deck), `currentIndex`,
`answers`, `chosen` (current selection or `null`), `startedAt`, plus
`sessionId` / `answerIds` / `saveState`.

Phase transitions:

- **setup → active**: `handleStart(count)` (`DrillSession.tsx:94-102`) builds the
  ordered deck `buildSession(count, weights)`, resets index/answers/chosen,
  stamps `startedAt`, sets `phase = "active"`. Setup screen at lines 162-182:
  heading **"Ile nutek?"**, three count buttons `5` / `10` / `20` (`COUNTS`,
  line 22).
- **active loop** (lines 207-234): `current = exercises[currentIndex]`; renders
  `NoteToLetterExercise` (type `note_to_letter`) or `LetterToNoteExercise` (type
  `letter_to_note`). Sessions **interleave both types** (balanced split,
  ceil/floor of count) — the e2e loop must branch per card.
- **answer**: `handleAnswerLetter` (104-113) / `handleAnswerPitch` (115-124).
  Each guards `if (chosen !== null …) return` (second tap ignored), appends to
  `answers`, sets `chosen`. `answered = chosen !== null` (line 76).
- **feedback → advance**: option buttons go `disabled={answered}`; a feedback
  line shows **"✓ Brawo!"** or **"✗ To było {letter}"** (note→letter) /
  **"✗ Prawie!"** (letter→note); the **"Dalej"** button renders only inside
  `{answered && (…)}`. `onClick={onNext}` → `handleNext`. **No timer/`setTimeout`
  in the advance path.**
- **active → finished**: see §B.

### B. Auto-finish trigger (the critical timing fact)

`handleNext` (`DrillSession.tsx:126-140`), verified against live code:

```ts
function handleNext() {
  if (answers.length >= exerciseCount) {
    const id = crypto.randomUUID();
    const ids = answers.map(() => crypto.randomUUID());
    setSessionId(id);
    setAnswerIds(ids);
    setPhase("finished");
    void persist(id, ids, startedAt, exerciseCount, answers);   // fire-and-forget
    return;
  }
  setCurrentIndex((i) => i + 1);
  setChosen(null);
}
```

Sequence for the **final** exercise: tap answer → `answers.length` reaches
`exerciseCount` → "Dalej" appears → tap "Dalej" → `handleNext` sees the
threshold met → `phase = "finished"` + background save. The child still sees
feedback and a "Dalej" on the last card. **The last "Dalej" is what advances to
the summary.** (The archive plans describe this loosely as "auto-finishes when
the last exercise is answered" — that wording is imprecise; live code requires
the extra "Dalej" click. Per test-plan §1 principle #3, live code is ground
truth.)

There is no manual "finish" button and no fixed timer — the only async gap in
the whole flow is the background `persist`.

### C. Persistence path & save trigger

- Client call: `src/components/drill/saveSession.ts:12-40` — `POST
  /api/sessions` (line 31), throws on non-OK (37-39). Payload shape: `{ id,
  exercise_count, started_at, answers: [{ id, exercise_type, note, is_correct }] }`.
- Trigger: `persist` (`DrillSession.tsx:78-92`) sets `saveState="saving"`,
  awaits `saveSession`, then `"saved"` / `"error"`. Called from the finish branch
  (`DrillSession.tsx:135`) **after** `setPhase("finished")` — so the summary is
  already on screen when the save runs.
- Handler: `src/pages/api/sessions.ts:78-138`. Auth check returns **401 JSON**
  (not a redirect) on missing user (84-89). Two upserts with **`ignoreDuplicates:
  true`**: `sessions` (104-113) and `answers` (130-132). Success → `{ ok: true }`
  200 (line 137); explicit error → 500.
- **Known structural gap (confirmed in code + lessons.md):** `ignoreDuplicates:
  true` turns a colliding-id write into a silent no-op (200, nothing persisted),
  and the two upserts are not transactional — a `finished_at`-stamped session
  with zero answers is representable. **A 200 from the save path is not proof of
  persistence.** (lessons.md "Risk #3 structural gap"; characterization tests in
  `src/pages/api/sessions.integration.test.ts:145-201`.)
- Read-back: there is **no GET `/api/sessions`**. Persisted sessions are read SSR
  on `src/pages/history.astro:38-64` via an RLS-scoped query filtered on
  `not("finished_at","is",null)` with nested `answers(...)`. An e2e that wants to
  assert persistence can navigate to `/history` after "Zapisano".

### D. Auth guard & how the e2e logs in

- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard", "/drill",
  "/history"]`. Unauthenticated hits redirect to `/auth/signin` (line ~20).
  `/api/sessions` is not in the array but self-guards (401).
- Server auth is cookie-based via `@supabase/ssr` `createServerClient`
  (`src/lib/supabase.ts:6-24`); the sign-in POST handler
  (`src/pages/api/auth/signin.ts`) sets the auth cookies on
  `signInWithPassword`.
- **The e2e already handles this.** `e2e/auth.setup.ts:11-22` fills the sign-in
  form (`getByLabel` + `getByRole`) and saves storage state to
  `playwright/.auth/user.json`; `playwright.config.ts` wires it as a setup
  dependency, so the drill spec starts signed-in. Required env vars: `E2E_EMAIL`,
  `E2E_PASSWORD`.

### E. E2E surface — infra, run, locators

**Infra (already present):**
- `playwright.config.ts` — `testDir: "./e2e"`, `baseURL:
  "http://localhost:4321"`, storage-state auth, `webServer` auto-starts
  `npm run dev` (`reuseExistingServer: true`).
- `@playwright/test ^1.60.0` in `package.json:44`; script `npm run test:e2e`
  (`package.json:16`). Astro `output: "server"` + Cloudflare adapter
  (`astro.config.mjs`).
- **No e2e specs yet** (only `auth.setup.ts`). **No `data-testid` anywhere** in
  `src/` — accessibility-first locators only.

**Locators by flow step** (prefer role+name / label / text):

| Step | Locator | Source |
| --- | --- | --- |
| Navigate | `goto('/drill')` (or dashboard link `getByRole('link', { name: 'Zacznij ćwiczyć' })`) | `dashboard.astro:21-26` |
| Pick count | `getByRole('button', { name: '5' \| '10' \| '20' })` | `DrillSession.tsx:167-178` |
| Progress | `getByText(/Ćwiczenie \d+ z \d+/)` | `NoteToLetterExercise.tsx:34`, `LetterToNoteExercise.tsx:43` |
| **note→letter** answer | `getByRole('button', { name: 'C'\|'D'\|'E'\|'F'\|'G'\|'A'\|'H' })` (note: **`H`**, not `B`) | `NoteToLetterExercise.tsx:47-76` |
| **letter→note** prompt | caption `getByText('Znajdź tę nutkę')` + large prompt letter | `LetterToNoteExercise.tsx:47-50` |
| **letter→note** options | **no accessible name** — buttons wrap only `<Staff>` SVG (see Open Questions) | `LetterToNoteExercise.tsx:74-85` |
| Feedback (correct) | `getByText('✓ Brawo!')` | both exercise files |
| Feedback (wrong) | `getByText(/✗ To było [CDEFGAH]/)` (n→l) / `getByText('✗ Prawie!')` (l→n) | `NoteToLetterExercise.tsx:84`, `LetterToNoteExercise.tsx:95` |
| Advance | `getByRole('button', { name: 'Dalej' })` (only after answer) | both exercise files |
| Summary heading | `getByText('Koniec sesji!')` | `SessionResults.tsx:65` |
| Accuracy | `getByText(/\d+%/)` + `getByText('celność')` | `SessionResults.tsx:67-70` |
| Per-type blocks | `getByText(/NUTA → LITERA/)`, `getByText(/LITERA → NUTA/)`, `getByText('poprawne')`, `getByText('błędne')` | `SessionResults.tsx:72-75` |
| Save status | `getByText('Zapisywanie…')` → `getByText('Zapisano')`; error → `getByRole('button', { name: 'Ponów zapis' })` | `SessionResults.tsx:77-94` |
| Exit | `getByRole('button', { name: 'Jeszcze raz' })` (→ setup) / `getByRole('button', { name: 'Gotowe' })` (→ `/dashboard`) | `SessionResults.tsx:100-108` |

**Branching the loop:** the e2e must detect the current card type each
iteration. Discriminator: presence of the letter buttons (`C`…`H`) / "To było"
feedback = note→letter; presence of `getByText('Znajdź tę nutkę')` / "Prawie!"
feedback = letter→note.

## Code References

- `src/pages/drill.astro:51` — drill page renders the island; `:27-46` builds adaptive weights (SSR).
- `src/components/drill/DrillSession.tsx:61` — session orchestrator (state machine).
- `src/components/drill/DrillSession.tsx:94-102` — `handleStart`: setup → active.
- `src/components/drill/DrillSession.tsx:126-140` — `handleNext`: advance + **auto-finish on `answers.length >= exerciseCount`** + fire-and-forget save.
- `src/components/drill/DrillSession.tsx:78-92` — `persist`: save-state machine.
- `src/components/drill/NoteToLetterExercise.tsx:34,47-94` — progress, 7 letter buttons, feedback, "Dalej".
- `src/components/drill/LetterToNoteExercise.tsx:47-105` — prompt, 3 SVG-only option buttons, feedback, "Dalej".
- `src/components/drill/SessionResults.tsx:55-111` — summary, per-type stats, save indicator, exit buttons.
- `src/components/drill/saveSession.ts:12-40` — `POST /api/sessions` client call + payload.
- `src/pages/api/sessions.ts:78-138` — POST handler; 401 on no-auth; two `ignoreDuplicates` upserts; 200/500.
- `src/pages/history.astro:38-64` — RLS-scoped read-back of finished sessions.
- `src/middleware.ts:4` — `PROTECTED_ROUTES` includes `/drill`.
- `src/lib/supabase.ts:6-24` — cookie-based SSR Supabase client.
- `src/pages/api/auth/signin.ts` — sign-in POST; sets auth cookies.
- `e2e/auth.setup.ts:11-22` — storage-state login (signed-in by default).
- `playwright.config.ts:1-35` — testDir `./e2e`, baseURL `:4321`, auth dependency, webServer.
- `src/pages/api/sessions.integration.test.ts:145-201` — characterization of the ignore-duplicate / non-transactional gap.

## Architecture Insights

- **Pure client-state flow, network only at the boundary.** All advance/score
  logic is synchronous in-memory React state; the single network call is the
  end-of-session batch save. This is why DOM-snapshot e2e (not vision) is the
  right tool — deterministic, no timing flakiness, no animation to wait out
  (test-plan §2 #7: "e2e — one critical flow, DOM-snapshot, via /10x-e2e").
- **Summary is intentionally decoupled from save** so a child never waits on the
  network to see results. The corollary for testing: the summary appearing is
  evidence the _flow_ completed, not that data _persisted_. Risk #7 is the flow;
  Risk #3 (persistence) is already covered by the Phase 2 integration suite — the
  e2e should not re-litigate it beyond, at most, asserting "Zapisano".
- **Accessibility-first locators are viable everywhere except letter→note
  options**, which is the one structural locator gap in the drill UI.

## Risk #7 — what `/10x-e2e` must prove (verification brief)

From test-plan.md §2 Risk Response, Risk #7:

- **Proves protection:** a real session can be **started, advanced through every
  exercise, auto-finished, with the summary rendered** (and, optionally,
  persisted — assert "Zapisano").
- **Must challenge:** "All unit/integration tests pass = a user can finish a
  session." The e2e exists precisely because green unit/integration suites do not
  prove the wired-together flow completes in a browser.
- **Anti-pattern to avoid:** re-testing exercise _correctness_ inside the e2e
  (brittle; that is #1/#2/#4). **Keep it to the flow** — click _any_ valid option
  to advance; do not assert the answer was correct. This also neatly sidesteps
  the letter→note locator gap (no need to identify the _correct_ SVG card).
- **Concrete flow to encode:** `goto('/drill')` → pick `5` → loop 5×: read card
  type → click an answer option for that type → wait for "Dalej" → click "Dalej"
  → on the 5th, the "Dalej" finishes → assert "Koniec sesji!" + accuracy `%` +
  both per-type blocks → (optional) wait for "Zapisano" → click "Gotowe" → assert
  URL `/dashboard`. Use the smallest count (`5`) to keep the test fast and stable.

## Historical Context (from prior changes)

- `context/archive/2026-06-08-basic-drill-note-to-letter/plan.md:5-6,149,207-216`
  — original assembled-flow design: pick count → per-exercise feedback →
  auto-finish at `exercise_count` → batch save on `finished` transition; ids
  generated once on finish, never in render. (Describes auto-finish loosely; live
  `handleNext` requires the final "Dalej" — see §B.)
- `context/archive/2026-06-09-letter-to-note-exercise/plan.md:1-6,22,32` — mixed
  exercise types interleaved in one `buildSession`; per-type results breakdown;
  stored `note` semantics differ per type.
- `context/archive/2026-06-09-session-history/` &
  `2026-06-10-session-history-ux/plan.md:11,46,49` — a session is "completed"
  iff `finished_at` is non-null; FK cascade `answers.session_id` removes answers
  on session delete (used for e2e cleanup).
- `context/changes/testing-session-boundary-regression/` (Phase 2) +
  `context/foundation/lessons.md` — Risk #3/#4 covered at unit+integration; the
  ignore-duplicate / non-transactional save gap is characterized, not fixed. The
  e2e should not duplicate this coverage.
- `context/archive/2026-06-11-testing-bootstrap-exercise-integrity/` (Phase 1) —
  Vitest infra + oracle discipline (covers Risk #1/#2 at unit level; the e2e must
  not re-test correctness).

## Related Research

- `context/changes/testing-session-boundary-regression/research.md` — Phase 2
  persistence-gap analysis (Risk #3/#4).
- `context/foundation/test-plan.md` §2 (Risk #7 row + Response table), §3 (Phase
  3), §6.3 (e2e cookbook — to be filled by this phase).

## Open Questions

1. **Letter→note option buttons have no accessible name** — they wrap only
   `<Staff note={option} />` (SVG), no text, no `aria-label`
   (`LetterToNoteExercise.tsx:74-85`). For the Risk #7 _flow_ test this is
   acceptable (click any option). But it is a real a11y/locator hole. Worth a
   small follow-up: add `aria-label` (e.g. "Nutka 1/2/3" or the rendered pitch)
   so the buttons are addressable by role+name — improving both real
   accessibility and any future correctness-level test. Out of scope for this
   e2e phase; flag for `/10x-plan` to note, not block.
2. **Whether to assert persistence in the e2e.** The flow test proves Risk #7;
   persistence (Risk #3) is Phase 2's job. Recommendation: at most assert the
   "Zapisano" indicator (cheap, in-DOM); do not add a `/history` round-trip or
   DB read to the e2e — that would re-cover Phase 2 and add flakiness. `/10x-plan`
   to decide.
3. **Env wiring for `E2E_EMAIL` / `E2E_PASSWORD`** and a seeded test user in
   local Supabase — referenced by `auth.setup.ts`; confirm these exist / are
   documented before the e2e runs (likely a §3 Phase 5 / CI concern).
