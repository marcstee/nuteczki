import { LINE_GAP, stepToY } from "@/components/staff/geometry";
import { needsLedgerLine, pitchToStaffStep, type Pitch } from "@/components/staff/pitch";
import { CLEF_FONT_UNITS_PER_EM, TREBLE_CLEF_PATH } from "@/components/staff/treble-clef";

interface Props {
  /** The single pitch to render on the treble staff. */
  note: Pitch;
  /** Passed to the root `<svg>` for Tailwind sizing/color (e.g. `w-48 text-slate-900`). */
  className?: string;
  /** Accessible name override; defaults to a positional description. */
  "aria-label"?: string;
}

/**
 * Horizontal layout, in viewBox units. These are presentation-only — the vertical /
 * musical geometry (line gap, baseline, step→Y) lives in `geometry.ts` so the
 * accuracy-critical chain stays in the pure core, never in the component.
 *
 * The viewBox reserves vertical room for the clef (which overhangs both the top and
 * bottom lines) and for one ledger line above (A5) and below (C4) the five-line staff.
 */
const VIEW_MIN_Y = 8;
const VIEW_HEIGHT = 98;
const VIEW_WIDTH = 120;
const STAFF_LEFT_X = 4;
const STAFF_RIGHT_X = 116;
const CLEF_LEFT_X = 10;
const NOTE_X = 80;
const NOTEHEAD_RX = 7.5;
const NOTEHEAD_RY = 6;
/** Slant of the filled notehead, degrees — the classic engraved tilt. */
const NOTEHEAD_TILT = -20;
const LEDGER_HALF_WIDTH = 11;
const STAFF_STROKE = 1;
const STEM_LENGTH = 36;
const STEM_STROKE = 1.6;
/** Inset so the stem sits flush with the notehead's side edge rather than floating. */
const STEM_INSET = 0.8;

/** The five staff lines as even staff steps, top (F5) down to bottom (E4). */
const STAFF_LINE_STEPS = [8, 6, 4, 2, 0] as const;

/** Middle line (B4); at or above it stems point down, below it they point up. */
const MIDDLE_LINE_STEP = 4;

/**
 * SMuFL gClef scale: one staff space (`LINE_GAP`) maps to `unitsPerEm / 4` font units,
 * so the glyph drawn at this scale matches the staff exactly. Applied with a Y-flip
 * (negative Y) because the font outline is Y-up and SVG is Y-down.
 */
const CLEF_SCALE = LINE_GAP / (CLEF_FONT_UNITS_PER_EM / 4);

/**
 * Renders a five-line treble staff with a single filled quarter note positioned by pitch,
 * across the beginner range C4 → A5. A pure function of props — no effects, no refs,
 * no client JS (SSR-safe, ships zero JS as a display-only island).
 *
 * Everything strokes/fills with `currentColor`, so a Tailwind `text-*` class on the
 * component themes the lines, clef, ledger, and notehead together. The notehead is
 * wrapped in `<g data-pitch>` — the stable hook S-02 will target for clickable answers.
 */
export default function Staff({ note, className, "aria-label": ariaLabel }: Props) {
  const step = pitchToStaffStep(note);
  const noteY = stepToY(step);
  const label = ariaLabel ?? `${note} on the treble staff`;
  const stemUp = step < MIDDLE_LINE_STEP;
  const stemX = stemUp ? NOTE_X + NOTEHEAD_RX - STEM_INSET : NOTE_X - NOTEHEAD_RX + STEM_INSET;

  return (
    <svg
      viewBox={`0 ${VIEW_MIN_Y} ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
      className={className}
      fill="none"
      stroke="currentColor"
    >
      {/* Five staff lines, E4 (bottom) to F5 (top). */}
      {STAFF_LINE_STEPS.map((lineStep) => {
        const y = stepToY(lineStep);
        return <line key={lineStep} x1={STAFF_LEFT_X} x2={STAFF_RIGHT_X} y1={y} y2={y} strokeWidth={STAFF_STROKE} />;
      })}

      {/* Treble clef: deterministic SMuFL transform — origin to the G4 line, scale to
          staff space, Y-flipped from the font's Y-up space. */}
      <path
        d={TREBLE_CLEF_PATH}
        transform={`translate(${CLEF_LEFT_X} ${stepToY(2)}) scale(${CLEF_SCALE} ${-CLEF_SCALE})`}
        fill="currentColor"
        stroke="none"
      />

      {/* Ledger line for C4 / A5 only, centered on the notehead. */}
      {needsLedgerLine(step) && (
        <line
          x1={NOTE_X - LEDGER_HALF_WIDTH}
          x2={NOTE_X + LEDGER_HALF_WIDTH}
          y1={noteY}
          y2={noteY}
          strokeWidth={STAFF_STROKE}
        />
      )}

      {/* Filled quarter note (slanted head + stem) — drawn last to overlay the lines.
          Stem points up below the middle line (B4), down on/above it, per standard
          engraving. The whole <g> is the stable, addressable hook S-02 will target. */}
      <g data-pitch={note}>
        <ellipse
          cx={NOTE_X}
          cy={noteY}
          rx={NOTEHEAD_RX}
          ry={NOTEHEAD_RY}
          fill="currentColor"
          stroke="none"
          transform={`rotate(${NOTEHEAD_TILT} ${NOTE_X} ${noteY})`}
        />
        <line
          x1={stemX}
          x2={stemX}
          y1={noteY}
          y2={stemUp ? noteY - STEM_LENGTH : noteY + STEM_LENGTH}
          strokeWidth={STEM_STROKE}
        />
      </g>
    </svg>
  );
}
