/**
 * Staff geometry — the step→Y half of the single source of musical truth.
 *
 * Pure and DOM-free, kept out of `Staff.tsx` so the entire pitch→step→Y chain is
 * unit-testable without rendering. Both the component and the clef transform consume
 * `stepToY`; no geometry arithmetic lives in the component.
 *
 * Coordinate model (SVG, Y grows downward): the bottom staff line E4 (step 0) sits at
 * `BASELINE_Y`; each +1 diatonic step moves up by half a line-gap. Even steps land on
 * lines, odd steps on spaces.
 */

/** Vertical distance between two adjacent staff lines, in viewBox units. */
export const LINE_GAP = 12;

/** Y of the bottom staff line E4 (step 0), in viewBox units. Everything else is relative to it. */
export const BASELINE_Y = 80;

/**
 * Pure: convert a staff step to its Y coordinate.
 *
 * `stepToY(0)` is the E4 (bottom-line) Y, `stepToY(2)` the G4-line Y, and each +1 step
 * moves up (smaller Y) by exactly `LINE_GAP / 2`.
 */
export function stepToY(step: number): number {
  return BASELINE_Y - step * (LINE_GAP / 2);
}
