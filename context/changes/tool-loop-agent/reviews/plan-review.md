<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Modular Code-Review Agent (Claude Agent SDK)

- **Plan**: context/changes/tool-loop-agent/plan.md
- **Mode**: Deep
- **Date**: 2026-06-15
- **Verdict**: REVISE → **SOUND after triage** (F1–F3 fixed, F4 accepted; triaged 2026-06-15)
- **Findings**: 2 critical · 1 warning · 1 observation

## Verdicts

| Dimension | Verdict (at review) | After triage |
|-----------|---------|---------|
| End-State Alignment | FAIL | PASS (F1 fixed) |
| Lean Execution | WARNING | PASS (F4 accepted) |
| Architectural Fitness | PASS | PASS |
| Blind Spots | WARNING | PASS (F3 fixed) |
| Plan Completeness | FAIL | PASS (F2 fixed) |

Overall: **REVISE** at review — both FAILs were mechanical / sequencing fixes, not a
wrong approach. The Zod-single-source-of-truth + native `outputFormat`
structured-output design is sound and accurately grounded in the SDK. After triage,
all dimensions PASS → **SOUND**.

## Grounding

10/10 paths ✓, 6/6 symbols ✓, brief↔plan ✓

- Paths verified: `src/reviewer.ts`, `src/index.ts`, `src/cli.ts`, `src/smoke.ts`,
  `package.json`, `tsconfig.json`, `README.md`, SDK `sdk.d.ts`, `node_modules/zod`,
  and the stray nested `packages/code-reviewer/packages/code-reviewer/package-lock.json`.
- Symbols verified: `outputFormat?: OutputFormat` (sdk.d.ts:1695),
  `OutputFormat = JsonSchemaOutputFormat` (2026), `JsonSchemaOutputFormat =
  { type:'json_schema'; schema: Record<string,unknown> }` (925),
  `structured_output?: unknown` on `SDKResultSuccess` (3896),
  `error_max_structured_output_retries` subtype on `SDKResultError` (3857),
  `z.toJSONSchema` is a function in zod 4.4.3, `SettingSource` exported (6051).
- No external importer of the package (root-app grep clean); README carries the
  stale `@nuteczki/code-reviewer` / `packages/code-reviewer/` refs the plan cites.

## Findings

### F1 — Phase 2 deletes reviewer.ts but its importers aren't updated until Phase 3

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 2 (change #5 "Remove the old monolith" + Success Criteria 2.1/2.2/2.3)
- **Detail**: Phase 2 change #5 deletes `src/reviewer.ts` and states "all importers
  updated in Phase 3." But `src/index.ts` (lines 8–9) and `src/cli.ts` (line 3) still
  `import … from "./reviewer.js"`, and `src/smoke.ts` imports them transitively via
  `./index.js`. So at the end of Phase 2: gate 2.1 "Type checking passes" FAILS (broken
  import to deleted file), 2.3 "Build emits cleanly" FAILS, and 2.2 grep "shows only
  agent/reviewer references" FAILS because Phase 2 never touches index.ts/cli.ts. The
  phase cannot satisfy its own gates, so its "pause after automated verification" stop
  point is unreachable. Verified against the live importer graph.
- **Fix A ⭐ Recommended**: Move the `src/reviewer.ts` deletion AND the importer rewrites into Phase 3; Phase 2 only ADDS `src/agent/*`.
  - Strength: Old and new `runReview` coexist; the package builds at every phase boundary; the deletion travels with the import switch. Relocate the 2.2 grep gate to Phase 3.
  - Tradeoff: Two `runReview` implementations coexist briefly after Phase 2.
  - Confidence: HIGH — matches the verified importer graph; no external consumers.
  - Blind spot: None significant.
- **Fix B**: Keep the deletion in Phase 2 but pull the index.ts + cli.ts repointing (to `./agent/index.js`) into Phase 2.
  - Strength: No transient duplicate module.
  - Tradeoff: Phase 3 re-edits index.ts/cli.ts again (the larger CLI rewrite), splitting "public surface" work across two phases.
  - Confidence: HIGH — same graph.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A — deletion + importer rewrites moved to Phase 3)

### F2 — Phase Success-Criteria use `- [ ]` checkboxes (Progress-format violation)

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phases 1–4, under `#### Automated Verification:` / `#### Manual Verification:` (e.g. lines 202–209)
- **Detail**: The mechanical Progress contract requires phase blocks to hold plain `- `
  bullets only — `- [ ]`/`- [x]` checkboxes belong solely in the `## Progress` section.
  This plan's Success-Criteria bullets in every phase use `- [ ]` (e.g. line 202
  "- [ ] Type checking passes …"). The project's own archived, successfully-implemented
  plans (e.g. `context/archive/2026-06-11-critical-flow-e2e/plan.md:166`) use plain `- `
  here and reserve checkboxes for Progress. Duplicate checkbox sets in both places let
  progress state drift and can break `/10x-implement`'s parse. The `## Progress` section
  itself is well-formed (one heading; phases and N.M bullets all match).
- **Fix**: Convert the `- [ ]` bullets under each phase's `#### Automated Verification:` /
  `#### Manual Verification:` to plain `- ` bullets. Leave the `## Progress` `- [ ] N.M`
  checkboxes as the single source of progress truth.
- **Decision**: FIXED (phase-body checkboxes converted to plain bullets)

### F3 — JSON-Schema `$schema` / `additionalProperties` strictness unspecified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details + Phase 1 (#1, verification 1.3)
- **Detail**: The plan correctly names `$ref`/`$defs` as the #1 structured-output risk
  and verifies their absence (1.3). But Zod v4 `z.toJSONSchema()` also emits a top-level
  `"$schema"` key by default and does NOT set `additionalProperties: false`. The plan
  specifies neither how to handle `$schema` nor whether the Anthropic `outputFormat`
  path wants strict objects. This matters because the plan deliberately keeps
  `line`/`fix` optional — if the backend enforces strict mode, optional fields + missing
  `additionalProperties` is exactly what trips `error_max_structured_output_retries`,
  defeating the central schema-design choice.
- **Fix**: Pin the full `z.toJSONSchema(reviewReportSchema, {…})` option set in Phase 1's
  contract — inline reused subschemas AND decide on `$schema` stripping +
  `additionalProperties`. Tighten gate 1.3 to assert the exact expected top-level keys,
  and treat Phase 2's live run (2.4) as the gate that this specific schema (optional
  line/fix included) round-trips without a retry error.
  - Strength: Turns the acknowledged #1 risk into a checked contract rather than a runtime surprise.
  - Tradeoff: Slightly more upfront schema-option spelunking.
  - Confidence: MED — exact strictness of the SDK's json_schema path isn't verified here (type is permissive: `Record<string, unknown>`).
  - Blind spot: Whether the SDK silently strips unknown top-level keys.
- **Decision**: FIXED (z.toJSONSchema options pinned; gate 1.3 tightened)

### F4 — Single-module barrels add indirection

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 1 (#2 `schemas/index.ts`, #4 `prompts/index.ts`)
- **Detail**: `schemas/` and `prompts/` each contain exactly one real module, yet each
  gets a barrel `index.ts` doing `export * from "./review.js"`. The root `index.ts` could
  import `./schemas/review.js` directly. `agent/index.ts` is justified (three modules).
  The brief's "room to grow" rationale covers this, so it's advisory, not blocking.
- **Fix**: Optionally drop `schemas/index.ts` and `prompts/index.ts` and import the leaf
  modules directly; keep `agent/index.ts`. Or accept the barrels as a deliberate convention.
- **Decision**: ACCEPTED (barrels kept as deliberate convention)
