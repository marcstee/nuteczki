# Modular Code-Review Agent (Claude Agent SDK) Implementation Plan

## Overview

Convert `packages/code-reviewer/`'s single-file `runReview()` wrapper into a
well-organized, modular code-review agent built on the Claude Agent SDK. The
agent stops returning only free-text prose and instead returns a **validated,
structured `ReviewReport`** (severity-tagged findings, summary, numeric score)
via the SDK's native structured-output path (`outputFormat: { type: 'json_schema' }`
→ `result.structured_output`), while still retaining any captured assistant
text. Schemas, prompts, and the agent core each move into their own module so
the reviewer is a reusable building block that a future promptfoo eval can import
and drive. This change does **not** configure any eval environment.

## Current State Analysis

The package is **fully standalone** (its own `package.json`, `tsconfig.json`,
`node_modules`; not a root workspace; excluded from the root app's ESLint/tsconfig).
Nothing in the root Astro app imports it (`grep` for `code-reviewer`/`code-reviewer`
under `src/` returns nothing).

Current source layout (`packages/code-reviewer/src/`):

- `reviewer.ts` — the real logic. `runReview(opts)` builds an `Options` object,
  runs `query({ prompt, options })`, and concatenates assistant `text` blocks
  into a free-text `review` string. Holds two inline constants: `REVIEW_TOOLS =
  ["Read","Glob","Grep"]` (read-only allow-list) and `REVIEWER_INSTRUCTIONS`
  (a senior-reviewer system-prompt append that already asks for findings grouped
  by severity with file/line/what/why/fix). System prompt is
  `{ type: "preset", preset: "claude_code", append: REVIEWER_INSTRUCTIONS }`.
- `index.ts` — thin barrel: re-exports `runReview`, `REVIEW_TOOLS`,
  `ReviewOptions`, `ReviewResult`, and three SDK types.
- `cli.ts` — `node:util` `parseArgs` CLI; streams the review to stdout via
  `onText`, writes a one-line summary (outcome · turns · cost · session) to
  stderr, exits non-zero on `isError`.
- `smoke.ts` — offline wiring check (no network/tokens): asserts `query` and
  `runReview` are functions, prints the tool list and which auth path is present.

### Key Discoveries:

- **SDK structured output is first-class** (`@anthropic-ai/claude-agent-sdk@0.3.177`,
  verified in `node_modules/.../sdk.d.ts` and context7 `/nothflare/claude-agent-sdk-docs`):
  `Options.outputFormat?: OutputFormat` where `OutputFormat = JsonSchemaOutputFormat
  = { type: 'json_schema'; schema: Record<string, unknown> }` (`sdk.d.ts:925,1695,2026`).
  The success result carries `structured_output?: unknown` (`SDKResultSuccess`,
  `sdk.d.ts:3896`). When the model cannot satisfy the schema after retries, the
  result is an **error** with subtype `error_max_structured_output_retries`
  (`sdk.d.ts:3857`) and no `structured_output`.
- **`zod` v4.4.3 is already installed** (hoisted as a transitive SDK dep at
  `packages/code-reviewer/node_modules/zod`) but is **not** a direct dependency in
  `package.json`. Zod v4 ships a native `z.toJSONSchema()` — so the docs' external
  `zod-to-json-schema` package is unnecessary; one Zod definition yields the JSON
  Schema (for the SDK), runtime validation (`safeParse`), and the TS type (`z.infer`).
- **TS config is strict NodeNext**: `verbatimModuleSyntax`, `isolatedModules`,
  `noUncheckedIndexedAccess` (`tsconfig.json`). Relative imports must carry `.js`
  extensions; type-only imports/exports must use `import type` / `export type`.
  `include: ["src/**/*.ts"]` already covers nested folders.
- **Naming drift**: the folder is `code-reviewer`, but `package.json` `name` is
  `@nuteczki/code-reviewer`, and the README + `index.ts` header + 5 README
  references say `code-reviewer`/`packages/code-reviewer/`. A stray
  `packages/code-reviewer/packages/code-reviewer/package-lock.json` (92 bytes) is
  cruft. No external importer depends on the old name.
- **The existing prompt's severity vocabulary** (`blocking / should-fix / nit`)
  must change to match the chosen schema enum (`high / medium / low`) so the prose
  instruction and the structured contract agree.

## Desired End State

`packages/code-reviewer/` exposes a modular agent whose public entry
(`@nuteczki/code-reviewer`) exports: the reusable `runReview()` agent, the Zod
review schemas + derived JSON Schema, the inferred types, `REVIEW_TOOLS`, and the
SDK type re-exports. A real run produces a `ReviewResult` whose `report` is a
schema-valid `ReviewReport` object (parsed and validated), with `review` text
retained alongside. The CLI renders findings grouped by severity and supports
`--json`. `npm run typecheck`, `npm run build`, and `npm run smoke` all pass, and
the package's name/docs are internally consistent. **Verification**: `npm run
build` emits `dist/` cleanly; `npm run smoke` passes offline (including a schema
self-check); a live `npm run review -- "..."` returns a populated, valid report.

## What We're NOT Doing

- **No eval environment**: no promptfoo install, no `promptfooconfig.yaml`, no
  provider adapter/glue, no eval scripts or fixtures. We only make the reviewer
  cleanly importable and reusable. (Per the change brief.)
- **No multi-agent / sub-agent orchestration, no MCP servers, no hooks, no
  custom tools.** The agent keeps the read-only `Read/Glob/Grep` allow-list.
- **No change to the auth model** (local Claude Code login or `ANTHROPIC_API_KEY`).
- **No folder rename** (`code-reviewer` stays); we align the *package name* and
  docs to the folder, not the reverse.
- **No CI gating semantics** (e.g. `--fail-on high`): CLI exit code stays tied to
  `isError`/missing report, not to finding severity.
- **No streaming-of-structured-tokens** UX work; partial assistant prose is
  captured opportunistically, not re-architected.
- **No changes to the root app, its ESLint, or its `tsconfig`.**

## Implementation Approach

Bottom-up, leaf-first so each phase type-checks against the previous one:
schemas + prompts (pure data, no SDK) → agent core (wires `outputFormat`, parses
`structured_output`) → public surface + CLI + smoke (consume the agent) →
housekeeping (name/docs/cruft). The Zod schema is the single source of truth:
`z.toJSONSchema()` feeds the SDK; `schema.safeParse()` validates the result; `z.infer`
gives the type. The public `index.ts` exports the building blocks so a later eval
change can write a ~5-line promptfoo provider without touching package internals.

## Critical Implementation Details

- **JSON Schema must be self-contained for structured output.** Derive the SDK
  schema with definitions inlined rather than emitted as `$ref`/`$defs`
  (Zod v4: pass the appropriate `z.toJSONSchema(schema, { … })` option so reused
  subschemas inline). A schema containing top-level `$defs`/`$ref` is the most
  likely cause of `error_max_structured_output_retries`. Beyond `$ref`/`$defs`,
  Zod v4's `z.toJSONSchema()` defaults also need handling:
  - **`$schema` top-level key** — Zod emits a `"$schema"` meta key by default.
    Strip it (or confirm the SDK ignores unknown top-level keys) so the object the
    SDK receives contains only the schema body. Pin this in the option set rather
    than leaving it to the default.
  - **`additionalProperties`** — Zod v4 does **not** emit `additionalProperties:
    false` by default. Decide explicitly: leave objects open (more permissive,
    lower retry risk) OR set strict objects if the SDK's `json_schema` path
    requires it. The SDK type is permissive (`Record<string, unknown>`), so the
    actual strictness is confirmed empirically by the Phase 2 live run (2.3) — if
    that run does not hit `error_max_structured_output_retries`, the chosen
    strictness is correct for this schema (including the optional `line`/`fix`).
  Keep `Finding.line` and `Finding.fix` **optional** in the Zod schema (so they
  are absent from JSON Schema `required`) — forcing a line number or a fix on
  every finding makes the model fail the schema when neither legitimately applies.
- **Severity vocabulary must be consistent across the prompt and the schema.**
  The structured enum is `high | medium | low`; the reviewer system prompt must
  instruct in those exact terms (not the old `blocking/should-fix/nit`), and must
  tell the model to populate every required field (`summary`, `score`, and each
  finding's `severity`/`file`/`description`).
- **Result parsing is defensive.** On the `result` message, `safeParse`
  `structured_output`; set `report` only on success. If the result subtype is
  `error_max_structured_output_retries` or parsing fails, leave `report`
  undefined and surface that via `isError`/`outcome` so callers (and future evals)
  can distinguish "no valid report" from "clean review, no findings".

## Phase 1: Extract schemas + prompts modules

### Overview

Create the two leaf modules the agent will depend on — the Zod review schema (with
its derived JSON Schema and inferred types) and the reviewer system prompt — and
promote `zod` to a direct dependency. No SDK interaction yet; everything here is
verifiable by `tsc`.

### Changes Required:

#### 1. Review schemas module

**File**: `packages/code-reviewer/src/schemas/review.ts`

**Intent**: Define the structured review contract once in Zod and expose three
artifacts from it — the runtime validator, the SDK-facing JSON Schema, and the
TS types — so there is no schema/type drift.

**Contract**: Exports (names indicative):
- `severitySchema` — `z.enum(["high","medium","low"])`; `Severity` type.
- `findingSchema` — object `{ severity, file: string, line?: number,
  description: string, fix?: string }`; `Finding` type.
- `reviewReportSchema` — object `{ summary: string, score: number (int 0–100),
  findings: Finding[] }`; `ReviewReport` type.
- `reviewReportJsonSchema` — `Record<string, unknown>` produced by
  `z.toJSONSchema(reviewReportSchema, …)` with subschemas **inlined** (no
  `$defs`/`$ref`); this is what the agent passes to `outputFormat.schema`.
  Use `score` as `z.number().int().min(0).max(100)`. Keep `line`/`fix` optional.
  Pin the full option set (don't rely on defaults): inline reused subschemas, and
  per Critical Implementation Details, strip the top-level `"$schema"` key and make
  an explicit `additionalProperties` decision. The resulting object's top-level
  keys must be exactly `type`, `properties`, `required` (plus
  `additionalProperties` if strict objects are chosen) — and nothing else.

#### 2. Schemas barrel

**File**: `packages/code-reviewer/src/schemas/index.ts`

**Intent**: Single import point for the schema module.

**Contract**: `export * from "./review.js";` (NodeNext `.js` specifier). Types
re-exported via `export type` where `verbatimModuleSyntax` requires it.

#### 3. Reviewer prompt module

**File**: `packages/code-reviewer/src/prompts/reviewer.ts`

**Intent**: Move the senior-reviewer instruction out of `reviewer.ts` into its
own module and rewrite it to match the structured schema — instruct the model to
emit findings with `high/medium/low` severity and to populate every required
report field, while preserving the existing tone ("read only what you need",
"don't invent problems", "do not modify files").

**Contract**: Export `REVIEWER_SYSTEM_PROMPT` (string) — the text appended to the
`claude_code` preset. Severity terms are exactly `high`, `medium`, `low`. No code
snippet needed.

#### 4. Prompts barrel

**File**: `packages/code-reviewer/src/prompts/index.ts`

**Intent**: Single import point for prompts.

**Contract**: `export * from "./reviewer.js";`

#### 5. Add zod as a direct dependency

**File**: `packages/code-reviewer/package.json`

**Intent**: Make the already-present (transitive) `zod` an explicit dependency so
the schema module's `import { z } from "zod"` is contractually supported.

**Contract**: Add `"zod": "^4.4.3"` to `dependencies`. Run
`npm install --prefix packages/code-reviewer` to refresh the lockfile.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm --prefix packages/code-reviewer run typecheck`
- `zod` resolves as a direct dep: `node --input-type=module -e "import('zod').then(m=>{if(typeof m.z?.toJSONSchema!=='function')process.exit(1)})"` from `packages/code-reviewer`
- JSON Schema top-level keys are exactly as pinned: a one-off `node` eval importing `reviewReportJsonSchema` and asserting `type === "object"`, no `"$ref"`/`"$defs"` anywhere in `JSON.stringify(...)`, no top-level `"$schema"` key, and `Object.keys(...)` equals the agreed set (`type`/`properties`/`required` [+ `additionalProperties` if strict])

#### Manual Verification:

- `reviewReportSchema.safeParse({summary:"ok",score:90,findings:[]})` succeeds and a malformed object fails — sanity-checked in a REPL or scratch file
- The prompt text reads naturally and uses high/medium/low consistently

**Implementation Note**: After completing this phase and all automated verification
passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Build the reusable agent module

### Overview

Move the agent core into `src/agent/`, split out its tools and types, and wire
structured output end-to-end: pass `outputFormat` built from
`reviewReportJsonSchema`, then parse `structured_output` into a validated `report`
while retaining captured assistant `review` text. The old `src/reviewer.ts` is
left in place this phase (its importers `index.ts`/`cli.ts` still reference it) and
is deleted in Phase 3 alongside the importer rewrites, so the package builds at
every phase boundary.

### Changes Required:

#### 1. Agent tools module

**File**: `packages/code-reviewer/src/agent/tools.ts`

**Intent**: Relocate the read-only tool allow-list so the agent's capabilities are
declared in one obvious place.

**Contract**: `export const REVIEW_TOOLS = ["Read","Glob","Grep"] as const;`
(unchanged value/semantics).

#### 2. Agent types module

**File**: `packages/code-reviewer/src/agent/types.ts`

**Intent**: House the public input/output types, extended for structured output.

**Contract**: `ReviewOptions` keeps all current fields (`target`, `cwd?`, `model?`,
`maxTurns?`, `loadProjectSettings?`, `abortController?`, `onText?`, `overrides?`).
`ReviewResult` keeps `review`, `outcome`, `isError`, `costUsd?`, `turns?`,
`sessionId?` and **adds** `report?: ReviewReport` (the validated structured report;
undefined when the model produced none or parsing failed). `ReviewReport` is
imported from the schemas module via `import type`.

#### 3. Agent core (runReview)

**File**: `packages/code-reviewer/src/agent/reviewer.ts`

**Intent**: Rebuild `runReview()` to request structured output, stream/collect
text as before, and parse + validate the structured result. This is the package's
core reusable integration point.

**Contract**: `runReview(opts: ReviewOptions): Promise<ReviewResult>`. Builds the
same `Options` as today plus:
`systemPrompt: { type: "preset", preset: "claude_code", append: REVIEWER_SYSTEM_PROMPT }`
and `outputFormat: { type: "json_schema", schema: reviewReportJsonSchema }`. In the
message loop, keep concatenating assistant `text` into `review` (and firing
`onText`). On the `result` message, set `outcome/isError/costUsd/turns/sessionId`
as now, and additionally: if `message.subtype === "success"` and
`message.structured_output` is present, `reviewReportSchema.safeParse(...)` it and
assign `result.report` on success. Preserve the existing "echo final text if we
captured none" fallback for `review`. Defensive parse per Critical Implementation
Details.

#### 4. Agent barrel

**File**: `packages/code-reviewer/src/agent/index.ts`

**Intent**: Single import point for the agent module.

**Contract**: Re-export `runReview`, `REVIEW_TOOLS`, and the `ReviewOptions`/
`ReviewResult` types (`export type` for types).

> **Note**: The old `src/reviewer.ts` is NOT deleted in this phase. Its importers
> (`index.ts`, `cli.ts`) are not repointed until Phase 3, so deleting it here would
> break typecheck/build. The new `agent/` module simply coexists with the old
> monolith until Phase 3 switches the public surface and removes the old file.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm --prefix packages/code-reviewer run typecheck`
- Build emits cleanly: `npm --prefix packages/code-reviewer run build`

#### Manual Verification:

- A live run `npm --prefix packages/code-reviewer run review -- "Review src/agent for unhandled errors"` returns a `ReviewResult` whose `report` is populated and schema-valid
- `report` is undefined (not a crash) when a run hits `error_max_structured_output_retries`, and `isError` reflects it

**Implementation Note**: After completing this phase and all automated verification
passes, pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Public surface, CLI, and smoke check

### Overview

Wire the new modules into the package's public entry (building blocks for future
evals), update the CLI to render the structured report with a `--json` escape
hatch, and extend the offline smoke check to assert the schema is wired.

### Changes Required:

#### 1. Public surface

**File**: `packages/code-reviewer/src/index.ts`

**Intent**: Export everything a consumer (including a future promptfoo provider)
needs: the agent, the schemas + derived JSON Schema, the inferred types, the tool
list, and the SDK type re-exports.

**Contract**: Re-export from `./agent/index.js` (`runReview`, `REVIEW_TOOLS`,
`ReviewOptions`, `ReviewResult`) and from `./schemas/index.js`
(`reviewReportSchema`, `reviewReportJsonSchema`, `severitySchema`, `findingSchema`,
and the `ReviewReport`/`Finding`/`Severity` types). Keep the existing SDK type
re-exports (`Options`, `SDKMessage`, `PermissionMode`). Update the file header
comment to the new package name.

#### 2. CLI: structured rendering + `--json`

**File**: `packages/code-reviewer/src/cli.ts`

**Intent**: Present the structured report to a human by default (findings grouped
by severity), and emit raw JSON when `--json` is passed; keep the stderr summary
line and exit semantics.

**Contract**: Add a `--json` boolean to the `parseArgs` options and document it in
`USAGE`. Still call `runReview` (optionally keep `onText` for progress). After the
run: if `--json`, write `JSON.stringify(result.report ?? null, null, 2)` to stdout;
else render `result.report` grouped by `high → medium → low` (each finding:
`file:line — description` + optional `fix`), preceded by the `summary` and `score`.
Keep the stderr one-line summary (outcome · turns · cost · session). Exit non-zero
when `result.isError` **or** `result.report` is undefined.

#### 3. Smoke check: assert schema wiring

**File**: `packages/code-reviewer/src/smoke.ts`

**Intent**: Keep the offline (no-token) wiring guarantee and extend it to the new
structured-output surface.

**Contract**: Update imports to the new barrels. Keep the `query`/`runReview`
function checks and the auth-path print. Add assertions: `reviewReportJsonSchema`
is an object with `type === "object"`; `reviewReportSchema.safeParse({summary:"x",
score:100,findings:[]}).success === true`. Exit non-zero if any check fails.

#### 4. Remove the old monolith

**File**: `packages/code-reviewer/src/reviewer.ts` (delete)

**Intent**: Its responsibilities now live in `src/agent/`, `src/schemas/`, and
`src/prompts/`. With `index.ts`/`cli.ts` repointed (above) and `smoke.ts` imports
updated, no importer references it anymore — so it can be safely deleted here while
keeping the package green.

**Contract**: Delete the file only after the three repointing changes above are in
place. No remaining importer references `./reviewer.js`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm --prefix packages/code-reviewer run typecheck`
- No dangling references to the old path: `grep -rn "reviewer\.js\|/reviewer\"" packages/code-reviewer/src` shows only `agent/reviewer` references
- Build emits cleanly: `npm --prefix packages/code-reviewer run build`
- Offline smoke passes: `npm --prefix packages/code-reviewer run smoke` (exit 0, schema assertions print ✓)
- `--json` path is machine-parseable: `npm --prefix packages/code-reviewer run review -- "..." --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>JSON.parse(s))"` exits 0 on a successful run

#### Manual Verification:

- Default CLI output groups findings by severity and is readable in a terminal
- `--json` emits valid JSON matching `ReviewReport`; the stderr summary still appears and can be separated from stdout
- Importing `@nuteczki/code-reviewer` exposes `runReview`, `reviewReportSchema`, `reviewReportJsonSchema`, and the types (spot-checked from a scratch import)

**Implementation Note**: After completing this phase and all automated verification
passes, pause for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Housekeeping — naming, docs, cruft

### Overview

Make the package internally consistent now that its shape changed: align the
package name and all docs to the actual `code-reviewer` folder, rewrite the README
layout/usage to the new module structure and structured output, and delete the
stray nested lockfile.

### Changes Required:

#### 1. Package name alignment

**File**: `packages/code-reviewer/package.json`

**Intent**: Resolve the folder-vs-name drift by adopting the folder name.

**Contract**: Set `"name": "@nuteczki/code-reviewer"`. Refresh the lockfile via
`npm install --prefix packages/code-reviewer`. (No external importer depends on the
old name — verified.)

#### 2. Source header comment

**File**: `packages/code-reviewer/src/index.ts`

**Intent**: Keep the doc header truthful.

**Contract**: Update the `@nuteczki/code-reviewer` header to `@nuteczki/code-reviewer`
(folded in here if not already done in Phase 3).

#### 3. README rewrite

**File**: `packages/code-reviewer/README.md`

**Intent**: Reflect the new name, module layout, structured output, and CLI flags.

**Contract**: Replace all `@nuteczki/code-reviewer` → `@nuteczki/code-reviewer` and
`packages/code-reviewer/` → `packages/code-reviewer/`. Rewrite the **Layout** block
to show `src/schemas/`, `src/prompts/`, `src/agent/`, `index.ts`, `cli.ts`,
`smoke.ts`. Update the **Programmatic** example to read `result.report` (structured)
and mention `--json`. Note the `ReviewReport` schema is exported for downstream use.

#### 4. Remove cruft

**File**: `packages/code-reviewer/packages/` (delete the stray nested tree)

**Intent**: Remove the orphaned `packages/code-reviewer/packages/code-reviewer/package-lock.json`.

**Contract**: `rm -rf packages/code-reviewer/packages`. Confirm nothing references it.

### Success Criteria:

#### Automated Verification:

- No stale name references remain: `grep -rn "code-reviewer" packages/code-reviewer --include=*.ts --include=*.json --include=*.md | grep -v node_modules` returns nothing
- The nested cruft is gone: `test ! -e packages/code-reviewer/packages`
- Type checking + build still pass: `npm --prefix packages/code-reviewer run typecheck && npm --prefix packages/code-reviewer run build`
- Smoke still passes: `npm --prefix packages/code-reviewer run smoke`

#### Manual Verification:

- README Layout/Usage match the actual files and the structured-output behavior
- `npm install --prefix packages/code-reviewer` succeeds and the lockfile shows the new name

**Implementation Note**: After completing this phase and all automated verification
passes, pause for final manual confirmation.

---

## Testing Strategy

### Unit Tests:

- No test framework is configured in this standalone package, and adding one is
  out of scope. Verification leans on `tsc` (typecheck), `tsc` build, and the
  offline `smoke` check. The smoke check is extended in Phase 3 to validate the
  schema round-trips (`safeParse` success + JSON-Schema shape) without tokens.

### Integration Tests:

- Manual live runs of `npm run review` against `packages/code-reviewer/src` itself
  (a real, small target) confirm the agent produces a valid `ReviewReport` and
  that the CLI rendering + `--json` paths work end-to-end.

### Manual Testing Steps:

1. From `packages/code-reviewer/`, run `npm run smoke` — expect ✓ on every check
   and exit 0, with no network/token use.
2. Run `npm run review -- "Review src/agent for unhandled promise rejections"` —
   expect a severity-grouped human render and a non-empty, valid report.
3. Re-run with `--json` and pipe through `node -e "JSON.parse(require('fs').readFileSync(0))"`
   — expect valid JSON and a clean exit.
4. Force a hard schema target (e.g. a nonsense instruction) and confirm a missing
   `report` surfaces as `isError`/non-zero exit rather than a crash.

## Performance Considerations

Negligible — single-shot agent runs. Structured output may add a small number of
retry turns if the first attempt doesn't satisfy the schema; the inlined,
loosely-required schema (optional `line`/`fix`) minimizes that risk.

## Migration Notes

The public surface is additive except for the move from a free-text-first result
to a structured-first one: `ReviewResult` **gains** `report?: ReviewReport` and
**retains** `review`. No external consumers exist in this repo, so there is no
downstream migration. The package name changes from `@nuteczki/code-reviewer` to
`@nuteczki/code-reviewer`; it is `private`, unpublished, and unimported elsewhere.

## References

- Change identity: `context/changes/tool-loop-agent/change.md`
- SDK structured output: `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:925,1695,2026,3877,3896`; context7 `/nothflare/claude-agent-sdk-docs` (structured-outputs guide)
- Current agent: `packages/code-reviewer/src/reviewer.ts`
- Team rule on optional/required-field gotchas mirrors the general lesson in `context/foundation/lessons.md` (don't over-constrain contracts)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Extract schemas + prompts modules

#### Automated

- [x] 1.1 Type checking passes (`npm --prefix packages/code-reviewer run typecheck`) — 157d11d
- [x] 1.2 `zod` resolves as a direct dep with `z.toJSONSchema` — 157d11d
- [x] 1.3 Derived JSON Schema has exactly the pinned top-level keys (`type: "object"`, no `$ref`/`$defs`, no top-level `$schema`) — 157d11d

#### Manual

- [x] 1.4 `reviewReportSchema.safeParse` accepts a valid report and rejects a malformed one — 157d11d
- [x] 1.5 Prompt text reads naturally and uses high/medium/low consistently — 157d11d

### Phase 2: Build the reusable agent module

#### Automated

- [x] 2.1 Type checking passes — e30f8d7
- [x] 2.2 Build emits cleanly (`npm --prefix packages/code-reviewer run build`) — e30f8d7

#### Manual

- [x] 2.3 Live run returns a populated, schema-valid `report` — e30f8d7
- [x] 2.4 `report` is undefined (not a crash) on `error_max_structured_output_retries`, with `isError` set — e30f8d7

### Phase 3: Public surface, CLI, and smoke check

#### Automated

- [ ] 3.1 Type checking passes
- [ ] 3.2 No dangling references to the old `reviewer.ts` path
- [ ] 3.3 Build emits cleanly
- [ ] 3.4 Offline smoke passes with schema assertions (exit 0)
- [ ] 3.5 `--json` output is machine-parseable on a successful run

#### Manual

- [ ] 3.6 Default CLI output groups findings by severity and is readable
- [ ] 3.7 `--json` emits valid `ReviewReport` JSON; stderr summary still separable
- [ ] 3.8 Public entry exposes agent, schemas, JSON Schema, and types

### Phase 4: Housekeeping — naming, docs, cruft

#### Automated

- [ ] 4.1 No stale `code-reviewer` name references remain
- [ ] 4.2 Nested cruft tree is removed
- [ ] 4.3 Typecheck + build still pass
- [ ] 4.4 Smoke still passes

#### Manual

- [ ] 4.5 README Layout/Usage match actual files and structured-output behavior
- [ ] 4.6 `npm install --prefix packages/code-reviewer` succeeds; lockfile shows the new name
