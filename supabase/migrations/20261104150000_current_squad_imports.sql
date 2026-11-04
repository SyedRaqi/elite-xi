-- Distinguish current squad snapshots from historical season records while
-- retaining existing historical rows and their season-based uniqueness.

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS data_scope text NOT NULL DEFAULT 'historical';

ALTER TABLE public.players
  DROP CONSTRAINT IF EXISTS players_data_scope_check;

ALTER TABLE public.players
  ADD CONSTRAINT players_data_scope_check
  CHECK (data_scope IN ('historical', 'current_squad'));

ALTER TABLE public.football_leagues
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT false;

ALTER TABLE public.roster_import_jobs
  ADD COLUMN IF NOT EXISTS data_scope text NOT NULL DEFAULT 'historical';

ALTER TABLE public.roster_import_jobs
  ALTER COLUMN season DROP NOT NULL;

ALTER TABLE public.roster_import_jobs
  DROP CONSTRAINT IF EXISTS roster_import_jobs_scope_season_check;

ALTER TABLE public.roster_import_jobs
  ADD CONSTRAINT roster_import_jobs_scope_season_check
  CHECK (
    (data_scope = 'historical' AND season IS NOT NULL)
    OR (data_scope = 'current_squad' AND season IS NULL)
  );

-- Keep one explicit current club association per player. Historical
-- player_competitions rows and their season constraints remain untouched.
CREATE TABLE IF NOT EXISTS public.player_current_squads (
  player_id text PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
  team_id bigint NOT NULL,
  league_id bigint NOT NULL,
  club_name text NOT NULL,
  league_name text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

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

-- Re-key the existing cache so a current snapshot can use a null season
-- without colliding with (or being mistaken for) historical season rows.
ALTER TABLE public.football_squad_cache
  ADD COLUMN IF NOT EXISTS cache_id uuid,
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'api-football',
  ADD COLUMN IF NOT EXISTS snapshot_type text NOT NULL DEFAULT 'historical',
  ADD COLUMN IF NOT EXISTS cache_key text;

UPDATE public.football_squad_cache
SET cache_id = gen_random_uuid(),
    cache_key = 'season:' || season::text
WHERE cache_id IS NULL OR cache_key IS NULL;

ALTER TABLE public.football_squad_cache
  ALTER COLUMN cache_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN cache_id SET NOT NULL,
  ALTER COLUMN cache_key SET NOT NULL,
  ALTER COLUMN season DROP NOT NULL;

ALTER TABLE public.football_squad_cache
  DROP CONSTRAINT IF EXISTS football_squad_cache_pkey;

ALTER TABLE public.football_squad_cache
  DROP CONSTRAINT IF EXISTS football_squad_cache_scope_check;

ALTER TABLE public.football_squad_cache
  ADD CONSTRAINT football_squad_cache_pkey PRIMARY KEY (cache_id),
  ADD CONSTRAINT football_squad_cache_scope_check CHECK (
    (snapshot_type = 'historical' AND season IS NOT NULL AND cache_key = 'season:' || season::text)
    OR (snapshot_type = 'current_squad' AND season IS NULL AND cache_key = 'current')
  );

CREATE UNIQUE INDEX IF NOT EXISTS football_squad_cache_provider_key_uidx
  ON public.football_squad_cache (provider, team_id, league_id, cache_key);

DROP INDEX IF EXISTS public.football_squad_cache_freshness_idx;
CREATE INDEX football_squad_cache_freshness_idx
  ON public.football_squad_cache (provider, league_id, snapshot_type, cached_at DESC);

ALTER TABLE public.football_squad_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.football_squad_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.football_squad_cache TO service_role;

NOTIFY pgrst, 'reload schema';

-- A refreshed current snapshot removes stale club memberships. If the player
-- has a preserved historical profile, continue serving that history from the
-- directory; otherwise the player is excluded from current-squad results.
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
  position text,
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
    WHERE (NOT e.outside_current_squad OR jsonb_typeof(e.profile->'historicalSnapshot') = 'object')
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

GRANT EXECUTE ON FUNCTION public.global_player_directory_page(text, text, text, text, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.global_player_directory_facets() TO anon, authenticated;
