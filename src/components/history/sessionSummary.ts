/**
 * Session-history aggregation — turns the raw `sessions(...).answers(...)` query
 * result into an ordered array of per-session view-models for the `/history` page
 * (S-04 / FR-009).
 *
 * Pure and render-free, mirroring `drill/exercises.ts`: it does no fetching and
 * holds no React/DOM, so the per-session math can be audited and unit-tested later
 * without a runner. The counts reuse `summarize()` — the same primitive the drill
 * uses for its end-of-session stats — so the history numbers and the drill's
 * results screen can never drift.
 */

import { summarize, EXERCISE_TYPE_NOTE_TO_LETTER, EXERCISE_TYPE_LETTER_TO_NOTE } from "@/components/drill/exercises";

/** Correct / incorrect counts for one exercise type. */
export interface TypeStats {
  correct: number;
  incorrect: number;
}

/** One answer row as it comes back from the embedded select — the minimal shape
 * this helper needs. Kept structural (not the generated DB type) so the function
 * stays decoupled from the schema and trivially testable. */
export interface AnswerRow {
  exercise_type: string;
  is_correct: boolean;
}

/** One session row from the embedded select, with its answers nested. */
export interface SessionRow {
  id: string;
  started_at: string;
  answers: AnswerRow[];
}

/**
 * A single session reduced to what the history card renders: its id, start
 * timestamp (formatted by the page), the whole-session accuracy %, and the
 * per-type correct/incorrect tallies.
 */
export interface SessionSummary {
  id: string;
  startedAt: string;
  accuracyPct: number;
  byType: {
    noteToLetter: TypeStats;
    letterToNote: TypeStats;
  };
}

/**
 * Pure: map each raw session row to a `SessionSummary`, preserving input order
 * (the query already orders rows `started_at desc`; this helper never re-sorts).
 *
 * Per the drill precedent (`DrillSession.tsx:187–191`), two distinct things are
 * computed per row: `accuracyPct` is the **whole-session** summary over **all**
 * answers (unfiltered); each `byType` entry is the **per-type** summary over the
 * answers filtered by `exercise_type`. `summarize` expects `{ isCorrect }[]`, so
 * `is_correct` is mapped to `isCorrect` before every call.
 */
export function summarizeSessions(rows: readonly SessionRow[]): SessionSummary[] {
  return rows.map((row) => {
    const all = row.answers.map((a) => ({ isCorrect: a.is_correct }));
    const noteToLetter = summarize(
      row.answers
        .filter((a) => a.exercise_type === EXERCISE_TYPE_NOTE_TO_LETTER)
        .map((a) => ({ isCorrect: a.is_correct })),
    );
    const letterToNote = summarize(
      row.answers
        .filter((a) => a.exercise_type === EXERCISE_TYPE_LETTER_TO_NOTE)
        .map((a) => ({ isCorrect: a.is_correct })),
    );
    return {
      id: row.id,
      startedAt: row.started_at,
      accuracyPct: summarize(all).accuracyPct,
      byType: {
        noteToLetter: { correct: noteToLetter.correct, incorrect: noteToLetter.incorrect },
        letterToNote: { correct: letterToNote.correct, incorrect: letterToNote.incorrect },
      },
    };
  });
}
