-- Drill session persistence layer: sessions, answers, RLS, and the adaptive-query view.

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_count smallint not null check (exercise_count in (5, 10, 20)),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_type text not null check (exercise_type in ('note_to_letter', 'letter_to_note')),
  note text not null,
  is_correct boolean not null,
  answered_at timestamptz not null default now()
);

create index answers_session_id_idx on answers (session_id);
create index sessions_user_id_started_at_idx on sessions (user_id, started_at desc);

alter table sessions enable row level security;
alter table answers enable row level security;

create policy "sessions_select_own" on sessions
  for select to authenticated
  using (user_id = auth.uid());

create policy "sessions_insert_own" on sessions
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "sessions_update_own" on sessions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "answers_select_own" on answers
  for select to authenticated
  using (user_id = auth.uid());

create policy "answers_insert_own" on answers
  for insert to authenticated
  with check (user_id = auth.uid());

-- Per-note error counts across each user's last 5 completed sessions.
-- security_invoker (Postgres 17) makes RLS on the base tables apply when
-- the view is queried through the Supabase API.
create view note_error_stats with (security_invoker = on) as
with ranked_sessions as (
  select
    id,
    user_id,
    row_number() over (partition by user_id order by started_at desc) as rn
  from sessions
  where finished_at is not null
)
select
  rs.user_id,
  a.note,
  a.exercise_type,
  count(*) filter (where not a.is_correct) as error_count,
  count(*) as total_count
from ranked_sessions rs
join answers a on a.session_id = rs.id
where rs.rn <= 5
group by rs.user_id, a.note, a.exercise_type;
