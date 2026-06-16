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
import {
  runReview,
  REVIEW_TOOLS,
  reviewReportSchema,
  reviewReportJsonSchema,
  computeVerdict,
} from "./index.js";

function check(label: string, ok: boolean): boolean {
  process.stdout.write(`${ok ? "✓" : "✗"} ${label}\n`);
  return ok;
}

const VALID_CRITERIA = {
  correctness: 9,
  security: 9,
  conventions: 9,
  testing: 9,
  readability: 9,
  errorHandling: 9,
};

const topLevelKeys = Object.keys(reviewReportJsonSchema as Record<string, unknown>);
const hasNoRef = JSON.stringify(reviewReportJsonSchema).indexOf("$ref") === -1;

const results = [
  check("SDK query() imported as a function", typeof query === "function"),
  check("runReview() entry-point exported", typeof runReview === "function"),
  check(
    'reviewReportJsonSchema is an object with type === "object"',
    typeof reviewReportJsonSchema === "object" &&
      reviewReportJsonSchema !== null &&
      reviewReportJsonSchema.type === "object",
  ),
  check(
    "reviewReportJsonSchema has exactly four top-level keys (type, properties, required, additionalProperties)",
    topLevelKeys.length === 4 &&
      topLevelKeys.includes("type") &&
      topLevelKeys.includes("properties") &&
      topLevelKeys.includes("required") &&
      topLevelKeys.includes("additionalProperties"),
  ),
  check("reviewReportJsonSchema contains no $ref", hasNoRef),
  check(
    "reviewReportSchema accepts a valid report with criteria block",
    reviewReportSchema.safeParse({ summary: "x", criteria: VALID_CRITERIA, findings: [] })
      .success === true,
  ),
  check(
    "reviewReportSchema rejects a report with old score field",
    reviewReportSchema.safeParse({ summary: "x", score: 100, findings: [] }).success === false,
  ),
  check(
    "computeVerdict returns pass for all-≥8 criteria with no high/medium findings",
    computeVerdict({ summary: "x", criteria: VALID_CRITERIA, findings: [] }) === "pass",
  ),
  check(
    "computeVerdict returns changes-requested for a high-severity finding",
    computeVerdict({
      summary: "x",
      criteria: VALID_CRITERIA,
      findings: [{ severity: "high", file: "foo.ts", description: "bad" }],
    }) === "changes-requested",
  ),
  check(
    "computeVerdict returns changes-requested when correctness < 5",
    computeVerdict({
      summary: "x",
      criteria: { ...VALID_CRITERIA, correctness: 4 },
      findings: [],
    }) === "changes-requested",
  ),
  check(
    "computeVerdict returns changes-requested when security < 5",
    computeVerdict({
      summary: "x",
      criteria: { ...VALID_CRITERIA, security: 3 },
      findings: [],
    }) === "changes-requested",
  ),
  check(
    "computeVerdict returns changes-requested when testing < 5",
    computeVerdict({
      summary: "x",
      criteria: { ...VALID_CRITERIA, testing: 2 },
      findings: [],
    }) === "changes-requested",
  ),
  check(
    "computeVerdict returns comment for medium finding with all criteria ≥ 5",
    computeVerdict({
      summary: "x",
      criteria: VALID_CRITERIA,
      findings: [{ severity: "medium", file: "foo.ts", description: "nit" }],
    }) === "comment",
  ),
  check(
    "computeVerdict returns comment when a criterion is in 5-7 range",
    computeVerdict({
      summary: "x",
      criteria: { ...VALID_CRITERIA, readability: 6 },
      findings: [],
    }) === "comment",
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
