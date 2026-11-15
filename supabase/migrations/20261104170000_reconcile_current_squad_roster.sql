-- Forward-only reconciliation for current-squad imports.
-- Existing players, historical player_competitions rows, jobs and cache rows
-- are retained. The cache migration below adds metadata and re-keys rows only.

DO $$
BEGIN
  IF to_regclass('public.players') IS NULL
    OR to_regclass('public.football_leagues') IS NULL
    OR to_regclass('public.football_clubs') IS NULL
    OR to_regclass('public.player_competitions') IS NULL
    OR to_regclass('public.roster_import_jobs') IS NULL
    OR to_regclass('public.roster_import_teams') IS NULL THEN
    RAISE EXCEPTION 'Apply the ELITE XI base roster schema before the current-squad reconciliation migration.';
  END IF;
END;
$$;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS data_scope text NOT NULL DEFAULT 'historical';
ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_data_scope_check;
ALTER TABLE public.players
  ADD CONSTRAINT players_data_scope_check
  CHECK (data_scope IN ('historical', 'current_squad'));

ALTER TABLE public.players
  DROP CONSTRAINT IF EXISTS players_external_api_id_positive,
  DROP CONSTRAINT IF EXISTS players_age_in_range,
  DROP CONSTRAINT IF EXISTS players_height_in_range,
  DROP CONSTRAINT IF EXISTS players_weight_in_range,
  DROP CONSTRAINT IF EXISTS players_jersey_number_in_range;
ALTER TABLE public.players
  ADD CONSTRAINT players_external_api_id_positive
    CHECK (external_api_id IS NULL OR external_api_id > 0) NOT VALID,
  ADD CONSTRAINT players_age_in_range
    CHECK (age IS NULL OR age BETWEEN 0 AND 120) NOT VALID,
  ADD CONSTRAINT players_height_in_range
    CHECK (height_cm IS NULL OR height_cm BETWEEN 1 AND 300) NOT VALID,
  ADD CONSTRAINT players_weight_in_range
    CHECK (weight_kg IS NULL OR weight_kg BETWEEN 1 AND 400) NOT VALID,
  ADD CONSTRAINT players_jersey_number_in_range
    CHECK (jersey_number IS NULL OR jersey_number BETWEEN 0 AND 99) NOT VALID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.players
    WHERE external_api_id IS NOT NULL
    GROUP BY external_api_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate external_api_id values exist in public.players; resolve them without deleting historical player records before continuing.';
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.players_external_api_id_uidx;
CREATE UNIQUE INDEX players_external_api_id_uidx ON public.players (external_api_id);
CREATE INDEX IF NOT EXISTS players_name_search_idx ON public.players
  USING gin (to_tsvector('simple', coalesce(first_name, '') || ' ' || coalesce(last_name, '')));
CREATE INDEX IF NOT EXISTS players_league_season_idx ON public.players (league_name, season);
CREATE INDEX IF NOT EXISTS players_club_idx ON public.players (current_club);
CREATE INDEX IF NOT EXISTS players_nationality_idx ON public.players (nationality);
CREATE INDEX IF NOT EXISTS players_position_idx ON public.players (position);
CREATE INDEX IF NOT EXISTS players_first_name_idx ON public.players (first_name);
CREATE INDEX IF NOT EXISTS players_last_name_idx ON public.players (last_name);
CREATE INDEX IF NOT EXISTS player_competitions_league_idx
  ON public.player_competitions (league_id, season, team_id);
