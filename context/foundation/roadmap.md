---
project: "Nuteczki"
version: 3
status: draft
created: 2026-05-27
updated: 2026-06-09
prd_version: 1
main_goal: market-feedback
top_blocker: skills
---

# Roadmap: Nuteczki

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Children learning music lack a simple, focused tool for practising note reading. Parents hand-draw notes on paper — slow to prepare and not engaging. Nuteczki is a dead-simple flashcard-style drill tool with immediate visual feedback, covering two exercise types (note-to-letter and letter-to-note) and nothing more. The product wedge — the one trait that, if removed, makes the product indistinguishable from generic flashcards — is that exercises are adaptively weighted toward the child's recent mistakes, so each drill targets the weakest spots rather than repeating what the child already knows.

## North star

**S-01: Dziecko rozwiazuje cwiczenia nuta-do-litery** — the north star is the smallest end-to-end slice whose successful delivery proves the core product hypothesis; here it proves the drill loop works (child sees note, picks letter, gets feedback, session finishes with stats). Placed first because getting a working drill in front of the child is the fastest path to market-feedback, and everything else layers on top.

## At a glance

| ID   | Change ID                  | Outcome (user can ...)                                                             | Prerequisites | PRD refs                                       | Status   |
| ---- | -------------------------- | ---------------------------------------------------------------------------------- | ------------- | ---------------------------------------------- | -------- |
| F-01 | session-data-schema        | (foundation) Supabase tables for sessions, answers, and exercise history           | —             | FR-001, FR-003, FR-008, FR-009                 | done     |
| F-02 | staff-renderer             | (foundation) Reusable music staff component renders notes with correct positioning | —             | FR-004, FR-005                                 | done     |
| F-03 | pwa-setup                  | (foundation) PWA manifest, service worker, and app icons; installable on home screen | —           | NFR (PWA on iPhone/iPad)                       | ready    |
| S-01 | basic-drill-note-to-letter | Start a drill, see note-to-letter exercises, get feedback, see session stats       | F-01, F-02    | US-01, FR-002, FR-004, FR-006, FR-007, FR-008  | done     |
| S-02 | letter-to-note-exercise    | See letter-to-note exercises in drill sessions alongside note-to-letter            | S-01          | US-01, FR-005                                  | done     |
| S-03 | adaptive-selection         | Exercises weighted toward recently missed notes instead of random                  | S-01          | US-01, FR-003                                  | proposed |
| S-04 | session-history            | See all past sessions with date, correct/incorrect by type, progress indicator     | S-01          | US-02, FR-009                                  | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                  | Chain                                         | Note                                                                       |
| ------ | ---------------------- | --------------------------------------------- | -------------------------------------------------------------------------- |
| A      | Data, drill, enrich    | `F-01` -> `S-01` -> `S-02` / `S-03` / `S-04` | Core chain; S-01 is the north star. S-02, S-03, S-04 parallel after S-01.  |
| B      | Notation rendering     | `F-02`                                        | Joins Stream A at `S-01`. De-risks the top blocker (skills) early.         |
| C      | Installability         | `F-03`                                        | Standalone. Enables PWA testing on real devices; parallel with everything.  |

## Baseline

What's already in place in the codebase as of 2026-05-27 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6.3.1 + React 19.2.6 + Radix UI primitives + TailwindCSS 4.2.4, file-based routing via `src/pages/`, build config in `astro.config.mjs`. No PWA manifest or service worker.
- **Backend / API:** partial — Auth API routes (`src/pages/api/auth/signin.ts`, `signup.ts`, `signout.ts`) + middleware protecting `/dashboard`; no domain-specific API routes yet
- **Data:** partial — `@supabase/supabase-js` configured (`src/lib/supabase.ts`), Supabase local config in `supabase/`; no schema, migrations, or tables defined
- **Auth:** present — Supabase auth integration, session verification in `src/middleware.ts`, login/signup UI in `src/components/auth/`. Covers FR-001 fully.
- **Deploy / infra:** present — Cloudflare Workers (`wrangler.jsonc`), CI/CD (`.github/workflows/ci.yml`) with lint + build + deploy on push to main
- **Observability:** absent — no logging, error tracking, or metrics. PRD does not gate launch on observability.

