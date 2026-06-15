/**
 * @nuteczki/code-reviewer
 *
 * Standalone entry-point for AI code review built on the Claude Agent SDK.
 * Import {@link runReview} to drive a read-only review programmatically; it
 * returns a validated, structured {@link ReviewReport}. The Zod schemas and the
 * derived JSON Schema are exported so downstream consumers (e.g. a promptfoo
 * eval provider) can validate or describe the contract without reaching into
 * package internals. The SDK types are re-exported for convenience when
 * composing larger agents.
 */
export { runReview, REVIEW_TOOLS } from "./agent/index.js";
export type { ReviewOptions, ReviewResult } from "./agent/index.js";

export {
  severitySchema,
  findingSchema,
  reviewReportSchema,
  reviewReportJsonSchema,
} from "./schemas/index.js";
export type { Severity, Finding, ReviewReport } from "./schemas/index.js";

export type { Options, SDKMessage, PermissionMode } from "@anthropic-ai/claude-agent-sdk";
