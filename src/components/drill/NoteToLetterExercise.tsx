import Staff from "@/components/staff/Staff";
import type { Pitch } from "@/components/staff/pitch";
import { type Letter, LETTERS, pitchToLetter } from "@/components/drill/exercises";

interface Props {
  /** The pitch shown on the staff for this exercise. */
  pitch: Pitch;
  /** True once the child has tapped a letter — locks the buttons and reveals feedback. */
  answered: boolean;
  /** The letter the child tapped, or `null` before answering. */
  chosenLetter: Letter | null;
  /** Called with the tapped letter while still unanswered. */
  onAnswer: (letter: Letter) => void;
  /** Called by the "Next" control to advance to the next exercise. */
  onNext: () => void;
  /** 0-based position in the session, for the "Exercise i of total" cue. */
  progress: { index: number; total: number };
}

/**
 * One note→letter exercise: the staff note plus the 7 answer buttons in
 * `LETTERS` order. Before answering, every button is tappable. After a tap the
 * buttons lock; the correct letter (`pitchToLetter(pitch)`) turns green, a
 * wrong pick turns red, a ✓/✗ cue appears, and a large child-sized "Next"
 * control advances the session. Declarative and feedback-only — all scoring
 * lives in the orchestrator.
 */
export default function NoteToLetterExercise({ pitch, answered, chosenLetter, onAnswer, onNext, progress }: Props) {
  const correctLetter = pitchToLetter(pitch);
  const isCorrect = answered && chosenLetter === correctLetter;

  return (
    <div className="flex w-full max-w-[var(--drill-shell-max)] flex-col items-center gap-[var(--drill-gap)]">
      <p className="text-muted-foreground text-sm font-medium">
        Ćwiczenie {progress.index + 1} z {progress.total}
      </p>

      {/* White "paper" card so the currentColor staff renders dark and legible;
          the brand ring frames it as an intentional panel on the navy canvas. */}
      <div className="ring-primary/30 w-full rounded-2xl bg-white p-6 text-slate-900 shadow-lg ring-4">
        <Staff note={pitch} className="mx-auto w-[var(--drill-staff-w)]" />
      </div>

      <div className="grid w-full grid-cols-4 gap-3">
        {LETTERS.map((letter) => {
          const isAnswerLetter = letter === correctLetter;
          const isWrongPick = answered && letter === chosenLetter && !isAnswerLetter;

          let stateClasses = "bg-card text-card-foreground border border-border hover:bg-primary/10 active:scale-95";
          if (answered) {
            if (isAnswerLetter) {
              stateClasses = "bg-success text-primary-foreground border border-success";
            } else if (isWrongPick) {
              stateClasses = "bg-destructive text-primary-foreground border border-destructive";
            } else {
              stateClasses = "bg-card text-muted-foreground border border-border opacity-40";
            }
          }

          return (
            <button
              key={letter}
              type="button"
              disabled={answered}
              onClick={() => {
                onAnswer(letter);
              }}
              className={`flex h-[var(--drill-tap-h)] items-center justify-center rounded-xl text-[length:var(--drill-tap-text)] font-bold transition-all disabled:pointer-events-none ${stateClasses}`}
            >
              {letter}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="flex w-full flex-col items-center gap-[var(--drill-gap-sm)]">
          <p
            className={`text-[length:var(--drill-feedback-text)] font-bold ${isCorrect ? "text-success" : "text-destructive"}`}
          >
            {isCorrect ? "✓ Brawo!" : `✗ To było ${correctLetter}`}
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
