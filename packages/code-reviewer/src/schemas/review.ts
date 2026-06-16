import { z } from "zod";

/**
 * The structured review contract, defined once in Zod and projected into three
 * artifacts: a runtime validator ({@link reviewReportSchema}), the SDK-facing
 * JSON Schema ({@link reviewReportJsonSchema}), and the inferred TS types. One
 * source of truth — no schema/type drift.
 */

/** Finding severity, matching the reviewer prompt's vocabulary exactly. */
export const severitySchema = z.enum(["high", "medium", "low"]);
export type Severity = z.infer<typeof severitySchema>;

/**
 * A single review finding. `line` and `fix` are optional on purpose: forcing a
 * line number or a concrete fix on every finding makes the model fail the schema
 * when neither legitimately applies (see plan's Critical Implementation Details).
 */
export const findingSchema = z.object({
  severity: severitySchema,
  file: z.string(),
  line: z.number().int().optional(),
  description: z.string(),
  fix: z.string().optional(),
});
export type Finding = z.infer<typeof findingSchema>;

/**
 * Six review criteria, each scored 1 (worst) to 10 (best).
 * Keyed by stable names (C1–C6 from requirements.md §Code Review Criteria).
 */
export const criteriaSchema = z.object({
  correctness: z.number().int().min(1).max(10),
  security: z.number().int().min(1).max(10),
  conventions: z.number().int().min(1).max(10),
  testing: z.number().int().min(1).max(10),
  readability: z.number().int().min(1).max(10),
  errorHandling: z.number().int().min(1).max(10),
});
export type Criteria = z.infer<typeof criteriaSchema>;

/** The full structured report the agent is asked to return. */
export const reviewReportSchema = z.object({
  summary: z.string(),
  criteria: criteriaSchema,
  findings: z.array(findingSchema),
});
export type ReviewReport = z.infer<typeof reviewReportSchema>;

/**
 * Strip Zod's top-level `"$schema"` meta key so the object the SDK receives is
 * the schema body only. The SDK's `outputFormat.schema` wants the raw schema,
 * and a stray top-level key is a needless mismatch risk.
 */
function stripSchemaMeta(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _schemaMeta, ...body } = schema;
  void _schemaMeta;
  return body;
}

/**
 * JSON Schema fed to the SDK's structured-output path
 * (`outputFormat: { type: "json_schema", schema: reviewReportJsonSchema }`).
 *
 * Options are pinned, not left to defaults:
 * - `reused: "inline"` — inline reused subschemas so there are no `$ref`/`$defs`.
 *   A schema containing top-level `$defs`/`$ref` is the most likely cause of
 *   `error_max_structured_output_retries`.
 * - The top-level `"$schema"` key is stripped (see {@link stripSchemaMeta}).
 * - `additionalProperties: false` is kept (Zod v4 emits it by default for object
 *   schemas) — the strict-objects choice the SDK's `json_schema` path expects.
 *
 * Resulting top-level keys are exactly: `type`, `properties`, `required`,
 * `additionalProperties`.
 */
export const reviewReportJsonSchema: Record<string, unknown> = stripSchemaMeta(
  z.toJSONSchema(reviewReportSchema, { reused: "inline" }) as Record<string, unknown>,
);
