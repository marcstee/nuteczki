/** Background persistence status for the just-finished session. */
export type SaveState = "saving" | "saved" | "error";

/** Correct / incorrect counts for one exercise type. */
interface TypeStats {
  correct: number;
  incorrect: number;
}

interface Props {
  /** Integer accuracy percentage (0–100) across both exercise types. */
  accuracyPct: number;
  /** Per-type correct/incorrect tallies (FR-008). */
  byType: {
    noteToLetter: TypeStats;
    letterToNote: TypeStats;
  };
  /** Restart the drill from the count-picker. */
  onAgain: () => void;
  /** Leave the drill — navigates to /dashboard. */
  onDone: () => void;
  /** Background save status; stats render regardless of its value. */
  saveState: SaveState;
  /** Re-run the batch save with the same payload/ids (idempotent). */
  onRetrySave: () => void;
}

/** One labeled correct/incorrect stat block for a single exercise type. */
function StatBlock({ label, stats }: { label: string; stats: TypeStats }) {
  return (
    <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-6">
      <p className="mb-3 text-center text-xs font-semibold tracking-wide text-blue-100/50 uppercase">{label}</p>
      <div className="flex justify-around">
        <div className="text-center">
          <div className="text-3xl font-bold text-green-400">{stats.correct}</div>
          <div className="text-sm text-blue-100/60">correct</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-red-400">{stats.incorrect}</div>
          <div className="text-sm text-blue-100/60">incorrect</div>
        </div>
      </div>
    </div>
  );
}

/**
 * End-of-session results: overall accuracy % plus a per-type correct/incorrect
 * breakdown — one block per exercise type (note→letter and letter→note, FR-008) —
 * and the two exit actions. The save status is a quiet indicator while
 * saving/saved; on `error` it shows a non-blocking message plus a "Retry save"
 * button. Stats are visible regardless of `saveState` — the results screen never
 * blocks on the network.
 */
export default function SessionResults({ accuracyPct, byType, onAgain, onDone, saveState, onRetrySave }: Props) {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-8">
      <h2 className="bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-3xl font-bold text-transparent">
        Session complete!
      </h2>

      <div className="flex w-full flex-col items-center gap-4">
        <div className="text-6xl font-bold text-white">{accuracyPct}%</div>
        <p className="text-sm font-medium text-blue-100/60">accuracy</p>
      </div>

      <div className="flex w-full flex-col gap-4">
        <StatBlock label="Note → letter" stats={byType.noteToLetter} />
        <StatBlock label="Letter → note" stats={byType.letterToNote} />
      </div>

      {saveState === "error" ? (
        <div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
          <p className="text-center text-sm text-amber-100">
            Couldn&apos;t save this session. Your results are safe here.
          </p>
          <button
            type="button"
            onClick={onRetrySave}
            className="h-11 rounded-lg bg-amber-400/90 px-6 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-300 active:scale-95"
          >
            Retry save
          </button>
        </div>
      ) : (
        <p className="text-sm font-medium text-blue-100/40">{saveState === "saved" ? "Saved" : "Saving…"}</p>
      )}

      <div className="flex w-full flex-col gap-3">
        <button
          type="button"
          onClick={onAgain}
          className="h-14 w-full rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-xl font-bold text-white transition-all hover:from-blue-400 hover:to-purple-400 active:scale-95"
        >
          Practice again
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-12 w-full rounded-xl border border-white/20 bg-white/10 text-lg font-medium text-white transition-colors hover:bg-white/20"
        >
          Done
        </button>
      </div>
    </div>
  );
}
