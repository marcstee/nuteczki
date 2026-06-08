/**
 * Pitch domain — the single source of musical truth for the staff renderer.
 *
 * Pure and render-free: maps each beginner-range pitch (C4 → A5) to its integer
 * position on the treble staff, with no SVG/pixel concern. Decoupled this way so
 * the whole mapping can be unit-tested later without a DOM.
 *
 * Scientific pitch names only (B4, never H4). The H-vs-B convention is a labeling
 * concern owned by the exercise UI (S-01/S-02), not the positional renderer.
 */

/**
 * The 13 diatonic pitches of the fixed beginner range, ascending C4 → A5
 * (one ledger line below the staff to one ledger line above).
 */
export type Pitch = "C4" | "D4" | "E4" | "F4" | "G4" | "A4" | "B4" | "C5" | "D5" | "E5" | "F5" | "G5" | "A5";

/** The 13 beginner-range pitches in ascending order (drives the gallery and future answer pools). */
export const PITCHES: readonly Pitch[] = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5", "E5", "F5", "G5", "A5"];

/**
 * Staff step for each pitch: E4 (the bottom line) = 0, +1 per diatonic step up.
 * Even steps land on lines, odd steps on spaces. These values are the load-bearing
 * musical contract — a wrong value is a musically wrong note — so this is a row-by-row
 * lookup (auditable against the reference table), never arithmetic on the pitch string.
 */
const STAFF_STEP: Record<Pitch, number> = {
  C4: -2, // ledger line below staff (middle C)
  D4: -1, // space below bottom line
  E4: 0, //  bottom line
  F4: 1, //  1st space
  G4: 2, //  2nd line
  A4: 3, //  2nd space
  B4: 4, //  middle line
  C5: 5, //  3rd space
  D5: 6, //  4th line
  E5: 7, //  top space
  F5: 8, //  top line
  G5: 9, //  space above top line
  A5: 10, // ledger line above staff
};

/** Pure: the integer staff step for a pitch (E4 = 0, +1 per diatonic step up). */
export function pitchToStaffStep(pitch: Pitch): number {
  return STAFF_STEP[pitch];
}

/**
 * Pure: whether a note at this staff step needs a ledger line.
 *
 * A ledger line is needed exactly when the step falls on a line position (even)
 * that lies outside the five-line staff `[0, 8]`. Across the beginner range that
 * is C4 (−2) and A5 (10) only; D4 (−1) and G5 (9) sit in the adjacent spaces and
 * need none.
 */
export function needsLedgerLine(step: number): boolean {
  return step % 2 === 0 && (step < 0 || step > 8);
}
