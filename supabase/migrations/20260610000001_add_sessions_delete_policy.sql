-- Allow authenticated users to delete their own sessions.
-- Answers cascade via the existing FK (answers.session_id on delete cascade)
-- as a system operation that bypasses RLS, so no answers delete policy is needed.
create policy "sessions_delete_own" on sessions
  for delete to authenticated
  using (user_id = auth.uid());
