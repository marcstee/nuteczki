import type { ReviewReport } from "../schemas/review.js";
import type { Verdict } from "./verdict.js";

/** HTML anchor that makes the review comment idempotent — grep for this. */
export const REVIEW_MARKER = "<!-- ai-code-review -->";

const CRITERIA_LABELS: Record<keyof ReviewReport["criteria"], string> = {
  correctness: "C1 Correctness",
  security: "C2 Security",
  conventions: "C3 Conventions",
  testing: "C4 Testing",
  readability: "C5 Readability",
  errorHandling: "C6 Error Handling",
};

const VERDICT_HEADING: Record<Verdict, string> = {
  pass: "✅ Pass",
  comment: "💬 Comment",
  "changes-requested": "🔴 Changes Requested",
  error: "❌ Review Error",
};

const SEVERITY_ORDER = ["high", "medium", "low"] as const;

export function renderComment(
  report: ReviewReport,
  meta: {
    verdict: Verdict;
    model?: string;
    costUsd?: number;
    turns?: number;
    commitSha?: string;
  },
): string {
  const lines: string[] = [];

  lines.push(REVIEW_MARKER);
  lines.push(`## AI Code Review — ${VERDICT_HEADING[meta.verdict]}`);
  lines.push("");
  lines.push(report.summary);
  lines.push("");

  lines.push("### Criteria");
  lines.push("");
  lines.push("| Criterion | Score |");
  lines.push("| --- | --- |");
  for (const [key, label] of Object.entries(CRITERIA_LABELS) as [
    keyof ReviewReport["criteria"],
    string,
  ][]) {
    lines.push(`| ${label} | ${report.criteria[key]}/10 |`);
  }
  lines.push("");

  if (report.findings.length === 0) {
    lines.push("### Findings");
    lines.push("");
    lines.push("No findings.");
  } else {
    for (const severity of SEVERITY_ORDER) {
      const group = report.findings.filter((f) => f.severity === severity);
      if (group.length === 0) continue;
      lines.push(`### ${severity.charAt(0).toUpperCase() + severity.slice(1)} findings`);
      lines.push("");
      for (const finding of group) {
        const where =
          finding.line !== undefined ? `${finding.file}:${finding.line}` : finding.file;
        lines.push(`**${where}** — ${finding.description}`);
        if (finding.fix) {
          lines.push(`> Fix: ${finding.fix}`);
        }
        lines.push("");
      }
    }
  }

  const footerParts: string[] = [];
  if (meta.model) footerParts.push(`Reviewed by ${meta.model}`);
  if (meta.commitSha) footerParts.push(`commit ${meta.commitSha}`);
  if (meta.turns !== undefined) footerParts.push(`${meta.turns} turns`);
  if (meta.costUsd !== undefined)
    footerParts.push(Number.isFinite(meta.costUsd) ? `$${meta.costUsd.toFixed(4)}` : "N/A");
  if (footerParts.length > 0) {
    lines.push(`---`);
    lines.push(`*${footerParts.join(" · ")}*`);
  }

  return lines.join("\n") + "\n";
}
