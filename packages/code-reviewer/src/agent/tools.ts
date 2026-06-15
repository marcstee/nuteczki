/**
 * Read-only tools the reviewer is allowed to use. A reviewer inspects the tree;
 * it must never mutate it, so editing/execution tools are deliberately excluded.
 */
export const REVIEW_TOOLS = ["Read", "Glob", "Grep"] as const;
