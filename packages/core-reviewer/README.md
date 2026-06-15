# @nuteczki/code-reviewer

Standalone entry-point for AI code review built on the
[Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk).

This package is **self-contained**: it has its own `package.json`, `node_modules`,
and TypeScript toolchain, and is deliberately excluded from the root app's ESLint
and `tsconfig`. Nothing here touches the root `package.json`.

## Layout

```
packages/code-reviewer/
├── package.json        # standalone manifest (SDK + tsx + TypeScript)
├── tsconfig.json       # nodenext, strict, emits to dist/
└── src/
    ├── reviewer.ts     # runReview() — the core query() wrapper (read-only tools)
    ├── index.ts        # public surface: runReview, REVIEW_TOOLS, SDK types
    ├── cli.ts          # tsx-runnable CLI
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
```

Flags: `--model <id>`, `--max-turns <n>`, `--cwd <path>`, `--project-settings`, `-h`.
The review streams to stdout; a one-line summary (outcome · turns · cost · session)
goes to stderr, so you can pipe the review out cleanly.

### Programmatic

```ts
import { runReview } from "@nuteczki/code-reviewer";

const result = await runReview({
  target: "Review src/db for SQL injection risks",
  maxTurns: 8,
  onText: (chunk) => process.stdout.write(chunk),
});

console.log(result.outcome, result.costUsd, result.sessionId);
```

`runReview` runs with a **read-only** tool allow-list (`Read`, `Glob`, `Grep`) and a
senior-reviewer system prompt — it inspects the tree, never mutates it. Use
`overrides` to reach any other [`Options`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
field when extending the integration.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run review -- "<target>"` | Run a review (tsx). |
| `npm run dev -- "<target>"` | Same, with watch reload. |
| `npm run smoke` | Offline check that the SDK is wired up (no tokens). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run build` | Emit `dist/` (JS + `.d.ts`). |
