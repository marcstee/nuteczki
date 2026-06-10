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
    <div className="border-border bg-card w-full rounded-2xl border p-6">
      <p className="text-muted-foreground mb-3 text-center text-xs font-semibold tracking-wide uppercase">{label}</p>
      <div className="flex justify-around">
        <div className="text-center">
          <div className="text-success text-3xl font-bold">{stats.correct}</div>
          <div className="text-muted-foreground text-sm">poprawne</div>
        </div>
        <div className="text-center">
          <div className="text-destructive text-3xl font-bold">{stats.incorrect}</div>
          <div className="text-muted-foreground text-sm">błędne</div>
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
    <div className="flex w-full max-w-[var(--drill-shell-max)] flex-col items-center gap-8">
      <img
        src="/mascot.webp"
        alt="Maskotka Nuteczek świętuje ukończoną sesję"
        width="160"
        height="160"
        className="h-28 w-28"
      />
      <h2 className="text-foreground text-3xl font-bold">Koniec sesji!</h2>

      <div className="flex w-full flex-col items-center gap-4">
        <div className="text-primary text-6xl font-bold">{accuracyPct}%</div>
        <p className="text-muted-foreground text-sm font-medium">celność</p>
      </div>

      <div className="flex w-full flex-col gap-4">
        <StatBlock label="Nuta → litera" stats={byType.noteToLetter} />
        <StatBlock label="Litera → nuta" stats={byType.letterToNote} />
      </div>

      {saveState === "error" ? (
        <div className="border-destructive/30 bg-destructive/10 flex w-full flex-col items-center gap-3 rounded-2xl border p-4">
          <p className="text-foreground text-center text-sm">
            Ups! Nie udało się zapisać tej sesji. Twoje wyniki są tutaj bezpieczne.
          </p>
          <button
            type="button"
            onClick={onRetrySave}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/90 h-11 rounded-xl px-6 text-sm font-semibold transition-colors active:scale-95"
          >
            Ponów zapis
          </button>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm font-medium">
          {saveState === "saved" ? "Zapisano" : "Zapisywanie…"}
        </p>
      )}

      <div className="flex w-full flex-col gap-3">
        <button
          type="button"
          onClick={onAgain}
          className="bg-primary text-primary-foreground hover:bg-primary/90 h-[var(--drill-action-h)] w-full rounded-2xl text-xl font-bold transition-all active:scale-95"
        >
          Jeszcze raz
        </button>
        <button
          type="button"
          onClick={onDone}
          className="border-border bg-card text-foreground hover:bg-muted h-[var(--drill-action-h)] w-full rounded-2xl border text-lg font-medium transition-colors"
        >
          Gotowe
        </button>
      </div>
    </div>
  );
}
