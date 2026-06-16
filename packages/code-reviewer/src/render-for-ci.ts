import { readFileSync, writeFileSync } from "node:fs";
import { computeVerdict, renderComment, REVIEW_MARKER } from "./index.js";
import type { ReviewReport } from "./index.js";

const jsonPath = process.env["REVIEW_JSON_PATH"] ?? "";
const verdictPath = process.env["VERDICT_PATH"] ?? "";
const commentPath = process.env["COMMENT_PATH"] ?? "";

if (!jsonPath || !verdictPath || !commentPath) {
  process.stderr.write(
    "render-for-ci: REVIEW_JSON_PATH, VERDICT_PATH, COMMENT_PATH must be set\n",
  );
  process.exit(1);
}

const raw = readFileSync(jsonPath, "utf8").trim();
const report: ReviewReport | null =
  raw === "null" || raw === "" ? null : (JSON.parse(raw) as ReviewReport);

if (!report) {
  writeFileSync(verdictPath, "error");
  writeFileSync(
    commentPath,
    `${REVIEW_MARKER}\n## AI Code Review — ❌ Review Error\n\nThe review agent did not produce a valid report. Check the workflow logs for details.\n`,
  );
  process.exit(0);
}

const verdict = computeVerdict(report);
writeFileSync(verdictPath, verdict);
writeFileSync(
  commentPath,
  renderComment(report, {
    verdict,
    commitSha: process.env["HEAD_SHA"],
    costUsd: process.env["REVIEW_COST"] ? Number(process.env["REVIEW_COST"]) : undefined,
    turns: process.env["REVIEW_TURNS"] ? Number(process.env["REVIEW_TURNS"]) : undefined,
  }),
);
