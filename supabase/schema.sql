create table if not exists public.body_os_allowed_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.body_os_allowed_users enable row level security;
revoke all on table public.body_os_allowed_users from anon, authenticated;
grant select on table public.body_os_allowed_users to authenticated;
grant select on table public.body_os_allowed_users to service_role;
drop policy if exists "allowed users can read their own grant" on public.body_os_allowed_users;
create policy "allowed users can read their own grant" on public.body_os_allowed_users for select to authenticated
  using ((select auth.uid()) = user_id);

-- After creating your Auth account, run this once with your real email:
-- insert into public.body_os_allowed_users(user_id)
-- select id from auth.users where email = 'you@example.com'
-- on conflict (user_id) do nothing;

create table if not exists public.body_os_workout_uploads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_session_id text not null check (char_length(client_session_id) between 8 and 160),
  schema_version text not null check (schema_version = 'body.os.quick-workout.v1'),
  session_started_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  imported_at timestamptz,
  imported_workout_id text,
  unique (owner_id, client_session_id)
);

alter table public.body_os_workout_uploads enable row level security;
revoke all on table public.body_os_workout_uploads from anon;
grant select, insert, update, delete on table public.body_os_workout_uploads to authenticated;
grant select, update on table public.body_os_workout_uploads to service_role;

drop policy if exists "owners can read workout uploads" on public.body_os_workout_uploads;
create policy "owners can read workout uploads" on public.body_os_workout_uploads for select to authenticated
  using ((select auth.uid()) = owner_id and exists (select 1 from public.body_os_allowed_users where user_id = (select auth.uid())));
drop policy if exists "owners can insert workout uploads" on public.body_os_workout_uploads;
create policy "owners can insert workout uploads" on public.body_os_workout_uploads for insert to authenticated
  with check ((select auth.uid()) = owner_id and exists (select 1 from public.body_os_allowed_users where user_id = (select auth.uid())));
drop policy if exists "owners can update workout uploads" on public.body_os_workout_uploads;
create policy "owners can update workout uploads" on public.body_os_workout_uploads for update to authenticated
  using ((select auth.uid()) = owner_id and exists (select 1 from public.body_os_allowed_users where user_id = (select auth.uid())))
  with check ((select auth.uid()) = owner_id and exists (select 1 from public.body_os_allowed_users where user_id = (select auth.uid())));
drop policy if exists "owners can delete workout uploads" on public.body_os_workout_uploads;
create policy "owners can delete workout uploads" on public.body_os_workout_uploads for delete to authenticated
  using ((select auth.uid()) = owner_id and exists (select 1 from public.body_os_allowed_users where user_id = (select auth.uid())));
