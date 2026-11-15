-- Run this in the SQL Editor of the new Supabase project.
-- Then apply timestamped files in migrations/ in ascending order.
-- Public users can read player profiles. Only authenticated users with the
-- trusted app_metadata role "admin" can insert, update, or delete them.

create table if not exists public.players (
  id text primary key,
  profile jsonb not null,
  updated_at timestamptz not null default now(),
  constraint players_profile_id_matches_row check (profile ->> 'id' = id)
);

alter table public.players enable row level security;

revoke all on public.players from public;
grant select on public.players to anon, authenticated;
grant insert, update, delete on public.players to authenticated;

drop policy if exists "Anyone can read player profiles" on public.players;
create policy "Anyone can read player profiles"
  on public.players for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can insert player profiles" on public.players;
create policy "Admins can insert player profiles"
  on public.players for insert
  to authenticated
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admins can update player profiles" on public.players;
create policy "Admins can update player profiles"
  on public.players for update
  to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admins can delete player profiles" on public.players;
create policy "Admins can delete player profiles"
  on public.players for delete
  to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create index if not exists players_updated_at_idx on public.players (updated_at desc);
