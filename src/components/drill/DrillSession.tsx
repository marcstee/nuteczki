import { useState } from "react";
import type { Pitch } from "@/components/staff/pitch";
import {
  type AnswerRecord,
  EXERCISE_TYPE_NOTE_TO_LETTER,
  type Letter,
  nextPitch,
  pitchToLetter,
  summarize,
} from "@/components/drill/exercises";
import NoteToLetterExercise from "@/components/drill/NoteToLetterExercise";
import SessionResults from "@/components/drill/SessionResults";

/** The preset session lengths the child picks from (FR-002). */
const COUNTS = [5, 10, 20] as const;
type ExerciseCount = (typeof COUNTS)[number];

type Phase = "setup" | "active" | "finished";

/**
 * Drill orchestrator island: owns the `setup → active → finished` state machine
 * and drives the note→letter loop entirely in client state. Setup picks a count;
 * each answer is scored locally (`isCorrect = chosen === pitchToLetter(pitch)`)
 * and appended to `answers`; "Next" draws the next pitch via `nextPitch(previous)`
 * (no back-to-back repeats) until the chosen count is reached, then auto-finishes
 * (FR-007) into the results screen. No persistence in this phase.
 */
export default function DrillSession() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [exerciseCount, setExerciseCount] = useState<ExerciseCount>(5);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [currentPitch, setCurrentPitch] = useState<Pitch | null>(null);
  const [chosenLetter, setChosenLetter] = useState<Letter | null>(null);

  const answered = chosenLetter !== null;

  function handleStart(count: ExerciseCount) {
    setExerciseCount(count);
    setAnswers([]);
    setChosenLetter(null);
    setCurrentPitch(nextPitch(null));
    setPhase("active");
  }

  function handleAnswer(letter: Letter) {
    if (currentPitch === null || chosenLetter !== null) return;
    const isCorrect = letter === pitchToLetter(currentPitch);
    setAnswers((prev) => [
      ...prev,
      { note: currentPitch, chosenLetter: letter, isCorrect, exerciseType: EXERCISE_TYPE_NOTE_TO_LETTER },
    ]);
    setChosenLetter(letter);
  }

  function handleNext() {
    if (answers.length >= exerciseCount) {
      setPhase("finished");
      return;
    }
    setCurrentPitch((prev) => nextPitch(prev));
    setChosenLetter(null);
  }

  function handleAgain() {
    setAnswers([]);
    setChosenLetter(null);
    setCurrentPitch(null);
    setPhase("setup");
  }

  function handleDone() {
    window.location.href = "/dashboard";
  }

  if (phase === "setup") {
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-8">
        <h2 className="bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-3xl font-bold text-transparent">
          How many notes?
        </h2>
        <div className="flex w-full flex-col gap-4">
          {COUNTS.map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => {
                handleStart(count);
              }}
              className="h-16 w-full rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-2xl font-bold text-white transition-all hover:from-blue-400 hover:to-purple-400 active:scale-95"
            >
              {count}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (phase === "finished") {
    const stats = summarize(answers);
    return (
      <SessionResults
        correct={stats.correct}
        incorrect={stats.incorrect}
        accuracyPct={stats.accuracyPct}
        onAgain={handleAgain}
        onDone={handleDone}
      />
    );
  }

  // phase === "active"
  if (currentPitch === null) return null;
  return (
    <NoteToLetterExercise
      pitch={currentPitch}
      answered={answered}
      chosenLetter={chosenLetter}
      onAnswer={handleAnswer}
      onNext={handleNext}
      progress={{ index: answered ? answers.length - 1 : answers.length, total: exerciseCount }}
    />
  );
}
