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
 * Per-`(exercise_type, note)` error counts that bias target-pitch selection
 * toward the notes a child misses most (S-03 / FR-003). Keyed by exercise type;
 * each value maps a subset of `Pitch` to its raw `error_count` from the
 * `note_error_stats` view (a non-negative integer). An absent pitch means "no
 * recorded errors" and is treated as count `0` by the weighted picker.
 *
 * Deliberately a plain JSON-serializable object (no `Map`): `drill.astro` builds
 * it server-side and passes it across the Astro→React island boundary as a prop,
 * which JSON-serializes.
 */
export type NoteWeights = Record<
  typeof EXERCISE_TYPE_NOTE_TO_LETTER | typeof EXERCISE_TYPE_LETTER_TO_NOTE,
  Partial<Record<Pitch, number>>
>;

/**
 * The canonical empty weights value — no recorded errors for either type. This is
 * the default for `buildSession` and the cold-start / graceful-fallback path:
 * with it, every note collapses to the `+1` baseline weight, so the weighted draw
 * is exactly uniform and selection reproduces today's behavior.
 */
export const EMPTY_WEIGHTS: NoteWeights = {
  [EXERCISE_TYPE_NOTE_TO_LETTER]: {},
  [EXERCISE_TYPE_LETTER_TO_NOTE]: {},
};

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
 * Pure given `rng`: a pitch from `PITCHES` drawn in proportion to
 * `error_count + 1` for each candidate, excluding `previous` when non-null so no
 * two consecutive exercises repeat the same note. The `+1` baseline is applied
 * across the **full** pool (every in-range pitch is a candidate with weight ≥ 1),
 * not only over pitches present in `errorCounts` — so a mastered note never drops
 * to zero probability, and an empty/all-zero `errorCounts` yields an exactly
 * uniform draw. This is the single implementation of the pitch draw; `nextPitch`
 * is the uniform special case. `rng` defaults to `Math.random` and is injectable.
 */
export function weightedNextPitch(
  previous: Pitch | null,
  errorCounts: Partial<Record<Pitch, number>>,
  rng: () => number = Math.random,
): Pitch {
  const pool = previous === null ? PITCHES : PITCHES.filter((p) => p !== previous);
  const weights = pool.map((p) => (errorCounts[p] ?? 0) + 1);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let r = rng() * totalWeight;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1]; // float-rounding safety: `r` exhausted the walk
}

/**
 * Pure given `rng`: a uniformly random pitch from `PITCHES`, excluding
 * `previous` when non-null so no two consecutive exercises repeat the same note.
 * The uniform draw is `weightedNextPitch` with empty weights (every candidate at
 * the `+1` baseline); this named wrapper keeps the random-slot call site
 * self-documenting. `rng` defaults to `Math.random` and is injectable for tests.
 */
export function nextPitch(previous: Pitch | null, rng: () => number = Math.random): Pitch {
  return weightedNextPitch(previous, {}, rng);
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
 * Target-pitch selection is adaptive (S-03 / FR-003): exactly `round(0.7×count)`
 * slots are "weighted" and draw their pitch in proportion to `error_count + 1`
 * from `weights` (per exercise type), biasing toward recently-missed notes; the
 * remaining slots stay uniform. The weighted/random designation is shuffled
 * independently of the type deck, so it correlates with neither position nor
 * type. With the default `EMPTY_WEIGHTS` every weight is the `+1` baseline, so
 * both paths are the same uniform draw and the deck is distributionally identical
 * to the pre-S-03 behavior — making this inert until real weights are supplied.
 *
 * Pre-build this once in an event handler (never in render) so the deck is
 * stable across renders — the same discipline the stable save-ids follow.
 */
export function buildSession(
  count: 5 | 10 | 20,
  weights: NoteWeights = EMPTY_WEIGHTS,
  rng: () => number = Math.random,
): Exercise[] {
  const noteToLetterCount = Math.ceil(count / 2);
  const letterToNoteCount = Math.floor(count / 2);

  const types: (typeof EXERCISE_TYPE_NOTE_TO_LETTER | typeof EXERCISE_TYPE_LETTER_TO_NOTE)[] = [];
  for (let i = 0; i < noteToLetterCount; i++) types.push(EXERCISE_TYPE_NOTE_TO_LETTER);
  for (let i = 0; i < letterToNoteCount; i++) types.push(EXERCISE_TYPE_LETTER_TO_NOTE);

  // Designate ~70% of slots as weighted, shuffled so the bias does not correlate
  // with deck position or exercise type. Type order is shuffled independently.
  const weightedCount = Math.round(0.7 * count);
  const weightedSlots = shuffle(
    Array.from({ length: count }, (_, i) => i < weightedCount),
    rng,
  );
  const shuffledTypes = shuffle(types, rng);

  const exercises: Exercise[] = [];
  let previousTarget: Pitch | null = null;
  for (let slot = 0; slot < shuffledTypes.length; slot++) {
    const type = shuffledTypes[slot];
    const targetPitch: Pitch = weightedSlots[slot]
      ? weightedNextPitch(previousTarget, weights[type], rng)
      : nextPitch(previousTarget, rng);
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