CREATE INDEX IF NOT EXISTS roster_import_jobs_created_idx
  ON public.roster_import_jobs (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS roster_import_teams_job_status_idx
  ON public.roster_import_teams (job_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.players, public.football_leagues,
  public.football_clubs, public.player_competitions, public.roster_import_jobs,
  public.roster_import_teams TO service_role;

CREATE OR REPLACE FUNCTION public.set_players_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS players_set_updated_at ON public.players;
CREATE TRIGGER players_set_updated_at
  BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.set_players_updated_at();
REVOKE ALL ON FUNCTION public.set_players_updated_at() FROM PUBLIC;

ALTER TABLE public.football_leagues
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT false;

ALTER TABLE public.roster_import_jobs
  ADD COLUMN IF NOT EXISTS data_scope text NOT NULL DEFAULT 'historical';
ALTER TABLE public.roster_import_jobs ALTER COLUMN season DROP NOT NULL;
ALTER TABLE public.roster_import_jobs DROP CONSTRAINT IF EXISTS roster_import_jobs_scope_season_check;
ALTER TABLE public.roster_import_jobs
  ADD CONSTRAINT roster_import_jobs_scope_season_check
  CHECK (
    (data_scope = 'historical' AND season IS NOT NULL)
    OR (data_scope = 'current_squad' AND season IS NULL)
  );

CREATE TABLE IF NOT EXISTS public.player_current_squads (
  player_id text PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
  team_id bigint NOT NULL,
  league_id bigint NOT NULL,
  club_name text NOT NULL,
  league_name text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_current_squads_club_idx
  ON public.player_current_squads (team_id, league_id, player_id);
ALTER TABLE public.player_current_squads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_current_squads FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.player_current_squads TO anon, authenticated;
GRANT ALL ON public.player_current_squads TO service_role;
DROP POLICY IF EXISTS "Public can read published current squad associations" ON public.player_current_squads;
CREATE POLICY "Public can read published current squad associations"
  ON public.player_current_squads FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.players AS p
    WHERE p.id = player_current_squads.player_id AND p.is_published = true
  ));

-- Preserve the original season-keyed cache records while supporting current
-- snapshots whose season is NULL.
CREATE TABLE IF NOT EXISTS public.football_squad_cache (
  team_id bigint NOT NULL,
  league_id bigint NOT NULL,
  season smallint,
  response jsonb NOT NULL,
  cached_at timestamptz NOT NULL DEFAULT now(),
  cache_id uuid DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'api-football',
  snapshot_type text NOT NULL DEFAULT 'historical',
  cache_key text
);

ALTER TABLE public.football_squad_cache
  ADD COLUMN IF NOT EXISTS cache_id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'api-football',
  ADD COLUMN IF NOT EXISTS snapshot_type text NOT NULL DEFAULT 'historical',
  ADD COLUMN IF NOT EXISTS cache_key text;

UPDATE public.football_squad_cache
SET cache_id = coalesce(cache_id, gen_random_uuid()),
    provider = coalesce(provider, 'api-football'),
    snapshot_type = coalesce(snapshot_type, 'historical'),
    cache_key = coalesce(cache_key, CASE
      WHEN season IS NULL THEN 'current'
      ELSE 'season:' || season::text
    END)
WHERE cache_id IS NULL OR provider IS NULL OR snapshot_type IS NULL OR cache_key IS NULL;

ALTER TABLE public.football_squad_cache
  ALTER COLUMN cache_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN cache_id SET NOT NULL,
  ALTER COLUMN provider SET DEFAULT 'api-football',
  ALTER COLUMN provider SET NOT NULL,
  ALTER COLUMN snapshot_type SET DEFAULT 'historical',
  ALTER COLUMN snapshot_type SET NOT NULL,
  ALTER COLUMN cache_key SET NOT NULL;

-- The legacy primary key includes season, so remove it before making season
-- nullable. This block is safe to rerun if the cache has already been re-keyed.
DO $$
DECLARE
  current_pk text;
BEGIN
  SELECT conname INTO current_pk
  FROM pg_constraint
  WHERE conrelid = 'public.football_squad_cache'::regclass AND contype = 'p'
    AND pg_get_constraintdef(oid) <> 'PRIMARY KEY (cache_id)'
  LIMIT 1;

  IF current_pk IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.football_squad_cache DROP CONSTRAINT %I', current_pk);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.football_squad_cache'::regclass AND contype = 'p'
      AND pg_get_constraintdef(oid) = 'PRIMARY KEY (cache_id)'
  ) THEN
    ALTER TABLE public.football_squad_cache
      ADD CONSTRAINT football_squad_cache_pkey PRIMARY KEY (cache_id);
  END IF;
