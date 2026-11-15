# Supabase and global roster setup

The app keeps its built-in demonstration roster separate from API-Football records. Only records with an external API player ID appear in the global directory. No API-Football players are added until an administrator starts an import.

## 1. Configure the browser client

Copy `.env.example` to `.env.local` and set:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

The publishable key is intended for browser use. Row-level security protects the database; never use a service-role key in a `VITE_` variable.

## 2. Apply the database schema

For a new project, run `schema.sql` in the Supabase SQL Editor first. Then run the migration files in timestamp order:

1. `migrations/20261103154334_global_player_roster_and_imports.sql`
2. `migrations/20261103210000_global_roster_directory.sql`
3. `migrations/20261104120000_ensure_football_squad_cache.sql`
4. `migrations/20261104150000_current_squad_imports.sql`
5. `migrations/20261104160000_current_club_cache.sql`

The migrations add external player IDs and metadata, competition associations, import history, database indexes, published-player read policies, and paginated directory/search functions. The external API ID has a unique index; imports upsert against it to avoid duplicates.

For an already linked project that tracks these migrations with the Supabase CLI, apply pending migrations from the project root with:

```sh
supabase db push
```

If applying SQL manually, run both `20261104150000_current_squad_imports.sql` and `20261104160000_current_club_cache.sql` after the earlier roster migrations. Do not deploy the updated function until these migrations have been applied, because current-squad imports use the tables they create.

## 3. Deploy the secure API-Football proxy

The Edge Function source is `supabase/functions/global-roster/index.ts`. Run the deploy command from the project root (the directory containing both `package.json` and `supabase/config.toml`), not from a parent workspace directory. If this project is already linked and `API_FOOTBALL_KEY` is already configured as a Supabase secret, deploy it with:

```sh
supabase functions deploy global-roster
```

This command deploys the function only; it does not apply database migrations or run a roster import. The Admin import screen offers the eight competitions listed in `supabase/functions/global-roster/index.ts` and checks each selected provider league by requesting its clubs. Current-squad discovery does not require a provider-confirmed season or historical player-statistics coverage. The function also exposes a provider-status action for authenticated administrators.

For an unlinked project, authenticate and link it first, then set the provider key as a Supabase Edge Function secret before deploying:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set API_FOOTBALL_KEY=YOUR_API_FOOTBALL_KEY
supabase functions deploy global-roster
```

Keep `verify_jwt = true` in `supabase/config.toml`; do not deploy this function with `--no-verify-jwt`. The handler also validates the signed-in user and checks the trusted `app_metadata.role = "admin"` claim before any action.

Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. The function verifies the user's Supabase access token and trusted `app_metadata.role = "admin"` claim before any provider or write action. Keep the API-Football key and service-role key out of the browser and Git.

API-Football plans do not necessarily include every competition or club. Current squad imports contain player identity and club information, not historical competition-season statistics. Historical player records and `player_competitions` data remain preserved and are labeled separately. The provider key is never read by the React app.

## 4. Create an administrator

Create an email/password user in Supabase Auth. Copy `.env.admin.example` to `.env.admin`, fill its server-side project URL and service-role key, then grant the trusted admin claim:

```sh
npm run supabase:grant-admin -- you@example.com
```

Do not commit `.env.admin`. Sign in from the Admin page after granting the role. Database RLS remains authoritative even if a user bypasses the interface.

## Import workflow

From Admin, select a competition marked as having a current squad. Select clubs and choose **Import Selected Clubs**, or choose **Import Full League**. Clubs are processed one at a time; each completed club reports success only after player and current-club association writes are read back and verified. Failed clubs are recorded and can be retried from import history.

Current club lists are checked against API-Football and cached server-side for six hours; validated raw current-squad responses are cached for seven days. A cache miss uses one `/players/squads?team=...` request per club, with retries disabled for that squad request to conserve the daily provider quota. Current squad imports store no season value. Historical imports continue to use `/players` pagination and keep season-specific player associations. Every job is marked complete only after the function reads back and verifies all imported players and club associations.

## Directory behavior

The Players page searches and filters the published API roster through an indexed database function and fetches one page at a time. Player profile routes load an individual published record. If Supabase is unavailable or not configured, the site labels and shows only its local demonstration roster.

## CSV import

The optional CSV utility is for local administrative use. Fill in `roster-template.csv` and run:

```sh
npm run roster:import -- ./your-roster.csv
```

The importer reads credentials only from the ignored `.env.admin` file, processes batches of 100, and keeps database players that are not in the CSV.
