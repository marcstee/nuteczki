#!/usr/bin/env -S npx tsx
import { parseArgs } from "node:util";
import { runReview } from "./reviewer.js";

const USAGE = `code-reviewer — read-only AI code review on the Claude Agent SDK

Usage:
  tsx src/cli.ts "<what to review>" [options]
  npm run review -- "<what to review>" [options]

Options:
  --model <id>          Model override (e.g. claude-opus-4-8)
  --max-turns <n>       Cap the agent loop (default 12)
  --cwd <path>          Directory the agent may read (default: current)
  --project-settings    Load the repo's CLAUDE.md / settings for context
  -h, --help            Show this help

Examples:
  npm run review -- "Review src/lib for unhandled promise rejections"
  npm run review -- "Review the staged diff" --project-settings`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: "string" },
    "max-turns": { type: "string" },
    cwd: { type: "string" },
    "project-settings": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

const target = positionals.join(" ").trim();

if (values.help || !target) {
  process.stdout.write(USAGE + "\n");
  process.exit(values.help ? 0 : 1);
}

const result = await runReview({
  target,
  model: values.model,
  maxTurns: values["max-turns"] ? Number(values["max-turns"]) : undefined,
  cwd: values.cwd,
  loadProjectSettings: values["project-settings"],
  // Stream the review to stdout so it can be piped; summary goes to stderr.
  onText: (text) => process.stdout.write(text),
});

const cost = result.costUsd === undefined ? "n/a" : `$${result.costUsd.toFixed(4)}`;
process.stderr.write(
  `\n\n— ${result.outcome} · ${result.turns ?? "?"} turns · ${cost}` +
    (result.sessionId ? ` · session ${result.sessionId}` : "") +
    "\n",
);

process.exit(result.isError ? 1 : 0);
