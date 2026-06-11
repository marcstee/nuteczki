import { describe, it, expect } from "vitest";
import { PITCHES, pitchToStaffStep, needsLedgerLine } from "@/components/staff/pitch";
import { stepToY } from "@/components/staff/geometry";
import { ORACLE } from "@/test/music-oracle";

describe("pitchToStaffStep", () => {
  it("maps every beginner-range pitch to its correct treble-clef staff step", () => {
    for (const row of ORACLE) {
      expect(pitchToStaffStep(row.pitch), `staff step for ${row.pitch}`).toBe(row.staffStep);
    }
  });
});

describe("stepToY", () => {
  it("maps every staff step to the correct SVG Y coordinate", () => {
    for (const row of ORACLE) {
      const step = pitchToStaffStep(row.pitch);
      expect(stepToY(step), `Y for ${row.pitch} (step ${step})`).toBe(row.expectedY);
    }
  });

  it("is strictly decreasing across ascending pitches (higher pitch = smaller Y)", () => {
    const ys = PITCHES.map((p) => stepToY(pitchToStaffStep(p)));
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i], `Y(${PITCHES[i]}) must be less than Y(${PITCHES[i - 1]})`).toBeLessThan(ys[i - 1]);
    }
  });

  it("line/space parity: even step = line position, odd step = space position", () => {
    // Lines: C4, E4, G4, B4, D5, F5, A5 (including ledger-line positions)
    const LINE_PITCHES = new Set(["C4", "E4", "G4", "B4", "D5", "F5", "A5"]);
    for (const row of ORACLE) {
      const step = pitchToStaffStep(row.pitch);
      const isLine = LINE_PITCHES.has(row.pitch);
      expect(step % 2 === 0, `${row.pitch} step-parity / line check`).toBe(isLine);
    }
  });
});

describe("needsLedgerLine", () => {
  it("is true exactly for C4 (step −2) and A5 (step 10), false for the other 11", () => {
    for (const row of ORACLE) {
      const step = pitchToStaffStep(row.pitch);
      expect(needsLedgerLine(step), `ledger for ${row.pitch} (step ${step})`).toBe(row.ledger);
    }
  });
});