## Foundations

### F-01: Schemat danych sesji i odpowiedzi

- **Outcome:** (foundation) Supabase tables for drill sessions, individual answers, and per-note error history are defined and migrated; the adaptive algorithm and session stats have a persistence layer to read from and write to.
- **Change ID:** session-data-schema
- **PRD refs:** FR-001, FR-003, FR-008, FR-009
- **Unlocks:** S-01 (drill session needs to persist answers and read exercise history), S-04 (session history reads persisted session records)
- **Prerequisites:** —
- **Parallel with:** F-02, F-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced first because every vertical slice reads/writes this schema. The schema must support both the simple query pattern (session stats for S-01) and the adaptive algorithm's query pattern (recent error counts per note per exercise type for S-03) — designing for both up front avoids re-migrating later.
- **Status:** done

### F-02: Komponent pieciolinii z renderowaniem nut

- **Outcome:** (foundation) A reusable React component renders a five-line music staff with a single note positioned correctly by pitch; the guardrail "musical accuracy is non-negotiable" is satisfied at the component level before any exercise type consumes it.
- **Change ID:** staff-renderer
- **PRD refs:** FR-004, FR-005
- **Unlocks:** S-01 (note-to-letter exercise displays a note on the staff), S-02 (letter-to-note exercise displays note options on the staff)
- **Prerequisites:** —
- **Parallel with:** F-01, F-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is the identified top blocker (skills). Notation rendering is specialized UI work — the note positions on the staff must be musically correct for the beginner range (first lower to first upper ledger line). Sequenced in parallel with F-01 so the riskiest skill gap surfaces as early as possible.
- **Status:** done

### F-03: PWA — manifest, service worker, ikony

- **Outcome:** (foundation) The app is installable on iPhone and iPad home screens via Safari; a PWA manifest, service worker with basic caching, and app icons are configured.
- **Change ID:** pwa-setup
- **PRD refs:** NFR (PWA on iPhone/iPad via Safari)
- **Unlocks:** verification path — all slices can be tested as an installed PWA on real iPhone/iPad devices, matching the NFR's target environment
- **Prerequisites:** —
- **Parallel with:** F-01, F-02, S-01, S-02, S-03, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low technical risk — well-documented Astro PWA patterns exist. Not a prerequisite for any slice (the app works in the browser without it), but installing early means every slice is tested in the real delivery form factor. Can be done at any point without blocking the critical path.
- **Status:** ready

## Slices

### S-01: Dziecko rozwiazuje cwiczenia nuta-do-litery

- **Outcome:** user can start a drill session by choosing a preset exercise count, see note-to-letter exercises (note displayed on staff, child picks the correct letter name from 7 answer buttons) with random selection, get immediate visual feedback after each answer, and see session stats (correct/incorrect count) when the session auto-finishes
- **Change ID:** basic-drill-note-to-letter
- **PRD refs:** US-01, FR-002, FR-004, FR-006, FR-007, FR-008
- **Prerequisites:** F-01, F-02
- **Parallel with:** F-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is the north star and the first real end-to-end feature. It wires together the data schema (F-01), the staff renderer (F-02), session lifecycle, one exercise type UI, and feedback flow. Narrower than a full US-01 slice (one exercise type, random selection), which keeps it tractable for one `/10x-plan` invocation while still delivering a working drill the child can use.
- **Status:** done

### S-02: Cwiczenia litera-do-nuty

- **Outcome:** user can see letter-to-note exercises in drill sessions — a letter name is shown, and the child picks the correct note on the staff from 3 visual options — mixed alongside note-to-letter exercises
- **Change ID:** letter-to-note-exercise
- **PRD refs:** US-01, FR-005
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low — the staff renderer (F-02) and drill session infrastructure (S-01) are already in place. The main new work is the exercise UI variant (show letter, display 3 note options on staff) and wiring it into the session's exercise pool.
- **Status:** done

