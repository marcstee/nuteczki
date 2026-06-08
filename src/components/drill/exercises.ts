/**
 * Drill domain core — the single source of musical/domain truth for the
 * note→letter drill.
 *
 * Pure and render-free: holds the 7-letter answer alphabet, the pitch→letter
 * mapping (including the Polish/German `B4`→`H` label), random next-pitch
 * selection (no back-to-back repeats), and session-stats computation. No React,
 * no DOM, no network — decoupled this way so the accuracy-critical pieces can be
 * audited and unit-tested later without a runner, mirroring `staff/pitch.ts`.
 *
 * The H-vs-B labeling lives here on purpose: the staff renderer stays scientific
 * (`B4`, never `H4`); naming the answer button is this module's job (S-01).
 */

import { type Pitch, PITCHES } from "@/components/staff/pitch";

/** The 7 answer letters. Polish/German naming: scientific `B` is labeled `H`. */
export type Letter = "C" | "D" | "E" | "F" | "G" | "A" | "H";

/** The 7 answer letters in button display order (FR-004). */
export const LETTERS: readonly Letter[] = ["C", "D", "E", "F", "G", "A", "H"];

/**
 * The `answers.exercise_type` CHECK value for this drill. Shared by the UI and
 * the DB write so the constant has exactly one definition.
 */
export const EXERCISE_TYPE_NOTE_TO_LETTER = "note_to_letter";

/**
 * Pitch → answer letter. Scientific `B4` maps to the `H` button; every other
 * pitch maps to its first character. This is the lone musical-domain mapping
 * S-01 owns, and a wrong entry is the equivalent of a wrong note — so it is a
 * row-by-row lookup (auditable against the 7 buttons), never string slicing.
 */
const PITCH_LETTER: Record<Pitch, Letter> = {
  C4: "C",
  D4: "D",
  E4: "E",
  F4: "F",
  G4: "G",
  A4: "A",
  B4: "H", // Polish/German labeling — the one place B becomes H
  C5: "C",
  D5: "D",
  E5: "E",
  F5: "F",
  G5: "G",
  A5: "A",
};

/** Pure: the answer letter for a pitch (`B4`→`H`, otherwise the first letter). */
export function pitchToLetter(pitch: Pitch): Letter {
  return PITCH_LETTER[pitch];
}

/**
 * Pure given `rng`: a uniformly random pitch from `PITCHES`, excluding
 * `previous` when non-null so no two consecutive exercises repeat the same note.
 * `rng` defaults to `Math.random` and is injectable for deterministic tests.
 */
export function nextPitch(previous: Pitch | null, rng: () => number = Math.random): Pitch {
  const pool = previous === null ? PITCHES : PITCHES.filter((p) => p !== previous);
  const index = Math.floor(rng() * pool.length);
  return pool[index];
}

/**
 * Pure: tally a set of answers into correct / incorrect / total counts plus an
 * integer accuracy percentage (`0` when there are no answers).
 */
export function summarize(answers: readonly { isCorrect: boolean }[]): {
  correct: number;
  incorrect: number;
  total: number;
  accuracyPct: number;
} {
  const total = answers.length;
  const correct = answers.reduce((n, a) => (a.isCorrect ? n + 1 : n), 0);
  const incorrect = total - correct;
  const accuracyPct = total === 0 ? 0 : Math.round((correct / total) * 100);
  return { correct, incorrect, total, accuracyPct };
}

/**
 * One answered exercise held in island state, shared by the playable loop (P2)
 * and the save payload (P3).
 */
export interface AnswerRecord {
  note: Pitch;
  chosenLetter: Letter;
  isCorrect: boolean;
  exerciseType: typeof EXERCISE_TYPE_NOTE_TO_LETTER;
}
