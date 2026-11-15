ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS external_api_id bigint,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS age smallint,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS nationality text,
  ADD COLUMN IF NOT EXISTS height_cm smallint,
  ADD COLUMN IF NOT EXISTS weight_kg smallint,
  ADD COLUMN IF NOT EXISTS position text,
  ADD COLUMN IF NOT EXISTS preferred_foot text,
  ADD COLUMN IF NOT EXISTS jersey_number smallint,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS current_club text,
  ADD COLUMN IF NOT EXISTS league_name text,
  ADD COLUMN IF NOT EXISTS season smallint,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS players_external_api_id_uidx ON public.players (external_api_id) WHERE external_api_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS players_name_search_idx ON public.players USING gin (to_tsvector('simple', coalesce(first_name,'') || ' ' || coalesce(last_name,'')));
CREATE INDEX IF NOT EXISTS players_league_season_idx ON public.players (league_name, season);
CREATE INDEX IF NOT EXISTS players_club_idx ON public.players (current_club);
CREATE INDEX IF NOT EXISTS players_nationality_idx ON public.players (nationality);
CREATE INDEX IF NOT EXISTS players_position_idx ON public.players (position);

UPDATE public.players SET
  first_name = COALESCE(first_name, split_part(profile->>'name', ' ', 1)),
  last_name = COALESCE(last_name, NULLIF(substr(profile->>'name', length(split_part(profile->>'name', ' ', 1)) + 2), '')),
  age = COALESCE(age, NULLIF(profile->>'age', '')::smallint),
  nationality = COALESCE(nationality, profile->>'nationality'),
  position = COALESCE(position, profile->>'position'),
  jersey_number = COALESCE(jersey_number, NULLIF(profile->>'number', '')::smallint),
  photo_url = COALESCE(photo_url, profile->>'image'),
  current_club = COALESCE(current_club, profile->>'club'),
  league_name = COALESCE(league_name, profile->>'league');

CREATE TABLE IF NOT EXISTS public.football_leagues (
  league_id bigint NOT NULL,
  season smallint NOT NULL,
  name text NOT NULL,
  country text,
  logo text,
  coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
  cached_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, season)
);
CREATE TABLE IF NOT EXISTS public.football_clubs (
  team_id bigint NOT NULL,
  league_id bigint NOT NULL,
  season smallint NOT NULL,
  name text NOT NULL,
  country text,
  logo text,
  cached_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, league_id, season)
);
CREATE TABLE IF NOT EXISTS public.player_competitions (
  player_id text NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  team_id bigint NOT NULL,
  league_id bigint NOT NULL,
  season smallint NOT NULL,
  club_name text NOT NULL,
  league_name text NOT NULL,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, team_id, league_id, season)
);
CREATE INDEX IF NOT EXISTS player_competitions_league_idx ON public.player_competitions (league_id, season, team_id);

CREATE TABLE IF NOT EXISTS public.roster_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  league_id bigint NOT NULL,
  league_name text NOT NULL,
  season smallint NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','completed_with_errors','failed')),
  total_teams integer NOT NULL DEFAULT 0,
  completed_teams integer NOT NULL DEFAULT 0,
  imported_players integer NOT NULL DEFAULT 0,
  failed_teams integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS roster_import_jobs_created_idx ON public.roster_import_jobs (created_by, created_at DESC);
CREATE TABLE IF NOT EXISTS public.roster_import_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roster_import_jobs(id) ON DELETE CASCADE,
  team_id bigint NOT NULL,
  team_name text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  attempts integer NOT NULL DEFAULT 0,
  imported_players integer NOT NULL DEFAULT 0,
  error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, team_id)
);
CREATE INDEX IF NOT EXISTS roster_import_teams_job_status_idx ON public.roster_import_teams (job_id, status);

ALTER TABLE public.football_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.football_clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_import_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read player profiles" ON public.players;
CREATE POLICY "Anyone can read published player profiles" ON public.players
  FOR SELECT TO anon, authenticated USING (is_published = true);
DROP POLICY IF EXISTS "Admins can read all player profiles" ON public.players;
CREATE POLICY "Admins can read all player profiles" ON public.players
  FOR SELECT TO authenticated USING ((SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Public can read football leagues" ON public.football_leagues FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read football clubs" ON public.football_clubs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read player competitions" ON public.player_competitions FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.players p WHERE p.id = player_id AND p.is_published = true)
);
CREATE POLICY "Admins can read import jobs" ON public.roster_import_jobs FOR SELECT TO authenticated USING (
  (SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' AND created_by = (SELECT auth.uid())
);
CREATE POLICY "Admins can read import teams" ON public.roster_import_teams FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.roster_import_jobs j WHERE j.id = job_id AND j.created_by = (SELECT auth.uid())
    AND (SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
);

REVOKE ALL ON public.football_leagues, public.football_clubs, public.player_competitions, public.roster_import_jobs, public.roster_import_teams FROM public;
GRANT SELECT ON public.football_leagues, public.football_clubs, public.player_competitions TO anon, authenticated;
GRANT SELECT ON public.roster_import_jobs, public.roster_import_teams TO authenticated;
