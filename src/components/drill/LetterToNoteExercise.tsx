import Staff from "@/components/staff/Staff";
import type { Pitch } from "@/components/staff/pitch";
import { type Letter, pitchToLetter } from "@/components/drill/exercises";

interface Props {
  /** The letter the child must find among the staff options (`pitchToLetter` value). */
  promptLetter: Letter;
  /** The 3 candidate pitches in display order; exactly one matches `promptLetter`. */
  options: readonly Pitch[];
  /** True once the child has tapped a card — locks the cards and reveals feedback. */
  answered: boolean;
  /** The pitch the child tapped, or `null` before answering. */
  chosenPitch: Pitch | null;
  /** Called with the tapped pitch while still unanswered. */
  onAnswer: (pitch: Pitch) => void;
  /** Called by the "Next" control to advance to the next exercise. */
  onNext: () => void;
  /** 0-based position in the session, for the "Exercise i of total" cue. */
  progress: { index: number; total: number };
}

/**
 * One letter→note exercise: a large prompt letter with a "Find this note" caption
 * and 3 staff option cards. Before answering, every card is tappable. After a tap
 * the cards lock; the matching-letter card (`pitchToLetter(option) === promptLetter`)
 * turns green, a wrong pick turns red, the rest dim, a ✓/✗ cue appears, and a large
 * child-sized "Next" control advances the session. Declarative and feedback-only —
 * all scoring lives in the orchestrator. Mirrors `NoteToLetterExercise`'s house style.
 */
export default function LetterToNoteExercise({
  promptLetter,
  options,
  answered,
  chosenPitch,
  onAnswer,
  onNext,
  progress,
}: Props) {
  const isCorrect = answered && chosenPitch !== null && pitchToLetter(chosenPitch) === promptLetter;

  return (
    <div className="flex max-h-[calc(100dvh_-_2rem)] w-full max-w-[var(--drill-shell-max)] flex-col items-center gap-[var(--drill-gap)] overflow-y-auto">
      <p className="text-muted-foreground shrink-0 text-sm font-medium">
        Ćwiczenie {progress.index + 1} z {progress.total}
      </p>

      <div className="flex shrink-0 flex-col items-center gap-2">
        <p className="text-muted-foreground text-[length:var(--drill-caption-text)] font-medium">Znajdź tę nutkę</p>
        <div className="text-primary text-[length:var(--drill-prompt-text)] font-bold">{promptLetter}</div>
      </div>

      {/* flex row (not grid) so the cards stretch to the row's shrunk height in
          landscape; `min-h-0` here + `max-h-full` on each staff lets this be the
          row that gives when the column exceeds the viewport. flex-1 keeps the
          three cards equal-width, identical to the prior grid-cols-3 in portrait. */}
      <div className="flex min-h-0 w-full gap-3">
        {options.map((option) => {
          const isAnswerOption = pitchToLetter(option) === promptLetter;
          const isWrongPick = answered && option === chosenPitch && !isAnswerOption;

          // Keep the card interior white "paper" so the currentColor staff stays
          // legible; signal state with a thick border/ring and dim the rest.
          let stateClasses = "border-transparent hover:scale-[1.02] active:scale-95";
          if (answered) {
            if (isAnswerOption) {
              stateClasses = "border-success ring-4 ring-success/40";
            } else if (isWrongPick) {
              stateClasses = "border-destructive ring-4 ring-destructive/40";
            } else {
              stateClasses = "border-transparent opacity-40";
            }
          }

          return (
            <button
              key={option}
              type="button"
              disabled={answered}
              onClick={() => {
                onAnswer(option);
              }}
              className={`flex min-h-0 min-w-0 flex-1 items-center justify-center rounded-2xl border-4 bg-white p-3 text-slate-900 shadow-lg transition-all disabled:pointer-events-none ${stateClasses}`}
            >
              <Staff note={option} className="max-h-full w-full" />
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="flex w-full shrink-0 flex-col items-center gap-[var(--drill-gap-sm)]">
          <p
            className={`text-[length:var(--drill-feedback-text)] font-bold ${isCorrect ? "text-success" : "text-destructive"}`}
          >
            {isCorrect ? "✓ Brawo!" : "✗ Prawie!"}
          </p>
          <button
            type="button"
            onClick={onNext}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-[var(--drill-action-h)] w-full rounded-2xl text-xl font-bold transition-all active:scale-95"
          >
            Dalej
          </button>
        </div>
      )}
    </div>
  );
}
