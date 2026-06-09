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
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <p className="text-sm font-medium text-blue-100/60">
        Exercise {progress.index + 1} of {progress.total}
      </p>

      <div className="flex flex-col items-center gap-2">
        <p className="text-sm font-medium text-blue-100/60">Find this note</p>
        <div className="bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-8xl font-bold text-transparent">
          {promptLetter}
        </div>
      </div>

      <div className="grid w-full grid-cols-3 gap-3">
        {options.map((option) => {
          const isAnswerOption = pitchToLetter(option) === promptLetter;
          const isWrongPick = answered && option === chosenPitch && !isAnswerOption;

          // Keep the card interior white "paper" so the currentColor staff stays
          // legible; signal state with a thick border/ring and dim the rest.
          let stateClasses = "border-transparent hover:scale-[1.02] active:scale-95";
          if (answered) {
            if (isAnswerOption) {
              stateClasses = "border-green-400 ring-4 ring-green-400/40";
            } else if (isWrongPick) {
              stateClasses = "border-red-400 ring-4 ring-red-400/40";
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
              className={`flex items-center justify-center rounded-2xl border-4 bg-white p-3 text-slate-900 shadow-lg transition-all disabled:pointer-events-none ${stateClasses}`}
            >
              <Staff note={option} className="w-full" />
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="flex w-full flex-col items-center gap-4">
          <p className={`text-3xl font-bold ${isCorrect ? "text-green-400" : "text-red-400"}`}>
            {isCorrect ? "✓ Correct!" : "✗ Not quite"}
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
