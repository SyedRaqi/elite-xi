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

DROP INDEX IF EXISTS public.players_external_api_id_uidx;
CREATE UNIQUE INDEX players_external_api_id_uidx ON public.players (external_api_id);
CREATE INDEX IF NOT EXISTS players_first_name_idx ON public.players (first_name);
CREATE INDEX IF NOT EXISTS players_last_name_idx ON public.players (last_name);

CREATE TABLE IF NOT EXISTS public.football_squad_cache (
  team_id bigint NOT NULL,
  league_id bigint NOT NULL,
  season smallint NOT NULL,
  response jsonb NOT NULL,
  cached_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, league_id, season)
);

CREATE INDEX IF NOT EXISTS football_squad_cache_freshness_idx
  ON public.football_squad_cache (league_id, season, cached_at DESC);
ALTER TABLE public.football_squad_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.football_squad_cache FROM public, anon, authenticated;
GRANT ALL ON public.football_squad_cache TO service_role;
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
  WITH matching AS (
    SELECT p.id, p.profile, p.external_api_id, p.first_name, p.last_name,
      p.nationality, p.height_cm, p.weight_kg, p.position, p.preferred_foot,
      p.jersey_number, p.photo_url, p.current_club, p.league_name, p.season, p.synced_at
    FROM public.players AS p
    WHERE p.is_published = true
      AND p.external_api_id IS NOT NULL
      AND (
        NULLIF(btrim(p_search), '') IS NULL
        OR to_tsvector(
          'simple',
          coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')
        ) @@ websearch_to_tsquery('simple', btrim(p_search))
      )
      AND (NULLIF(p_league, '') IS NULL OR p.league_name = p_league)
      AND (NULLIF(p_club, '') IS NULL OR p.current_club = p_club)
      AND (NULLIF(p_nationality, '') IS NULL OR p.nationality = p_nationality)
      AND (NULLIF(p_position, '') IS NULL OR p.position = p_position)
  )
  SELECT count(*) OVER (), matching.id, matching.profile, matching.external_api_id,
    matching.first_name, matching.last_name, matching.nationality, matching.height_cm,
    matching.weight_kg, matching.position, matching.preferred_foot, matching.jersey_number,
    matching.photo_url, matching.current_club, matching.league_name, matching.season,
    matching.synced_at
  FROM matching
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
  SELECT jsonb_build_object(
    'leagues', coalesce((
      SELECT jsonb_agg(value ORDER BY value)
      FROM (SELECT DISTINCT league_name AS value FROM public.players
        WHERE is_published AND external_api_id IS NOT NULL AND league_name IS NOT NULL) AS options
    ), '[]'::jsonb),
    'clubs', coalesce((
      SELECT jsonb_agg(value ORDER BY value)
      FROM (SELECT DISTINCT current_club AS value FROM public.players
        WHERE is_published AND external_api_id IS NOT NULL AND current_club IS NOT NULL) AS options
    ), '[]'::jsonb),
    'nationalities', coalesce((
      SELECT jsonb_agg(value ORDER BY value)
      FROM (SELECT DISTINCT nationality AS value FROM public.players
        WHERE is_published AND external_api_id IS NOT NULL AND nationality IS NOT NULL) AS options
    ), '[]'::jsonb),
    'positions', coalesce((
      SELECT jsonb_agg(value ORDER BY value)
      FROM (SELECT DISTINCT position AS value FROM public.players
        WHERE is_published AND external_api_id IS NOT NULL AND position IS NOT NULL) AS options
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.set_players_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.global_player_directory_page(text, text, text, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.global_player_directory_facets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.global_player_directory_page(text, text, text, text, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.global_player_directory_facets() TO anon, authenticated;
