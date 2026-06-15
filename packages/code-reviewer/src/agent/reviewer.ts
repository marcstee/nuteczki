import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options, PermissionMode, SettingSource } from "@anthropic-ai/claude-agent-sdk";
import { REVIEWER_SYSTEM_PROMPT } from "../prompts/index.js";
import { reviewReportSchema, reviewReportJsonSchema } from "../schemas/index.js";
import { REVIEW_TOOLS } from "./tools.js";
import type { ReviewOptions, ReviewResult } from "./types.js";

/**
 * Run a single read-only code review through the Claude Agent SDK and collect
 * the result. This is the package's core integration point — higher layers
 * (CLI, HTTP handler, CI job, eval provider) should call this rather than
 * touching `query` directly.
 *
 * The agent is asked for structured output via the SDK's `json_schema`
 * `outputFormat` (built from {@link reviewReportJsonSchema}). On a successful
 * run the structured payload is validated with {@link reviewReportSchema} and,
 * when valid, assigned to `result.report`. Captured assistant prose is retained
 * in `result.review` regardless.
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
    systemPrompt: { type: "preset", preset: "claude_code", append: REVIEWER_SYSTEM_PROMPT },
    outputFormat: { type: "json_schema", schema: reviewReportJsonSchema },
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
      if (message.subtype === "success") {
        // On success the SDK echoes the final text; prefer it if we captured nothing.
        if (!review) {
          review = message.result;
        }
        // Validate the structured payload defensively: only set `report` when it
        // round-trips through the schema. A missing or malformed payload leaves
        // `report` undefined while `outcome`/`isError` still describe the run.
        if (message.structured_output !== undefined) {
          const parsed = reviewReportSchema.safeParse(message.structured_output);
          if (parsed.success) {
            result.report = parsed.data;
          }
        }
      }
    }
  }

  result.review = review;
  return result;
}
