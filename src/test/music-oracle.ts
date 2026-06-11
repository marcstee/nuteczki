/**
 * Independent hand-written music-theory oracle for the 13 beginner-range pitches
 * (C4 → A5 on the treble clef). Values are derived from treble-clef theory, NOT
 * copied from the production lookup tables (STAFF_STEP, PITCH_LETTER) — importing
 * them would make any test a tautology. Both the pitch-position suite and the
 * exercise-winnability suite import from here.
 *
 * Geometry constants used for expectedY (cross-check against geometry.ts):
 *   BASELINE_Y = 80  (Y of E4, the bottom staff line)
 *   LINE_GAP   = 12  (distance between two adjacent lines)
 *   stepToY(s) = 80 − s × 6
 */

import type { Pitch } from "@/components/staff/pitch";
import type { Letter } from "@/components/drill/exercises";

export interface OracleRow {
  pitch: Pitch;
  /** Polish/German note name: scientific B4 → "H", all others first letter */
  letter: Letter;
  /** Integer staff step: E4 (bottom line) = 0, +1 per diatonic step upward */
  staffStep: number;
  /** SVG Y coordinate: BASELINE_Y(80) − staffStep × (LINE_GAP/2)(6) */
  expectedY: number;
  /** True when the step is even AND outside the five-line staff [0, 8] */
  ledger: boolean;
}

export const ORACLE: readonly OracleRow[] = [
  { pitch: "C4", letter: "C", staffStep: -2, expectedY: 92, ledger: true }, // middle C — first ledger line below staff
  { pitch: "D4", letter: "D", staffStep: -1, expectedY: 86, ledger: false }, // space below bottom line
  { pitch: "E4", letter: "E", staffStep: 0, expectedY: 80, ledger: false }, // bottom line
  { pitch: "F4", letter: "F", staffStep: 1, expectedY: 74, ledger: false }, // first space
  { pitch: "G4", letter: "G", staffStep: 2, expectedY: 68, ledger: false }, // second line
  { pitch: "A4", letter: "A", staffStep: 3, expectedY: 62, ledger: false }, // second space
  { pitch: "B4", letter: "H", staffStep: 4, expectedY: 56, ledger: false }, // third (middle) line — Polish/German "H"
  { pitch: "C5", letter: "C", staffStep: 5, expectedY: 50, ledger: false }, // third space
  { pitch: "D5", letter: "D", staffStep: 6, expectedY: 44, ledger: false }, // fourth line
  { pitch: "E5", letter: "E", staffStep: 7, expectedY: 38, ledger: false }, // top space (fourth space)
  { pitch: "F5", letter: "F", staffStep: 8, expectedY: 32, ledger: false }, // top line
  { pitch: "G5", letter: "G", staffStep: 9, expectedY: 26, ledger: false }, // space above top line
  { pitch: "A5", letter: "A", staffStep: 10, expectedY: 20, ledger: true }, // first ledger line above staff
];

/**
 * Mulberry32 seeded PRNG. Matches the `rng: () => number` signature expected by
 * buildSession. A fixed seed makes test failures reproducible from the seed alone.
 */
export function makePrng(seed: number): () => number {
  let s = seed;
  return function () {
    s += 0x6d2b79f5;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}
