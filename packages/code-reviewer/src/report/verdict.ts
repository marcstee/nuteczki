import type { ReviewReport } from "../schemas/review.js";

export type Verdict = "pass" | "comment" | "changes-requested" | "error";

/**
 * Roll up a parsed report to one of three non-error verdicts.
 * "error" is owned by the action (when no valid report exists) — not produced here.
 *
 * Rules (from requirements.md §Verdict → status mapping):
 * - changes-requested: any high-severity finding, or C1/C2/C4 (correctness/security/testing) < 5
 * - pass: no high or medium findings, and every criterion ≥ 8
 * - comment: otherwise
 */
export function computeVerdict(report: ReviewReport): Exclude<Verdict, "error"> {
  const { criteria, findings } = report;

  const hasHigh = findings.some((f) => f.severity === "high");
  const criticalCriteriaBelow5 =
    criteria.correctness < 5 || criteria.security < 5 || criteria.testing < 5;

  if (hasHigh || criticalCriteriaBelow5) {
    return "changes-requested";
  }

  const hasMedium = findings.some((f) => f.severity === "medium");
  const allCriteriaAbove8 = Object.values(criteria).every((v) => v >= 8);

  if (!hasMedium && allCriteriaAbove8) {
    return "pass";
  }

  return "comment";
}
