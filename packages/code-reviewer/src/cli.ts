#!/usr/bin/env -S npx tsx
import { parseArgs } from "node:util";
import { runReview } from "./index.js";
import type { ReviewReport, Severity } from "./index.js";

const USAGE = `code-reviewer — read-only AI code review on the Claude Agent SDK

Usage:
  tsx src/cli.ts "<what to review>" [options]
  npm run review -- "<what to review>" [options]

Options:
  --model <id>          Model override (e.g. claude-opus-4-8)
  --max-turns <n>       Cap the agent loop (default 12)
  --cwd <path>          Directory the agent may read (default: current)
  --project-settings    Load the repo's CLAUDE.md / settings for context
  --json                Emit the raw structured report as JSON on stdout
  -h, --help            Show this help

Examples:
  npm run review -- "Review src/lib for unhandled promise rejections"
  npm run review -- "Review the staged diff" --project-settings
  npm run review -- "Review src/agent" --json`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    model: { type: "string" },
    "max-turns": { type: "string" },
    cwd: { type: "string" },
    "project-settings": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

const target = positionals.join(" ").trim();

if (values.help || !target) {
  process.stdout.write(USAGE + "\n");
  process.exit(values.help ? 0 : 1);
}

const SEVERITY_ORDER: readonly Severity[] = ["high", "medium", "low"] as const;

/** Render a structured report for a human terminal, grouped by severity. */
function renderReport(report: ReviewReport): string {
  const lines: string[] = [];
  lines.push(`Score: ${report.score}/100`);
  lines.push("");
  lines.push(report.summary);

  if (report.findings.length === 0) {
    lines.push("");
    lines.push("No findings.");
    return lines.join("\n") + "\n";
  }

  for (const severity of SEVERITY_ORDER) {
    const group = report.findings.filter((f) => f.severity === severity);
    if (group.length === 0) continue;
    lines.push("");
    lines.push(`${severity.toUpperCase()} (${group.length})`);
    for (const finding of group) {
      const where = finding.line === undefined ? finding.file : `${finding.file}:${finding.line}`;
      lines.push(`  • ${where} — ${finding.description}`);
      if (finding.fix) {
        lines.push(`    fix: ${finding.fix}`);
      }
    }
  }

  return lines.join("\n") + "\n";
}

let result;
try {
  result = await runReview({
    target,
    model: values.model,
    maxTurns: values["max-turns"] ? Number(values["max-turns"]) : undefined,
    cwd: values.cwd,
    loadProjectSettings: values["project-settings"],
    // Stream progress to stderr so stdout stays a clean report (or JSON).
    onText: (text) => process.stderr.write(text),
  });
} catch (err) {
  // SDK-level failures (auth, network, abort) reject rather than returning an
  // isError result — print a clean one-liner instead of an unhandled rejection.
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`code-reviewer: ${message}\n`);
  process.exit(1);
}

if (values.json) {
  process.stdout.write(JSON.stringify(result.report ?? null, null, 2) + "\n");
} else if (result.report) {
  process.stdout.write(renderReport(result.report));
} else {
  process.stdout.write("No structured report was produced.\n");
}

const cost = result.costUsd === undefined ? "n/a" : `$${result.costUsd.toFixed(4)}`;
process.stderr.write(
  `\n— ${result.outcome} · ${result.turns ?? "?"} turns · ${cost}` +
    (result.sessionId ? ` · session ${result.sessionId}` : "") +
    "\n",
);

// Non-zero on a flagged error or when no valid structured report came back.
process.exit(result.isError || !result.report ? 1 : 0);
