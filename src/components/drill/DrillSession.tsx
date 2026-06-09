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
import SessionResults, { type SaveState } from "@/components/drill/SessionResults";
import { saveSession } from "@/components/drill/saveSession";

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
 * (FR-007) into the results screen. On finish the session is saved in the
 * background (P3): stats render immediately while `saveSession` POSTs the batch;
 * a failed save surfaces a non-blocking "Retry save" without hiding the results.
 */
export default function DrillSession() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [exerciseCount, setExerciseCount] = useState<ExerciseCount>(5);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [currentPitch, setCurrentPitch] = useState<Pitch | null>(null);
  const [chosenLetter, setChosenLetter] = useState<Letter | null>(null);
  const [startedAt, setStartedAt] = useState("");
  // Stable ids for the save: generated once on the transition into `finished`
  // (never in render — that would defeat idempotency and break react-compiler)
  // and reused on every retry so a re-POST is a no-op.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [answerIds, setAnswerIds] = useState<readonly string[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("saving");

  const answered = chosenLetter !== null;

  async function persist(
    id: string,
    ids: readonly string[],
    started: string,
    count: ExerciseCount,
    records: readonly AnswerRecord[],
  ) {
    setSaveState("saving");
    try {
      await saveSession({ sessionId: id, answerIds: ids, exerciseCount: count, startedAt: started, answers: records });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  function handleStart(count: ExerciseCount) {
    setExerciseCount(count);
    setAnswers([]);
    setChosenLetter(null);
    setCurrentPitch(nextPitch(null));
    setStartedAt(new Date().toISOString());
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
      // Generate the stable ids here (event handler, not render) and kick off
      // the background save. Stats show immediately; the save resolves async.
      const id = crypto.randomUUID();
      const ids = answers.map(() => crypto.randomUUID());
      setSessionId(id);
      setAnswerIds(ids);
      setPhase("finished");
      void persist(id, ids, startedAt, exerciseCount, answers);
      return;
    }
    setCurrentPitch((prev) => nextPitch(prev));
    setChosenLetter(null);
  }

  function handleRetrySave() {
    if (sessionId === null) return;
    void persist(sessionId, answerIds, startedAt, exerciseCount, answers);
  }

  function handleAgain() {
    setAnswers([]);
    setChosenLetter(null);
    setCurrentPitch(null);
    setSessionId(null);
    setAnswerIds([]);
    setSaveState("saving");
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
        saveState={saveState}
        onRetrySave={handleRetrySave}
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
