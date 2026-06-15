/**
 * Offline integration check — proves the SDK and the structured-output surface
 * are wired up correctly without spending tokens or needing the network.
 * Verifies the package's own surface (`runReview`), the SDK's `query`, and the
 * review schema (JSON Schema shape + a `safeParse` round-trip), then reports
 * which auth path is available. Exits non-zero if any check fails.
 *
 * Run: `npm run smoke`
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { runReview, REVIEW_TOOLS, reviewReportSchema, reviewReportJsonSchema } from "./index.js";

function check(label: string, ok: boolean): boolean {
  process.stdout.write(`${ok ? "✓" : "✗"} ${label}\n`);
  return ok;
}

const results = [
  check("SDK query() imported as a function", typeof query === "function"),
  check("runReview() entry-point exported", typeof runReview === "function"),
  check(
    "reviewReportJsonSchema is an object with type === \"object\"",
    typeof reviewReportJsonSchema === "object" &&
      reviewReportJsonSchema !== null &&
      reviewReportJsonSchema.type === "object",
  ),
  check(
    "reviewReportSchema accepts a valid empty report",
    reviewReportSchema.safeParse({ summary: "x", score: 100, findings: [] }).success === true,
  ),
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