END;
$$;

ALTER TABLE public.football_squad_cache
  ALTER COLUMN season DROP NOT NULL;

ALTER TABLE public.football_squad_cache
  DROP CONSTRAINT IF EXISTS football_squad_cache_scope_check;
ALTER TABLE public.football_squad_cache
  ADD CONSTRAINT football_squad_cache_scope_check CHECK (
    (snapshot_type = 'historical' AND season IS NOT NULL AND cache_key = 'season:' || season::text)
    OR (snapshot_type = 'current_squad' AND season IS NULL AND cache_key = 'current')
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.football_squad_cache
    GROUP BY provider, team_id, league_id, cache_key
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate football_squad_cache provider/team/league/cache_key rows exist; reconcile cache duplicates before continuing.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS football_squad_cache_provider_key_uidx
  ON public.football_squad_cache (provider, team_id, league_id, cache_key);
DROP INDEX IF EXISTS public.football_squad_cache_freshness_idx;
CREATE INDEX football_squad_cache_freshness_idx
  ON public.football_squad_cache (provider, league_id, snapshot_type, cached_at DESC);
ALTER TABLE public.football_squad_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.football_squad_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.football_squad_cache TO service_role;

CREATE TABLE IF NOT EXISTS public.football_current_clubs (
  league_id bigint NOT NULL,
  team_id bigint NOT NULL,
  name text NOT NULL,
  country text,
  logo text,
  cached_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, team_id)
);
CREATE INDEX IF NOT EXISTS football_current_clubs_freshness_idx
  ON public.football_current_clubs (league_id, cached_at DESC);
ALTER TABLE public.football_current_clubs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.football_current_clubs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.football_current_clubs TO service_role;

