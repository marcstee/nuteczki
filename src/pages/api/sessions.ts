import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { type Pitch, PITCHES } from "@/components/staff/pitch";
import { EXERCISE_TYPE_LETTER_TO_NOTE, EXERCISE_TYPE_NOTE_TO_LETTER } from "@/components/drill/exercises";

/**
 * Persist a completed drill session (note→letter and letter→note) and its
 * answers in one request, scoped to the authenticated user and idempotent
 * under retry.
 *
 * The route self-guards auth (returns 401 JSON rather than redirecting like
 * `PROTECTED_ROUTES`, which would be wrong for a `fetch()`), validates the
 * payload structure (it trusts the client's `is_correct` verdict per the slice
 * decision but still requires it be a boolean), and writes via two
 * ignore-duplicate upserts on client-generated ids — so a retried identical
 * payload is a no-op, never a duplicate row. RLS `WITH CHECK (user_id =
 * auth.uid())` enforces ownership on both inserts.
 */

const EXERCISE_COUNTS = [5, 10, 20] as const;
type ExerciseCount = (typeof EXERCISE_COUNTS)[number];

interface AnswerPayload {
  id: string;
  exercise_type: typeof EXERCISE_TYPE_NOTE_TO_LETTER | typeof EXERCISE_TYPE_LETTER_TO_NOTE;
  note: Pitch;
  is_correct: boolean;
}

interface SessionPayload {
  id: string;
  exercise_count: ExerciseCount;
  started_at: string;
  answers: AnswerPayload[];
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isExerciseCount(value: unknown): value is ExerciseCount {
  return (EXERCISE_COUNTS as readonly number[]).includes(value as number);
}

function isPitch(value: unknown): value is Pitch {
  return typeof value === "string" && (PITCHES as readonly string[]).includes(value);
}

/** Structurally validate the request body; returns the typed payload or `null`. */
function parseBody(body: unknown): SessionPayload | null {
  if (typeof body !== "object" || body === null) return null;
  const { id, exercise_count, started_at, answers } = body as Record<string, unknown>;

  if (typeof id !== "string" || id.length === 0) return null;
  if (typeof started_at !== "string" || started_at.length === 0) return null;
  if (Number.isNaN(Date.parse(started_at))) return null;
  if (!isExerciseCount(exercise_count)) return null;
  if (!Array.isArray(answers) || answers.length !== exercise_count) return null;

  const parsed: AnswerPayload[] = [];
  for (const raw of answers) {
    if (typeof raw !== "object" || raw === null) return null;
    const { id: answerId, exercise_type, note, is_correct } = raw as Record<string, unknown>;
    if (typeof answerId !== "string" || answerId.length === 0) return null;
    if (exercise_type !== EXERCISE_TYPE_NOTE_TO_LETTER && exercise_type !== EXERCISE_TYPE_LETTER_TO_NOTE) return null;
    if (!isPitch(note)) return null;
    if (typeof is_correct !== "boolean") return null;
    parsed.push({ id: answerId, exercise_type, note, is_correct });
  }

  return { id, exercise_count, started_at, answers: parsed };
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 503);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return json({ error: "Not authenticated" }, 401);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const payload = parseBody(body);
  if (!payload) {
    return json({ error: "Invalid payload" }, 400);
  }

  // Session first (FK-ordered). Ignore-duplicate so a retry on the same id is a no-op.
  const { error: sessionError } = await supabase.from("sessions").upsert(
    {
      id: payload.id,
      user_id: user.id,
      exercise_count: payload.exercise_count,
      started_at: payload.started_at,
      finished_at: new Date().toISOString(),
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (sessionError) {
    return json({ error: "Failed to save session" }, 500);
  }

  // All answers in one upsert = one subrequest; ignore-duplicate keeps retries idempotent.
  const answerRows = payload.answers.map((a) => ({
    id: a.id,
    session_id: payload.id,
    user_id: user.id,
    exercise_type: a.exercise_type,
    note: a.note,
    is_correct: a.is_correct,
  }));
  const { error: answersError } = await supabase
    .from("answers")
    .upsert(answerRows, { onConflict: "id", ignoreDuplicates: true });
  if (answersError) {
    return json({ error: "Failed to save answers" }, 500);
  }

  return json({ ok: true }, 200);
};

export const DELETE: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 503);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return json({ error: "Not authenticated" }, 401);
  }

  const id = context.url.searchParams.get("id");
  if (!id || id.length === 0) {
    return json({ error: "Missing session id" }, 400);
  }

  const { error } = await supabase.from("sessions").delete().eq("id", id);
  if (error) {
    return json({ error: "Failed to delete session" }, 500);
  }

  return json({ ok: true }, 200);
};
