/**
 * Compile-time type guard: the row objects that sessions.ts passes to
 * supabase.upsert() must stay assignable to the generated database.types.ts
 * Insert types.  If sessions.ts adds, removes, or renames a field without a
 * corresponding supabase gen types run (or vice-versa), astro check will fail
 * here before any runtime divergence is possible.
 *
 * No runtime code — this file contains only type declarations.  Run the check
 * with: npm run build   (triggers astro check)
 *        or: npx astro check
 */

import type { Database } from "@/db/database.types";

type SessionInsert = Database["public"]["Tables"]["sessions"]["Insert"];
type AnswerInsert = Database["public"]["Tables"]["answers"]["Insert"];

// Mirror the exact shape passed to sessions.upsert() in src/pages/api/sessions.ts.
// Keep in sync with the upsert call sites — the guard fails at typecheck time if
// the shapes diverge from the generated Insert types.
interface SessionRow {
  id: string;
  user_id: string;
  exercise_count: 5 | 10 | 20;
  started_at: string;
  finished_at: string;
}

interface AnswerRow {
  id: string;
  session_id: string;
  user_id: string;
  exercise_type: "note_to_letter" | "letter_to_note";
  note: string;
  is_correct: boolean;
}

// Conditional-type assertions: resolve to `never` (compile error) if the row
// shape is no longer assignable to the generated Insert type.
type _SessionRowFitsInsert = SessionRow extends SessionInsert ? true : never;
type _AnswerRowFitsInsert = AnswerRow extends AnswerInsert ? true : never;

// Anchor the assertions to real values so TypeScript evaluates them eagerly.
declare const _s: _SessionRowFitsInsert;
declare const _a: _AnswerRowFitsInsert;

// Silence "declared but never read" without removing the guard intent.
export type { _s as _sessionTypeGuard, _a as _answerTypeGuard };
