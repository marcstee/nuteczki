/**
 * @nuteczki/code-reviewer
 *
 * Standalone entry-point for AI code review built on the Claude Agent SDK.
 * Import {@link runReview} to drive a read-only review programmatically; the
 * SDK types are re-exported for convenience when composing larger agents.
 */
export { runReview, REVIEW_TOOLS } from "./reviewer.js";
export type { ReviewOptions, ReviewResult } from "./reviewer.js";

export type { Options, SDKMessage, PermissionMode } from "@anthropic-ai/claude-agent-sdk";
