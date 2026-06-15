import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options, PermissionMode, SettingSource } from "@anthropic-ai/claude-agent-sdk";

/**
 * Read-only tools the reviewer is allowed to use. A reviewer inspects the tree;
 * it must never mutate it, so editing/execution tools are deliberately excluded.
 */
export const REVIEW_TOOLS = ["Read", "Glob", "Grep"] as const;

const REVIEWER_INSTRUCTIONS = `You are a meticulous senior code reviewer.
Read only what you need, then report findings grouped by severity
(blocking / should-fix / nit). For each finding give: the file and line,
what is wrong, why it matters, and a concrete fix. Do not modify any files.
If the change looks correct, say so plainly instead of inventing problems.`;

export interface ReviewOptions {
  /** What to review: a natural-language instruction, a file path, or a diff to inspect. */
  target: string;
  /** Directory the agent may read from. Defaults to {@link process.cwd}. */
  cwd?: string;
  /** Model id override (e.g. "claude-opus-4-8"). Defaults to the CLI/account default. */
  model?: string;
  /** Hard cap on agent-loop turns. Defaults to 12. */
  maxTurns?: number;
  /**
   * Whether to load the project's CLAUDE.md / settings so the review respects
   * repo conventions. Off by default to keep runs self-contained and deterministic.
   */
  loadProjectSettings?: boolean;
  /** Stop the run early. */
  abortController?: AbortController;
  /** Called with each chunk of assistant text as it streams in. */
  onText?: (text: string) => void;
  /** Escape hatch: merged over the options this wrapper builds, last write wins. */
  overrides?: Partial<Options>;
}

export interface ReviewResult {
  /** Concatenated assistant text — the review itself. */
  review: string;
  /** Why the run ended: "success" or an "error_*" subtype. */
  outcome: string;
  /** True when the SDK flagged the run as an error. */
  isError: boolean;
  /** Total cost in USD, when the SDK reports it. */
  costUsd?: number;
  /** Number of agent-loop turns taken. */
  turns?: number;
  /** Session id — pass to a future query's `resume` to continue this review. */
  sessionId?: string;
}

/**
 * Run a single read-only code review through the Claude Agent SDK and collect
 * the result. This is the package's core integration point — higher layers
 * (CLI, HTTP handler, CI job) should call this rather than touching `query`
 * directly.
 */
export async function runReview(opts: ReviewOptions): Promise<ReviewResult> {
  const {
    target,
    cwd = process.cwd(),
    model,
    maxTurns = 12,
    loadProjectSettings = false,
    abortController,
    onText,
    overrides,
  } = opts;

  const permissionMode: PermissionMode = "default";
  const settingSources: SettingSource[] = loadProjectSettings ? ["project"] : [];

  const options: Options = {
    cwd,
    maxTurns,
    permissionMode,
    settingSources,
    allowedTools: [...REVIEW_TOOLS],
    systemPrompt: { type: "preset", preset: "claude_code", append: REVIEWER_INSTRUCTIONS },
    ...(model ? { model } : {}),
    ...(abortController ? { abortController } : {}),
    ...overrides,
  };

  let review = "";
  const result: ReviewResult = { review: "", outcome: "incomplete", isError: true };

  for await (const message of query({ prompt: target, options })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") {
          review += block.text;
          onText?.(block.text);
        }
      }
    } else if (message.type === "result") {
      result.outcome = message.subtype;
      result.isError = message.is_error;
      result.costUsd = message.total_cost_usd;
      result.turns = message.num_turns;
      result.sessionId = message.session_id;
      // On success the SDK echoes the final text; prefer it if we captured nothing.
      if (message.subtype === "success" && !review) {
        review = message.result;
      }
    }
  }

  result.review = review;
  return result;
}
