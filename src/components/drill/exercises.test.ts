import { describe, it, expect } from "vitest";
import { ORACLE, makePrng } from "@/test/music-oracle";
import type { OracleRow } from "@/test/music-oracle";
import {
  buildSession,
  LETTERS,
  EMPTY_WEIGHTS,
  EXERCISE_TYPE_NOTE_TO_LETTER,
  EXERCISE_TYPE_LETTER_TO_NOTE,
  summarize,
  summarizeByType,
} from "@/components/drill/exercises";
import { PITCHES } from "@/components/staff/pitch";
import type { AnswerRecord, NoteWeights } from "@/components/drill/exercises";
import type { Pitch } from "@/components/staff/pitch";

// O(1) oracle lookup keyed by pitch
const oracleMap = new Map(ORACLE.map((row) => [row.pitch, row]));

// Throws rather than returning undefined — eliminates non-null assertions in test assertions
function oracle(pitch: Pitch): OracleRow {
  const row = oracleMap.get(pitch);
  if (row === undefined) throw new Error(`Missing oracle entry for pitch "${pitch}"`);
  return row;
}

/**
 * Generates a flat list of exercises across all three session sizes.
 * 20×5 + 20×10 + 35×20 = 100+200+700 = 1000 exercises.
 * Each session gets its own PRNG state so the output is reproducible from baseSeed.
 */
function generateSample(weights: NoteWeights, baseSeed = 0x1234_5678) {
  const all: ReturnType<typeof buildSession> = [];
  let seed = baseSeed;
  for (let i = 0; i < 20; i++) all.push(...buildSession(5, weights, makePrng(seed++)));
  for (let i = 0; i < 20; i++) all.push(...buildSession(10, weights, makePrng(seed++)));
  for (let i = 0; i < 35; i++) all.push(...buildSession(20, weights, makePrng(seed++)));
  return all;
}

describe("exercise winnability (empty weights)", () => {
  const sample = generateSample(EMPTY_WEIGHTS);

  it("sample is exactly 1000 exercises across counts {5, 10, 20}", () => {
    expect(sample).toHaveLength(1000);
  });

  // note_to_letter: implicit 7-button option set is always answerable
  it("note_to_letter: oracle letter is in LETTERS for every pitch", () => {
    for (const ex of sample) {
      if (ex.type !== EXERCISE_TYPE_NOTE_TO_LETTER) continue;
      expect(LETTERS).toContain(oracle(ex.pitch).letter);
    }
  });

  // letter_to_note: option-shape invariants
  it("letter_to_note: options has exactly 3 pitches", () => {
    for (const ex of sample) {
      if (ex.type !== EXERCISE_TYPE_LETTER_TO_NOTE) continue;
      expect(ex.options).toHaveLength(3);
    }
  });

  it("letter_to_note: 3 distinct pitches in options", () => {
    for (const ex of sample) {
      if (ex.type !== EXERCISE_TYPE_LETTER_TO_NOTE) continue;
      expect(new Set(ex.options).size).toBe(3);
    }
  });

  it("letter_to_note: 3 distinct oracle letters in options", () => {
    for (const ex of sample) {
      if (ex.type !== EXERCISE_TYPE_LETTER_TO_NOTE) continue;
      const letters = ex.options.map((p) => oracle(p).letter);
      expect(new Set(letters).size).toBe(3);
    }
  });

  // letter_to_note: winnability — correct answer is present and unique
  it("letter_to_note: targetPitch is always in options", () => {
    for (const ex of sample) {
      if (ex.type !== EXERCISE_TYPE_LETTER_TO_NOTE) continue;
      expect(ex.options).toContain(ex.targetPitch);
    }
  });

  it("letter_to_note: exactly one option has oracle letter === promptLetter", () => {
    for (const ex of sample) {
      if (ex.type !== EXERCISE_TYPE_LETTER_TO_NOTE) continue;
      const matching = ex.options.filter((p) => oracle(p).letter === ex.promptLetter);
      expect(matching, `expected exactly 1 correct option for prompt ${ex.promptLetter}`).toHaveLength(1);
    }
  });

  it("letter_to_note: promptLetter equals oracle letter of targetPitch (prompt↔target consistency)", () => {
    for (const ex of sample) {
      if (ex.type !== EXERCISE_TYPE_LETTER_TO_NOTE) continue;
      expect(ex.promptLetter).toBe(oracle(ex.targetPitch).letter);
    }
  });

  // Coverage: every one of the 13 in-range pitches was targeted at least once
  it("coverage: all 13 pitches appear as targets across the sample", () => {
    const seen = new Set<string>();
    for (const ex of sample) {
      if (ex.type === EXERCISE_TYPE_NOTE_TO_LETTER) seen.add(ex.pitch);
      else seen.add(ex.targetPitch);
    }
    for (const pitch of PITCHES) {
      expect(seen.has(pitch), `pitch ${pitch} was never generated`).toBe(true);
    }
  });
});

describe("exercise winnability (non-empty weights)", () => {
  // Heavy bias toward B4; verifies weighting shifts probability but not winnability
  const heavyWeights: NoteWeights = {
    [EXERCISE_TYPE_NOTE_TO_LETTER]: { B4: 100 },
    [EXERCISE_TYPE_LETTER_TO_NOTE]: { B4: 100 },
  };
  const sample = generateSample(heavyWeights, 0x9876_5432);

  it("note_to_letter: oracle letter still in LETTERS under heavy weighting", () => {
    for (const ex of sample) {
      if (ex.type !== EXERCISE_TYPE_NOTE_TO_LETTER) continue;
      expect(LETTERS).toContain(oracle(ex.pitch).letter);
    }
  });

  it("letter_to_note: all winnability invariants hold under heavy weighting", () => {
    for (const ex of sample) {
      if (ex.type !== EXERCISE_TYPE_LETTER_TO_NOTE) continue;
      expect(ex.options).toHaveLength(3);
      expect(new Set(ex.options).size).toBe(3);
      expect(ex.options).toContain(ex.targetPitch);
      const matching = ex.options.filter((p) => oracle(p).letter === ex.promptLetter);
      expect(matching).toHaveLength(1);
      expect(ex.promptLetter).toBe(oracle(ex.targetPitch).letter);
    }
  });
});

