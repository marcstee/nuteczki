# Modular Code-Review Agent (Claude Agent SDK) — Plan Brief

> Full plan: `context/changes/tool-loop-agent/plan.md`

## What & Why

Turn `packages/code-reviewer/`'s single-file `runReview()` wrapper into a
well-organized, modular code-review agent on the Claude Agent SDK. The agent
moves from returning free-text prose to returning a **validated, structured
`ReviewReport`** (severity-tagged findings, summary, 0–100 score) via the SDK's
native `outputFormat` path — with schemas, prompts, and the agent core each in
their own module — so the reviewer becomes a reusable building block a future
promptfoo eval can import and drive. (No eval environment is configured here.)

## Starting Point

`packages/code-reviewer/` is a fully standalone package (own `package.json`/
`tsconfig`/`node_modules`, not a root workspace; unimported by the Astro app).
Today `src/reviewer.ts` holds everything: `runReview()` builds `Options`, runs
`query()`, and concatenates assistant text into a free-text `review` string. The
tool allow-list (`Read/Glob/Grep`) and the senior-reviewer prompt are inline
constants. `index.ts` is a thin barrel; `cli.ts` streams prose to stdout;
`smoke.ts` does an offline wiring check.

## Desired End State

`@nuteczki/code-reviewer` exports the reusable `runReview()` agent, the Zod review
schemas + derived JSON Schema, the inferred types, `REVIEW_TOOLS`, and SDK type
re-exports. A real run returns a `ReviewResult` whose `report` is a schema-valid
`ReviewReport` (with `review` text retained alongside). The CLI renders findings
grouped by severity and supports `--json`. Typecheck, build, and an extended
offline smoke check all pass; the package's name/docs are internally consistent.

## Key Decisions Made

| Decision                  | Choice                                              | Why (1 sentence)                                                              | Source |
| ------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- | ------ |
| Output mode               | Structured primary, text retained                   | Evaluable JSON for promptfoo while keeping human-readable prose for the CLI.  | Plan   |
| Report schema shape       | Severity high/medium/low + numeric score 0–100      | Score gives evals a simple numeric assertion; familiar tooling vocabulary.    | Plan   |
| Schema/validation         | Zod v4 single source of truth (`z.toJSONSchema`)     | One definition yields JSON Schema, runtime `safeParse`, and TS types.         | Plan   |
| Eval export surface       | Building blocks only (no provider/config)            | Faithful to "don't configure evals env"; future provider is a ~5-line import. | Plan   |
| Module layout             | Topic folders (`schemas/`, `prompts/`, `agent/`)     | Clear seams and room to grow; matches "separate modules" intent.              | Plan   |
| CLI rendering             | Human render grouped by severity + `--json` flag     | Keeps terminal readability and machine-pipeability.                           | Plan   |
| Housekeeping              | Clean up name/docs/cruft in-flight                   | Leaves the package coherent for low effort while already editing it.          | Plan   |

## Scope

**In scope:** modular split (schemas/prompts/agent); structured `outputFormat` +
`structured_output` parsing with Zod validation; updated prompt (high/medium/low);
public-surface exports for future evals; CLI structured render + `--json`; extended
offline smoke; add `zod` as a direct dep; name/docs/cruft cleanup.

**Out of scope:** any promptfoo install/config/provider; multi-agent/MCP/hooks/
custom tools; auth changes; folder rename; severity-based CI exit codes; a unit-test
framework; any change to the root app.

## Architecture / Approach

Bottom-up, leaf-first: `schemas/` + `prompts/` (pure, no SDK) → `agent/`
(`tools.ts`, `types.ts`, `reviewer.ts` wiring `outputFormat` and parsing
`structured_output`) → `index.ts`/`cli.ts`/`smoke.ts` (consumers) → housekeeping.
The Zod `reviewReportSchema` is the single source of truth: `z.toJSONSchema()`
(definitions inlined, no `$ref`/`$defs`) feeds `outputFormat.schema`;
`schema.safeParse()` validates `result.structured_output`; `z.infer` gives the type.

## Phases at a Glance

| Phase                          | What it delivers                                              | Key risk                                                        |
| ------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------- |
| 1. Schemas + prompts           | `schemas/` + `prompts/` modules; `zod` direct dep            | JSON Schema emitting `$ref`/`$defs` (breaks structured output) |
| 2. Agent module                | `agent/` core: `outputFormat` wired, `structured_output` parsed | Over-constrained schema → `error_max_structured_output_retries` |
| 3. Surface, CLI, smoke         | Public exports; CLI severity render + `--json`; schema smoke | CLI/exit semantics regressions; prose sparser under structured |
| 4. Housekeeping                | Name/docs aligned to `code-reviewer`; cruft removed           | Missed stale `code-reviewer` reference                          |

**Prerequisites:** `npm install --prefix packages/code-reviewer` works; auth
available for live runs (local `claude login` or `ANTHROPIC_API_KEY`) — offline
smoke needs neither.
**Estimated effort:** ~1–2 sessions across 4 small phases.

## Open Risks & Assumptions

- The Anthropic structured-output path rejects `$ref`/`$defs`-heavy schemas;
  mitigated by inlining definitions and keeping `line`/`fix` optional.
- Assumes no external consumer imports `@nuteczki/code-reviewer` (verified by grep).
- With `outputFormat` set, streamed assistant prose may be sparse; the CLI's
  primary output is the rendered `report`, not the stream.

## Success Criteria (Summary)

- A live `npm run review` returns a populated, schema-valid `ReviewReport`; the CLI
  renders it by severity and `--json` emits parseable JSON.
- `npm run typecheck`, `npm run build`, and the extended offline `npm run smoke`
  all pass; the public entry exports the agent + schemas + types as reusable
  building blocks.
- The package name and README are consistent with the `code-reviewer` folder and
  the new module layout; the stray nested lockfile is gone.