### S-03: Adaptacyjny dobor cwiczen

- **Outcome:** user experiences exercises weighted toward recently missed notes (approximately 70% weak spots, 30% random) instead of purely random selection, so each drill targets the child's weakest spots
- **Change ID:** adaptive-selection
- **PRD refs:** US-01, FR-003
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The algorithm consumes answer history from the last 3-5 sessions. If the data schema (F-01) does not support efficient per-note error queries, this slice will need a migration. Sequenced after S-01 so there is real answer data to test against.
- **Status:** proposed

### S-04: Rodzic przeglada historie sesji

- **Outcome:** user can navigate to session history and see all past sessions listed in reverse chronological order, with date, correct/incorrect counts per exercise type, and a simple progress indicator (accuracy percentage per session)
- **Change ID:** session-history
- **PRD refs:** US-02, FR-009
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low technical risk — standard list UI over persisted data. Depends on S-01 because the user story's precondition is "a parent who has completed at least one session." Parallel with S-02 and S-03 because it is independent work.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                  | Suggested issue title                            | Ready for `/10x-plan` | Notes                                        |
| ---------- | -------------------------- | ------------------------------------------------ | --------------------- | -------------------------------------------- |
| F-01       | session-data-schema        | Define Supabase schema for sessions and answers  | yes                   | Run `/10x-plan session-data-schema`          |
| F-02       | staff-renderer             | Build reusable music staff rendering component   | yes                   | Run `/10x-plan staff-renderer` — top blocker |
| F-03       | pwa-setup                  | Configure PWA manifest, service worker, and icons | yes                  | Run `/10x-plan pwa-setup` — low priority     |
| S-01       | basic-drill-note-to-letter | Implement basic drill with note-to-letter exercises | no                 | Blocked on F-01 + F-02                       |
| S-02       | letter-to-note-exercise    | Add letter-to-note exercise type to drill sessions | no                 | Blocked on S-01                              |
| S-03       | adaptive-selection         | Implement adaptive exercise weighting algorithm  | no                    | Blocked on S-01                              |
| S-04       | session-history            | Implement session history view                   | no                    | Blocked on S-01                              |

## Open Roadmap Questions

None. PRD has 0 open questions and no cross-cutting unknowns surfaced during framing.

## Parked

- **Note duration exercises** — Why parked: PRD Non-Goals — scoped out of v1 to keep MVP focused on pitch recognition. Adding in v2.
- **Multi-note display (chords, intervals)** — Why parked: PRD Non-Goals — only single notes on the staff at a time.
- **Notes outside ledger-line range** — Why parked: PRD Non-Goals — beginner scope only (first lower to first upper ledger line).
- **Native mobile app** — Why parked: PRD Non-Goals — PWA only for MVP.

## Done

- **S-01: user can start a drill session by choosing a preset exercise count, see note-to-letter exercises (note displayed on staff, child picks the correct letter name from 7 answer buttons) with random selection, get immediate visual feedback after each answer, and see session stats (correct/incorrect count) when the session auto-finishes** — Archived 2026-06-09 → `context/archive/2026-06-08-basic-drill-note-to-letter/`. Lesson: —.
- **F-01: (foundation) Supabase tables for drill sessions, individual answers, and per-note error history are defined and migrated; the adaptive algorithm and session stats have a persistence layer to read from and write to.** — Archived 2026-06-09 → `context/archive/2026-05-28-session-data-schema/`. Lesson: —.
- **F-02: (foundation) A reusable React component renders a five-line music staff with a single note positioned correctly by pitch; the guardrail "musical accuracy is non-negotiable" is satisfied at the component level before any exercise type consumes it.** — Archived 2026-06-09 → `context/archive/2026-06-08-staff-renderer/`. Lesson: —.
- **S-02: user can see letter-to-note exercises in drill sessions — a letter name is shown, and the child picks the correct note on the staff from 3 visual options — mixed alongside note-to-letter exercises** — Archived 2026-06-09 → `context/archive/2026-06-09-letter-to-note-exercise/`. Lesson: —.