// ─── Risk #4: summarize and summarizeByType ───────────────────────────────────
// Oracle values are hand-counted from the fixed answer sequences below — never
// recomputed from the same reduce the production code uses (anti-tautology, §6.1).

describe("summarize", () => {
  it("counts correct/incorrect, total, and 75% accuracy for a 4-answer mixed sequence", () => {
    // Hand-count: 3 correct out of 4 → pct = Math.round(3/4 * 100) = 75
    const answers = [{ isCorrect: true }, { isCorrect: false }, { isCorrect: true }, { isCorrect: true }];
    expect(summarize(answers)).toEqual({ correct: 3, incorrect: 1, total: 4, accuracyPct: 75 });
  });

  it("returns all zeros for an empty session (no divide-by-zero crash)", () => {
    expect(summarize([])).toEqual({ correct: 0, incorrect: 0, total: 0, accuracyPct: 0 });
  });

  it("rounds 1/3 correct down to 33%", () => {
    // Hand-count: 1 correct out of 3 → Math.round(33.333…) = 33
    const answers = [{ isCorrect: true }, { isCorrect: false }, { isCorrect: false }];
    expect(summarize(answers)).toEqual({ correct: 1, incorrect: 2, total: 3, accuracyPct: 33 });
  });

  it("rounds 2/3 correct up to 67%", () => {
    // Hand-count: 2 correct out of 3 → Math.round(66.666…) = 67
    const answers = [{ isCorrect: true }, { isCorrect: true }, { isCorrect: false }];
    expect(summarize(answers)).toEqual({ correct: 2, incorrect: 1, total: 3, accuracyPct: 67 });
  });
});

describe("summarizeByType", () => {
  // Fixed answer sequence: 3 note_to_letter (2 correct, 1 wrong) + 3 letter_to_note (1 correct, 2 wrong)
  // Hand-counted per-type oracles:
  //   note_to_letter: correct=2, incorrect=1, total=3, pct=Math.round(2/3*100)=67
  //   letter_to_note: correct=1, incorrect=2, total=3, pct=Math.round(1/3*100)=33
  const ntlCorrect: AnswerRecord = {
    exerciseType: EXERCISE_TYPE_NOTE_TO_LETTER,
    note: "C4",
    chosenLetter: "C",
    isCorrect: true,
  };
  const ntlCorrect2: AnswerRecord = {
    exerciseType: EXERCISE_TYPE_NOTE_TO_LETTER,
    note: "D4",
    chosenLetter: "D",
    isCorrect: true,
  };
  const ntlWrong: AnswerRecord = {
    exerciseType: EXERCISE_TYPE_NOTE_TO_LETTER,
    note: "E4",
    chosenLetter: "D",
    isCorrect: false,
  };
  const ltnCorrect: AnswerRecord = {
    exerciseType: EXERCISE_TYPE_LETTER_TO_NOTE,
    note: "F4",
    chosenPitch: "F4",
    isCorrect: true,
  };
  const ltnWrong: AnswerRecord = {
    exerciseType: EXERCISE_TYPE_LETTER_TO_NOTE,
    note: "G4",
    chosenPitch: "A4",
    isCorrect: false,
  };
  const ltnWrong2: AnswerRecord = {
    exerciseType: EXERCISE_TYPE_LETTER_TO_NOTE,
    note: "A4",
    chosenPitch: "C4",
    isCorrect: false,
  };

  const mixed = [ntlCorrect, ntlCorrect2, ntlWrong, ltnCorrect, ltnWrong, ltnWrong2];

  it("note_to_letter breakdown: 2 correct, 1 incorrect, 67% accuracy", () => {
    const result = summarizeByType(mixed);
    expect(result[EXERCISE_TYPE_NOTE_TO_LETTER]).toEqual({ correct: 2, incorrect: 1, total: 3, accuracyPct: 67 });
  });

  it("letter_to_note breakdown: 1 correct, 2 incorrect, 33% accuracy", () => {
    const result = summarizeByType(mixed);
    expect(result[EXERCISE_TYPE_LETTER_TO_NOTE]).toEqual({ correct: 1, incorrect: 2, total: 3, accuracyPct: 33 });
  });

  it("returns all zeros for both types on an empty session", () => {
    const result = summarizeByType([]);
    expect(result[EXERCISE_TYPE_NOTE_TO_LETTER]).toEqual({ correct: 0, incorrect: 0, total: 0, accuracyPct: 0 });
    expect(result[EXERCISE_TYPE_LETTER_TO_NOTE]).toEqual({ correct: 0, incorrect: 0, total: 0, accuracyPct: 0 });
  });

  it("zeroes the absent type when all answers are one type", () => {
    // Only note_to_letter answers — letter_to_note should be all zeros
    const ntlOnly = [ntlCorrect, ntlWrong];
    const result = summarizeByType(ntlOnly);
    expect(result[EXERCISE_TYPE_NOTE_TO_LETTER]).toEqual({ correct: 1, incorrect: 1, total: 2, accuracyPct: 50 });
    expect(result[EXERCISE_TYPE_LETTER_TO_NOTE]).toEqual({ correct: 0, incorrect: 0, total: 0, accuracyPct: 0 });
  });
});
