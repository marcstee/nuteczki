/**
 * Offline integration check — proves the SDK is wired up correctly without
 * spending tokens or needing the network. Verifies the package's own surface
 * (`runReview`) and the SDK's `query` resolve and are callable, then reports
 * which auth path is available. Exits non-zero if the wiring is broken.
 *
 * Run: `npm run smoke`
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { runReview, REVIEW_TOOLS } from "./index.js";

function check(label: string, ok: boolean): boolean {
  process.stdout.write(`${ok ? "✓" : "✗"} ${label}\n`);
  return ok;
}

const results = [
  check("SDK query() imported as a function", typeof query === "function"),
  check("runReview() entry-point exported", typeof runReview === "function"),
];

process.stdout.write(`  review tools: ${REVIEW_TOOLS.join(", ")}\n`);

const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);
process.stdout.write(
  `\nAuth: ${
    hasApiKey
      ? "ANTHROPIC_API_KEY present"
      : "no API key — will use local Claude Code login (run `claude login` if a real run fails)"
  }\n`,
);

if (results.every(Boolean)) {
  process.stdout.write("\nSmoke check passed: code-reviewer is wired to the Claude Agent SDK.\n");
  process.exit(0);
} else {
  process.stderr.write("\nSmoke check FAILED.\n");
  process.exit(1);
}
