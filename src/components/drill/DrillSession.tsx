import { useState } from "react";
import type { Pitch } from "@/components/staff/pitch";
import {
  type AnswerRecord,
  buildSession,
  EMPTY_WEIGHTS,
  type Exercise,
  EXERCISE_TYPE_LETTER_TO_NOTE,
  EXERCISE_TYPE_NOTE_TO_LETTER,
  type Letter,
  type NoteWeights,
  pitchToLetter,
  summarize,
  summarizeByType,
} from "@/components/drill/exercises";
import NoteToLetterExercise from "@/components/drill/NoteToLetterExercise";
import LetterToNoteExercise from "@/components/drill/LetterToNoteExercise";
import SessionResults, { type SaveState } from "@/components/drill/SessionResults";
import { saveSession } from "@/components/drill/saveSession";

/** The preset session lengths the child picks from (FR-002). */
const COUNTS = [5, 10, 20] as const;
type ExerciseCount = (typeof COUNTS)[number];

type Phase = "setup" | "active" | "finished";

interface DrillSessionProps {
  /**
   * Per-(exercise_type, note) error-count weights computed server-side at page
   * load (S-03 / FR-003), biasing each deck's target pitches toward the notes
   * this child misses most. Defaults to EMPTY_WEIGHTS so the island stays valid
   * (and uniform) if rendered standalone. The same value is reused across
   * in-session "play again" — accepted stale-by-one-session; a full page reload
   * refreshes it.
   */
  weights?: NoteWeights;
}

/**
 * Which card/letter the child tapped for the current exercise, discriminated to
 * match the active exercise type, or `null` before answering. Distinguishes
 * "not answered yet" from a chosen answer so the active view locks and shows
 * feedback. In-memory only — the persisted shape is `AnswerRecord`.
 */
type Chosen =
  | { type: typeof EXERCISE_TYPE_NOTE_TO_LETTER; letter: Letter }
  | { type: typeof EXERCISE_TYPE_LETTER_TO_NOTE; pitch: Pitch };

/**
 * Drill orchestrator island: owns the `setup → active → finished` state machine
 * and drives a balanced mixed deck of both exercise types entirely in client
 * state. Setup picks a count, then `buildSession(count)` pre-builds the ordered
 * deck (in the event handler, never render — keeps it stable and react-compiler
 * clean). The loop walks the deck by index, rendering the matching component per
 * step; each answer is scored locally by type and appended to `answers`. After
 * the last exercise it auto-finishes (FR-007) into the results screen, which
 * shows overall accuracy plus per-type counts (FR-008). On finish the session is
 * saved in the background: stats render immediately while `saveSession` POSTs the
 * batch; a failed save surfaces a non-blocking "Retry save" without hiding them.
 */
export default function DrillSession({ weights = EMPTY_WEIGHTS }: DrillSessionProps) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [exerciseCount, setExerciseCount] = useState<ExerciseCount>(5);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [startedAt, setStartedAt] = useState("");
  // Stable ids for the save: generated once on the transition into `finished`
  // (never in render — that would defeat idempotency and break react-compiler)
  // and reused on every retry so a re-POST is a no-op.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [answerIds, setAnswerIds] = useState<readonly string[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("saving");

  const answered = chosen !== null;

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
    setExercises(buildSession(count, weights));
    setCurrentIndex(0);
    setAnswers([]);
    setChosen(null);
    setStartedAt(new Date().toISOString());
    setPhase("active");
  }

  function handleAnswerLetter(letter: Letter) {
    const current = exercises[currentIndex];
    if (chosen !== null || current.type !== EXERCISE_TYPE_NOTE_TO_LETTER) return;
    const isCorrect = letter === pitchToLetter(current.pitch);
    setAnswers((prev) => [
      ...prev,
      { exerciseType: EXERCISE_TYPE_NOTE_TO_LETTER, note: current.pitch, chosenLetter: letter, isCorrect },
    ]);
    setChosen({ type: EXERCISE_TYPE_NOTE_TO_LETTER, letter });
  }

  function handleAnswerPitch(pitch: Pitch) {
    const current = exercises[currentIndex];
    if (chosen !== null || current.type !== EXERCISE_TYPE_LETTER_TO_NOTE) return;
    const isCorrect = pitchToLetter(pitch) === current.promptLetter;
    setAnswers((prev) => [
      ...prev,
      { exerciseType: EXERCISE_TYPE_LETTER_TO_NOTE, note: current.targetPitch, chosenPitch: pitch, isCorrect },
    ]);
    setChosen({ type: EXERCISE_TYPE_LETTER_TO_NOTE, pitch });
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
    setCurrentIndex((i) => i + 1);
    setChosen(null);
  }

  function handleRetrySave() {
    if (sessionId === null) return;
    void persist(sessionId, answerIds, startedAt, exerciseCount, answers);
  }

  function handleAgain() {
    setExercises([]);
    setCurrentIndex(0);
    setAnswers([]);
    setChosen(null);
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
      <div className="flex w-full max-w-[var(--drill-shell-max)] flex-col items-center gap-[var(--drill-gap-lg)]">
        <h2 className="text-foreground text-[length:var(--drill-feedback-text)] font-bold">Ile nutek?</h2>
        <div className="flex w-full flex-col gap-[var(--drill-gap-sm)]">
          {COUNTS.map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => {
                handleStart(count);
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-[var(--drill-tap-h)] w-full rounded-2xl text-[length:var(--drill-tap-text)] font-bold transition-all active:scale-95"
            >
              {count}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (phase === "finished") {
    const byType = summarizeByType(answers);
    return (
      <SessionResults
        accuracyPct={summarize(answers).accuracyPct}
        byType={{
          noteToLetter: {
            correct: byType[EXERCISE_TYPE_NOTE_TO_LETTER].correct,
            incorrect: byType[EXERCISE_TYPE_NOTE_TO_LETTER].incorrect,
          },
          letterToNote: {
            correct: byType[EXERCISE_TYPE_LETTER_TO_NOTE].correct,
            incorrect: byType[EXERCISE_TYPE_LETTER_TO_NOTE].incorrect,
          },
        }}
        onAgain={handleAgain}
        onDone={handleDone}
        saveState={saveState}
        onRetrySave={handleRetrySave}
      />
    );
  }

  // phase === "active"
  const current = exercises[currentIndex];
  const progress = { index: currentIndex, total: exerciseCount };

  if (current.type === EXERCISE_TYPE_NOTE_TO_LETTER) {
    return (
      <NoteToLetterExercise
        pitch={current.pitch}
        answered={answered}
        chosenLetter={chosen?.type === EXERCISE_TYPE_NOTE_TO_LETTER ? chosen.letter : null}
        onAnswer={handleAnswerLetter}
        onNext={handleNext}
        progress={progress}
      />
    );
  }

  return (
    <LetterToNoteExercise
      promptLetter={current.promptLetter}
      options={current.options}
      answered={answered}
      chosenPitch={chosen?.type === EXERCISE_TYPE_LETTER_TO_NOTE ? chosen.pitch : null}
      onAnswer={handleAnswerPitch}
      onNext={handleNext}
      progress={progress}
    />
  );
}
