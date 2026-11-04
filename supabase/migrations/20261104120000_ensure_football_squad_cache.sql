-- Ensure the provider response cache exists in projects where the earlier
-- global roster migration was not applied completely or PostgREST is stale.
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
REVOKE ALL ON public.football_squad_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.football_squad_cache TO service_role;

NOTIFY pgrst, 'reload schema';
