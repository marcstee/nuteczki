import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { ReviewReport } from "../schemas/index.js";

/** Input to {@link runReview}. */
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

/** Output of {@link runReview}. */
export interface ReviewResult {
  /** Concatenated assistant text — the prose review, retained alongside the report. */
  review: string;
  /**
   * The validated structured report. Undefined when the model produced no
   * structured output (e.g. `error_max_structured_output_retries`) or parsing
   * failed — distinguish that from a clean review (a populated report with an
   * empty `findings` list) via {@link isError}/{@link outcome}.
   */
  report?: ReviewReport;
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
