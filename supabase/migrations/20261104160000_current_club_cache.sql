-- Cache API-Football's seasonless team-list response separately from the
-- historical season-keyed football_clubs table.
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

NOTIFY pgrst, 'reload schema';
