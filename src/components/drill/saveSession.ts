import type { AnswerRecord } from "@/components/drill/exercises";

/**
 * Build the batch save payload and POST it to `/api/sessions`, throwing on a
 * non-OK response so the caller can drive retry state.
 *
 * The session id and per-answer ids are **passed in** (generated once by the
 * orchestrator, never inside render — see the stable-id note in the plan), not
 * generated here. Calling `saveSession` twice with the same input is therefore a
 * true no-op retry: the server upserts on those ids with ignore-duplicates.
 */
export async function saveSession(input: {
  sessionId: string;
  answerIds: readonly string[];
  exerciseCount: 5 | 10 | 20;
  startedAt: string;
  answers: readonly AnswerRecord[];
}): Promise<void> {
  const body = {
    id: input.sessionId,
    exercise_count: input.exerciseCount,
    started_at: input.startedAt,
    answers: input.answers.map((answer, i) => ({
      id: input.answerIds[i],
      exercise_type: answer.exerciseType,
      note: answer.note,
      is_correct: answer.isCorrect,
    })),
  };

  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Save failed: ${res.status}`);
  }
}