CREATE OR REPLACE FUNCTION public.global_player_directory_page(
  p_search text DEFAULT NULL,
  p_league text DEFAULT NULL,
  p_club text DEFAULT NULL,
  p_nationality text DEFAULT NULL,
  p_position text DEFAULT NULL,
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  total_count bigint,
  id text,
  profile jsonb,
  external_api_id bigint,
  first_name text,
  last_name text,
  nationality text,
  height_cm smallint,
  weight_kg smallint,
  "position" text,
  preferred_foot text,
  jersey_number smallint,
  photo_url text,
  current_club text,
  league_name text,
  season smallint,
  synced_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH effective AS (
    SELECT p.*,
      (p.data_scope = 'current_squad' AND NOT EXISTS (
        SELECT 1 FROM public.player_current_squads AS s WHERE s.player_id = p.id
      )) AS outside_current_squad
    FROM public.players AS p
    WHERE p.is_published = true AND p.external_api_id IS NOT NULL
  ), matching AS (
    SELECT e.id,
      CASE WHEN e.outside_current_squad THEN e.profile->'historicalSnapshot' ELSE e.profile END AS profile,
      e.external_api_id, e.first_name, e.last_name,
      CASE WHEN e.outside_current_squad THEN e.profile->'historicalSnapshot'->>'nationality' ELSE e.nationality END AS nationality,
      e.height_cm, e.weight_kg,
      CASE WHEN e.outside_current_squad THEN e.profile->'historicalSnapshot'->>'position' ELSE e.position END AS position,
      e.preferred_foot, e.jersey_number, e.photo_url,
      CASE WHEN e.outside_current_squad THEN e.profile->'historicalSnapshot'->>'club' ELSE e.current_club END AS current_club,
      CASE WHEN e.outside_current_squad THEN e.profile->'historicalSnapshot'->>'league' ELSE e.league_name END AS league_name,
      CASE WHEN e.outside_current_squad THEN (
        SELECT CASE WHEN item.value->>'season' ~ '^[0-9]{4}$' THEN (item.value->>'season')::smallint ELSE NULL END
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(e.profile->'historicalSnapshot'->'seasons') = 'array'
            THEN e.profile->'historicalSnapshot'->'seasons' ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS item(value, ordinal)
        ORDER BY item.ordinal DESC LIMIT 1
      ) ELSE e.season END AS season,
      CASE WHEN e.outside_current_squad THEN NULL::timestamptz ELSE e.synced_at END AS synced_at
    FROM effective AS e
    WHERE NOT e.outside_current_squad OR jsonb_typeof(e.profile->'historicalSnapshot') = 'object'
  )
  SELECT count(*) OVER (), matching.id, matching.profile, matching.external_api_id,
    matching.first_name, matching.last_name, matching.nationality, matching.height_cm,
    matching.weight_kg, matching.position, matching.preferred_foot, matching.jersey_number,
    matching.photo_url, matching.current_club, matching.league_name, matching.season,
    matching.synced_at
  FROM matching
  WHERE (
      NULLIF(btrim(p_search), '') IS NULL
      OR to_tsvector('simple', coalesce(matching.first_name, '') || ' ' || coalesce(matching.last_name, ''))
        @@ websearch_to_tsquery('simple', btrim(p_search))
    )
    AND (NULLIF(p_league, '') IS NULL OR matching.league_name = p_league)
    AND (NULLIF(p_club, '') IS NULL OR matching.current_club = p_club)
    AND (NULLIF(p_nationality, '') IS NULL OR matching.nationality = p_nationality)
    AND (NULLIF(p_position, '') IS NULL OR matching.position = p_position)
  ORDER BY matching.last_name NULLS LAST, matching.first_name NULLS LAST, matching.id
  LIMIT LEAST(GREATEST(coalesce(p_limit, 24), 1), 100)
  OFFSET GREATEST(coalesce(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.global_player_directory_facets()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH effective AS (
    SELECT p.*,
      (p.data_scope = 'current_squad' AND NOT EXISTS (
        SELECT 1 FROM public.player_current_squads AS s WHERE s.player_id = p.id
      )) AS outside_current_squad
    FROM public.players AS p
    WHERE p.is_published = true AND p.external_api_id IS NOT NULL
  ), visible AS (
    SELECT
      CASE WHEN outside_current_squad THEN profile->'historicalSnapshot'->>'league' ELSE league_name END AS league_name,
      CASE WHEN outside_current_squad THEN profile->'historicalSnapshot'->>'club' ELSE current_club END AS current_club,
      CASE WHEN outside_current_squad THEN profile->'historicalSnapshot'->>'nationality' ELSE nationality END AS nationality,
      CASE WHEN outside_current_squad THEN profile->'historicalSnapshot'->>'position' ELSE position END AS position
    FROM effective
    WHERE NOT outside_current_squad OR jsonb_typeof(profile->'historicalSnapshot') = 'object'
  )
  SELECT jsonb_build_object(
    'leagues', coalesce((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT league_name AS value FROM visible WHERE league_name IS NOT NULL) AS options), '[]'::jsonb),
    'clubs', coalesce((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT current_club AS value FROM visible WHERE current_club IS NOT NULL) AS options), '[]'::jsonb),
    'nationalities', coalesce((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT nationality AS value FROM visible WHERE nationality IS NOT NULL) AS options), '[]'::jsonb),
    'positions', coalesce((SELECT jsonb_agg(value ORDER BY value) FROM (SELECT DISTINCT position AS value FROM visible WHERE position IS NOT NULL) AS options), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.global_player_directory_page(text, text, text, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.global_player_directory_facets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_player_directory_page(text, text, text, text, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.global_player_directory_facets() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
