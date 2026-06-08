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
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <p className="text-sm font-medium text-blue-100/60">
        Exercise {progress.index + 1} of {progress.total}
      </p>

      {/* White "paper" card so the currentColor staff renders dark and legible. */}
      <div className="w-full rounded-2xl bg-white p-6 text-slate-900 shadow-lg">
        <Staff note={pitch} className="mx-auto w-56" />
      </div>

      <div className="grid w-full grid-cols-4 gap-3">
        {LETTERS.map((letter) => {
          const isAnswerLetter = letter === correctLetter;
          const isWrongPick = answered && letter === chosenLetter && !isAnswerLetter;

          let stateClasses = "bg-white/10 text-white hover:bg-white/20 active:scale-95 border border-white/20";
          if (answered) {
            if (isAnswerLetter) {
              stateClasses = "bg-green-500 text-white border border-green-300";
            } else if (isWrongPick) {
              stateClasses = "bg-red-500 text-white border border-red-300";
            } else {
              stateClasses = "bg-white/5 text-white/40 border border-white/10";
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
              className={`flex h-16 items-center justify-center rounded-xl text-2xl font-bold transition-all disabled:pointer-events-none ${stateClasses}`}
            >
              {letter}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="flex w-full flex-col items-center gap-4">
          <p className={`text-3xl font-bold ${isCorrect ? "text-green-400" : "text-red-400"}`}>
            {isCorrect ? "✓ Correct!" : `✗ It was ${correctLetter}`}
          </p>
          <button
            type="button"
            onClick={onNext}
            className="h-14 w-full rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-xl font-bold text-white transition-all hover:from-blue-400 hover:to-purple-400 active:scale-95"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
