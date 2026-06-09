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
 * The `answers.exercise_type` CHECK value for the second drill type (S-02), where
 * the child sees a letter and picks the matching note. Shared by the UI and the
 * DB write, mirroring the note→letter constant.
 */
export const EXERCISE_TYPE_LETTER_TO_NOTE = "letter_to_note";

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
 * One generated exercise in a built session, discriminated on `type`.
 *
 * - note→letter: the child reads `pitch` on the staff and names its letter.
 * - letter→note: the child reads `promptLetter` and taps the matching note among
 *   `options` (3 candidate pitches in display order). `options` contains
 *   `targetPitch` plus two distractors whose letters are distinct from
 *   `promptLetter` and from each other, so exactly one option satisfies
 *   `pitchToLetter(option) === promptLetter`.
 */
export type Exercise =
  | { type: typeof EXERCISE_TYPE_NOTE_TO_LETTER; pitch: Pitch }
  | {
      type: typeof EXERCISE_TYPE_LETTER_TO_NOTE;
      promptLetter: Letter;
      targetPitch: Pitch;
      options: readonly Pitch[];
    };

/**
 * One answered exercise held in island state, shared by the playable loop (P2)
 * and the save payload. Discriminated on `exerciseType`; both members carry the
 * three fields the save path reads (`exerciseType`, `note`, `isCorrect`). For
 * letter→note, `note` is the **target** pitch (the drilled note), keeping
 * `answers.note` a clean per-note signal. `chosenLetter`/`chosenPitch` are
 * in-memory feedback only and are never persisted.
 */
export type AnswerRecord =
  | {
      exerciseType: typeof EXERCISE_TYPE_NOTE_TO_LETTER;
      note: Pitch;
      chosenLetter: Letter;
      isCorrect: boolean;
    }
  | {
      exerciseType: typeof EXERCISE_TYPE_LETTER_TO_NOTE;
      note: Pitch;
      chosenPitch: Pitch;
      isCorrect: boolean;
    };

/** Pure given `rng`: a new Fisher-Yates–shuffled copy of `items`. */
function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Pure given `rng`: the 3 shuffled option pitches for a letter→note exercise —
 * `targetPitch` plus two distractors whose letters are distinct from the prompt
 * letter and from each other. Exactly one option satisfies
 * `pitchToLetter(option) === pitchToLetter(targetPitch)`. This single-correct-
 * option invariant is accuracy-critical (a second option sharing the prompt
 * letter would make a correct answer look wrong) — kept in one place on purpose.
 */
function letterToNoteOptions(targetPitch: Pitch, rng: () => number): readonly Pitch[] {
  const promptLetter = pitchToLetter(targetPitch);
  const distractorLetters = shuffle(
    LETTERS.filter((letter) => letter !== promptLetter),
    rng,
  ).slice(0, 2);
  const distractors = distractorLetters.map((letter) => {
    const pool = PITCHES.filter((pitch) => pitchToLetter(pitch) === letter);
    return pool[Math.floor(rng() * pool.length)];
  });
  return shuffle([targetPitch, ...distractors], rng);
}

/**
 * Pure given `rng`: a full balanced, shuffled session of exactly `count`
 * exercises — `ceil(count/2)` note→letter and `floor(count/2)` letter→note (odd
 * counts lean note→letter, the established type) — interleaved into one ordered
 * deck where **no two consecutive exercises share the same target note** (the
 * displayed pitch for note→letter, the `targetPitch` for letter→note). Each
 * letter→note exercise derives its prompt letter from the target pitch and gets
 * distinct-letter distractors via `letterToNoteOptions`.
 *
 * Pre-build this once in an event handler (never in render) so the deck is
 * stable across renders — the same discipline the stable save-ids follow.
 */
export function buildSession(count: 5 | 10 | 20, rng: () => number = Math.random): Exercise[] {
  const noteToLetterCount = Math.ceil(count / 2);
  const letterToNoteCount = Math.floor(count / 2);

  const types: (typeof EXERCISE_TYPE_NOTE_TO_LETTER | typeof EXERCISE_TYPE_LETTER_TO_NOTE)[] = [];
  for (let i = 0; i < noteToLetterCount; i++) types.push(EXERCISE_TYPE_NOTE_TO_LETTER);
  for (let i = 0; i < letterToNoteCount; i++) types.push(EXERCISE_TYPE_LETTER_TO_NOTE);

  const exercises: Exercise[] = [];
  let previousTarget: Pitch | null = null;
  for (const type of shuffle(types, rng)) {
    const targetPitch = nextPitch(previousTarget, rng);
    if (type === EXERCISE_TYPE_NOTE_TO_LETTER) {
      exercises.push({ type, pitch: targetPitch });
    } else {
      exercises.push({
        type,
        promptLetter: pitchToLetter(targetPitch),
        targetPitch,
        options: letterToNoteOptions(targetPitch, rng),
      });
    }
    previousTarget = targetPitch;
  }
  return exercises;
}
