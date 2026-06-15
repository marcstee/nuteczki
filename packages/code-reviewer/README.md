# @nuteczki/code-reviewer

Standalone entry-point for AI code review built on the
[Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk).

This package is **self-contained**: it has its own `package.json`, `node_modules`,
and TypeScript toolchain, and is deliberately excluded from the root app's ESLint
and `tsconfig`. Nothing here touches the root `package.json`.

## Layout

```
packages/code-reviewer/
├── package.json        # standalone manifest (SDK + zod + tsx + TypeScript)
├── tsconfig.json       # nodenext, strict, emits to dist/
└── src/
    ├── schemas/        # Zod review contract + derived JSON Schema + TS types
    │   ├── review.ts
    │   └── index.ts
    ├── prompts/        # Senior-reviewer system prompt (high/medium/low severity)
    │   ├── reviewer.ts
    │   └── index.ts
    ├── agent/          # runReview() — wires structured output + read-only tools
    │   ├── reviewer.ts
    │   ├── tools.ts
    │   ├── types.ts
    │   └── index.ts
    ├── index.ts        # public surface: runReview, schemas, types, SDK re-exports
    ├── cli.ts          # tsx-runnable CLI (human render or --json)
    └── smoke.ts        # offline wiring check (no network, no tokens)
```

## Setup

```bash
npm install --prefix packages/code-reviewer
```

### Auth (pick one)

- **Reuse your local Claude Code login** (default, no key): run `claude login`
  once; the SDK picks up the stored credentials automatically.
- **API key:** copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`, or
  export it in your shell.

## Usage

### CLI (via `tsx`)

```bash
# from packages/code-reviewer/
npm run review -- "Review src/lib for unhandled promise rejections"
npm run review -- "Review the staged diff" --project-settings --max-turns 8
npm run review -- "Review src/agent" --json
```

Flags: `--model <id>`, `--max-turns <n>`, `--cwd <path>`, `--project-settings`,
`--json`, `-h`.

By default the review is rendered grouped by severity (high → medium → low) on
stdout; a one-line summary (outcome · turns · cost · session) goes to stderr so
you can pipe the review out cleanly. Pass `--json` to emit the raw
`ReviewReport` object on stdout instead.

### Programmatic

```ts
import { runReview, reviewReportSchema } from "@nuteczki/code-reviewer";

const result = await runReview({
  target: "Review src/db for SQL injection risks",
  maxTurns: 8,
  onText: (chunk) => process.stderr.write(chunk),
});

if (result.report) {
  console.log("Score:", result.report.score);
  console.log("Summary:", result.report.summary);
  for (const finding of result.report.findings) {
    console.log(`[${finding.severity}] ${finding.file}: ${finding.description}`);
  }
} else {
  // No valid structured report — check result.isError / result.outcome
  console.error("Review failed:", result.outcome);
}

console.log(result.outcome, result.costUsd, result.sessionId);
```

`runReview` runs with a **read-only** tool allow-list (`Read`, `Glob`, `Grep`) and a
senior-reviewer system prompt — it inspects the tree, never mutates it. The
result's `report` field is a validated `ReviewReport` (parsed from the SDK's
structured output) when the model satisfied the schema, or `undefined` on failure.
`reviewReportSchema` is exported for downstream use (e.g. a promptfoo eval provider).

Use `overrides` to reach any other [`Options`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
field when extending the integration.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run review -- "<target>"` | Run a review (tsx). |
| `npm run dev -- "<target>"` | Same, with watch reload. |
| `npm run smoke` | Offline check that the SDK and schemas are wired (no tokens). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run build` | Emit `dist/` (JS + `.d.ts`). |
