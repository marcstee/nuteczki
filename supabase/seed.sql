-- Seed data for local development and integration tests.
-- Safe to re-run (all inserts are ON CONFLICT DO NOTHING / idempotent).

-- Known test user referenced by service-role integration tests.
-- UUID 00000000-0000-0000-0000-000000000001 is stable across supabase db reset.
-- Password: seed-password-123  (local only — never deployed to prod)
-- The token columns below MUST be '' (empty string), never NULL. GoTrue scans
-- confirmation_token / recovery_token / email_change / email_change_token_new
-- into non-nullable Go strings; a NULL there makes every sign-in fail with
-- "Database error querying schema". Newer GoTrue images ship these columns
-- without a DB default, so a hand-written INSERT must set them explicitly.
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_sso_user,
  is_anonymous,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'seed@test.local',
  crypt('seed-password-123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  false,
  false,
  now(),
  now(),
  '',
  '',
  '',
  ''
)
ON CONFLICT (id) DO NOTHING;

-- auth.identities entry required for signInWithPassword to work.
-- provider_id = email address for the "email" provider.
INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  provider,
  identity_data,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'seed@test.local',
  'email',
  '{"sub":"00000000-0000-0000-0000-000000000001","email":"seed@test.local","email_verified":true}',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;
