import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supported = [
  { id: 39, name: 'Premier League', providerNames: ['Premier League'], country: 'England' },
  { id: 140, name: 'La Liga', providerNames: ['La Liga'], country: 'Spain' },
  { id: 78, name: 'Bundesliga', providerNames: ['Bundesliga'], country: 'Germany' },
  { id: 135, name: 'Serie A', providerNames: ['Serie A'], country: 'Italy' },
  { id: 61, name: 'Ligue 1', providerNames: ['Ligue 1'], country: 'France' },
  { id: 307, name: 'Saudi Pro League', providerNames: ['Saudi Pro League', 'Pro League'], country: 'Saudi Arabia' },
  { id: 253, name: 'Major League Soccer', providerNames: ['Major League Soccer'], country: 'USA' },
  { id: 323, name: 'Indian Super League', providerNames: ['Indian Super League'], country: 'India' },
]

const apiBase = 'https://v3.football.api-sports.io'
const maxPlayerPages = 3
const providerName = 'api-football'
const squadCacheTtlMs = 7 * 24 * 60 * 60 * 1000
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const apiKey = Deno.env.get('API_FOOTBALL_KEY') ?? ''
let adminDb: ReturnType<typeof createClient> | null = null

type RequestContext = {
  requestId: string
  action?: string
  leagueId?: number
  season?: number
  teamId?: number
  stage: string
  sensitiveValues: string[]
}

class HttpError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

function getAdminDb() {
  if (!supabaseUrl || !serviceKey) {
    throw new HttpError('Supabase Edge Function service credentials are not configured.', 503)
  }
  adminDb ??= createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  return adminDb
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function safeText(value: unknown, sensitiveValues: string[] = []): string {
  let text = value instanceof Error ? value.message : String(value ?? 'Unknown error')
  for (const secret of [apiKey, serviceKey, ...sensitiveValues]) {
    if (secret) text = text.split(secret).join('[redacted]')
  }
  return text.replace(/Bearer\s+[^\s,;"']+/gi, 'Bearer [redacted]').slice(0, 1000)
}

function logEvent(context: RequestContext, event: string, details: Record<string, unknown> = {}) {
  const record = {
    service: 'global-roster',
    event,
    requestId: context.requestId,
    action: context.action,
    stage: context.stage,
    ...(context.leagueId !== undefined ? { leagueId: context.leagueId } : {}),
    ...(context.season !== undefined ? { season: context.season } : {}),
    ...(context.teamId !== undefined ? { teamId: context.teamId } : {}),
    ...details,
  }
  console.info(JSON.stringify(record))
}

function setStage(context: RequestContext, stage: string, details: Record<string, unknown> = {}) {
  context.stage = stage
  logEvent(context, 'stage_started', details)
}

function logFailure(context: RequestContext, error: unknown, details: Record<string, unknown> = {}) {
  console.error(JSON.stringify({
    service: 'global-roster',
    event: 'stage_failed',
    requestId: context.requestId,
    action: context.action,
    stage: context.stage,
    ...(context.leagueId !== undefined ? { leagueId: context.leagueId } : {}),
    ...(context.season !== undefined ? { season: context.season } : {}),
    ...(context.teamId !== undefined ? { teamId: context.teamId } : {}),
    errorName: error instanceof Error ? error.name : 'UnknownError',
    error: safeText(error, context.sensitiveValues),
    ...details,
  }))
}

function validateActionBody(body: Record<string, unknown>): string {
  if (typeof body.action !== 'string') throw new HttpError('A roster action is required.')
  const allowedKeys: Record<string, string[]> = {
    leagues: ['action'],
    seasons: ['action', 'leagueId'],
    teams: ['action', 'leagueId', 'season', 'dataScope'],
    'create-job': ['action', 'leagueId', 'season', 'teamIds', 'dataScope'],
    'import-team': ['action', 'jobId', 'teamId'],
    'retry-failed': ['action', 'jobId'],
    history: ['action'],
    status: ['action'],
  }
  const keys = allowedKeys[body.action]
  if (!keys) throw new HttpError('Unknown roster action.')
  if (Object.keys(body).some((key) => !keys.includes(key))) {
    throw new HttpError('The request contains fields that are not valid for this roster action.')
  }
  return body.action
}

function requiredInteger(value: unknown, name: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new HttpError(`Choose a valid ${name}.`)
  }
  return value
}

function requiredJobId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError('Choose a valid import job.')
  }
  return value
}

async function requireAdmin(req: Request, context: RequestContext) {
  setStage(context, 'admin_authorization')
  const authorization = req.headers.get('Authorization')
  const token = authorization?.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError('Sign in with an administrator account to use roster imports.', 401)
  context.sensitiveValues.push(token)
  const { data, error } = await getAdminDb().auth.getUser(token)
  if (error || !data.user) throw new HttpError('Your session has expired. Sign in again.', 401)
  if (data.user.app_metadata?.role !== 'admin') throw new HttpError('Roster imports are restricted to administrators.', 403)
  logEvent(context, 'stage_completed', { authenticated: true, admin: true })
  return data.user
}

async function api<T>(
  path: string,
  params: Record<string, string | number> = {},
  context?: RequestContext,
  options: { maxAttempts?: number } = {},
): Promise<{ response: T[]; paging?: { current: number; total: number }; results?: number }> {
  if (!apiKey) throw new HttpError('API_FOOTBALL_KEY is not configured as a Supabase Edge Function secret.', 503)
  const url = new URL(path, apiBase)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))
  let lastError = 'API-Football request failed.'
  let lastStatus = 502
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 4, 4))
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let result: Response
    const startedAt = Date.now()
    context && logEvent(context, 'provider_request_started', { endpoint: path, params, attempt: attempt + 1 })
    try {
      result = await fetch(url, {
        headers: { 'x-apisports-key': apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      })
    } catch (error) {
      lastError = error instanceof Error && error.name === 'TimeoutError'
        ? 'API-Football request timed out.'
        : 'Could not reach API-Football.'
      lastStatus = error instanceof Error && error.name === 'TimeoutError' ? 504 : 502
      context && logFailure(context, error, { provider: 'API-Football', endpoint: path, attempt: attempt + 1, elapsedMs: Date.now() - startedAt })
      if (attempt === maxAttempts - 1) throw new HttpError(lastError, lastStatus)
      await new Promise((resolve) => setTimeout(resolve, 700 * (2 ** attempt)))
      continue
    }
    if (result.status === 204) {
      lastStatus = 502
      lastError = `API-Football returned no content for ${path}.`
      context && logEvent(context, 'provider_response_empty', { endpoint: path, status: result.status, attempt: attempt + 1, elapsedMs: Date.now() - startedAt })
      throw new HttpError(lastError, lastStatus)
    }
    lastStatus = result.status
    let payload: any
    try {
      payload = await result.json()
    } catch (error) {
      lastError = `API-Football returned an unreadable JSON response (HTTP ${result.status}).`
      lastStatus = result.ok ? 502 : result.status
      context && logFailure(context, error, { provider: 'API-Football', endpoint: path, status: result.status, attempt: attempt + 1, elapsedMs: Date.now() - startedAt })
      if (result.status >= 500 && attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 700 * (2 ** attempt)))
        continue
      }
      throw new HttpError(lastError, lastStatus)
    }
    const providerErrors = payload && typeof payload === 'object'
      ? typeof payload.errors === 'string'
        ? safeText(payload.errors, context?.sensitiveValues)
        : Array.isArray(payload.errors)
          ? payload.errors.map((value) => safeText(value, context?.sensitiveValues)).join('; ')
          : payload.errors && typeof payload.errors === 'object'
            ? Object.values(payload.errors).map((value) => safeText(value, context?.sensitiveValues)).join('; ')
            : ''
      : ''
    if (result.ok && !providerErrors) {
      if (!payload || typeof payload !== 'object' || !Array.isArray(payload.response)) {
        context && logEvent(context, 'provider_response_invalid', { endpoint: path, status: result.status, responseType: Array.isArray(payload?.response) ? 'array' : typeof payload?.response, elapsedMs: Date.now() - startedAt })
        throw new HttpError(`API-Football returned an unexpected response shape for ${path}.`, 502)
      }
      context && logEvent(context, 'provider_response_received', {
        endpoint: path,
        status: result.status,
        results: payload.response.length,
        page: payload.paging?.current ?? null,
        totalPages: payload.paging?.total ?? null,
        elapsedMs: Date.now() - startedAt,
      })
      return payload
    }

    lastError = result.status === 429 || /rate.?limit|too many requests/i.test(providerErrors)
      ? 'API-Football rate limit reached. Wait for the provider reset, then retry failed clubs.'
      : providerErrors
        ? `API-Football reported an error: ${providerErrors.slice(0, 300)}`
        : `API-Football returned HTTP ${result.status}.`
    lastStatus = result.status === 429 || /rate.?limit|too many requests/i.test(providerErrors)
      ? 429
      : result.status >= 500 || result.ok ? 502 : result.status
    context && logEvent(context, 'provider_response_error', {
      endpoint: path,
      status: result.status,
      providerError: safeText(providerErrors || lastError, context?.sensitiveValues).slice(0, 300),
      attempt: attempt + 1,
      elapsedMs: Date.now() - startedAt,
    })
    if (result.status !== 429 && !/rate.?limit|too many requests/i.test(providerErrors) && result.status < 500) {
      throw new HttpError(lastError, lastStatus)
    }
    const retryAfter = Number(result.headers.get('retry-after'))
    const delay = retryAfter > 0
      ? Math.min(retryAfter * 1000, 30_000)
      : lastStatus === 429
        ? Math.min(5_000 * (2 ** attempt), 30_000)
        : 700 * (2 ** attempt)
    if (attempt < maxAttempts - 1) await new Promise((resolve) => setTimeout(resolve, delay))
  }
  throw new HttpError(lastError, lastStatus === 429 ? 429 : 502)
}

function supportedLeague(leagueId: number, name?: string, country?: string) {
  const league = supported.find((item) => item.id === leagueId)
  if (!league || (name && !league.providerNames.some((providerName: string) => providerName.toLowerCase() === name.toLowerCase()))) return null
  if (country && league.country.toLowerCase() !== country.toLowerCase()
    && !(league.id === 307 && country.toLowerCase() === 'saudi-arabia')
    && !(league.id === 253 && country.toLowerCase() === 'united states')) return null
  return league
}

async function getLeague(
  leagueId: number,
  season: number,
  context?: RequestContext,
) {
  if (context) {
    context.leagueId = leagueId
    context.season = season
    setStage(context, 'provider_availability')
  }
  if (!Number.isInteger(leagueId) || !supported.some((league) => league.id === leagueId)
    || !Number.isInteger(season) || season < 1990 || season > new Date().getFullYear() + 1) {
    throw new HttpError('Choose a valid competition and season.')
  }
  const { data: cachedLeague, error: cachedLeagueError } = await getAdminDb().from('football_leagues')
    .select('league_id,season,name,country,logo,coverage,is_current,cached_at')
    .eq('league_id', leagueId)
    .eq('season', season)
    .gt('cached_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
    .maybeSingle()
  if (cachedLeagueError) throw new HttpError(`Could not check cached league availability: ${cachedLeagueError.message}`, 500)
  const cachedCoverage = (cachedLeague?.coverage as Record<string, unknown> | null)?.players === true
  if (cachedLeague && supportedLeague(leagueId, cachedLeague.name, cachedLeague.country ?? undefined) && cachedCoverage) {
    context && logEvent(context, 'stage_completed', { source: 'cache', dataScope: 'historical', playersAvailable: cachedCoverage })
    return {
      league: { id: leagueId, name: cachedLeague.name },
      country: { name: cachedLeague.country },
      selectedSeason: { year: season, coverage: cachedLeague.coverage },
    }
  }
  const { response: rows } = await api<any>('/leagues', { id: leagueId, season }, context)
  const found = rows[0]
  if (!found || !supportedLeague(leagueId, found.league?.name, found.country?.name)) {
    throw new HttpError('That league or season is not available for the supported competitions.', 404)
  }
  if (!Array.isArray(found.seasons)) throw new HttpError('API-Football returned an invalid season list for this competition.', 502)
  const seasonData = found.seasons.find((entry: any) => Number(entry?.year) === season)
  if (!seasonData) throw new HttpError('The provider does not list this season for the selected league.', 404)
  if (seasonData.coverage?.players !== true) {
    throw new HttpError('Player data is not confirmed as available for this league and season on the current API plan.', 422)
  }
  const displayLeague = supported.find((league) => league.id === leagueId)
  const { error: cacheError } = await getAdminDb().from('football_leagues').upsert({
    league_id: leagueId,
    season,
    name: displayLeague?.name ?? found.league.name,
    country: found.country?.name ?? null,
    logo: found.league.logo ?? null,
    coverage: seasonData.coverage ?? {},
    is_current: seasonData.current === true,
    cached_at: new Date().toISOString(),
  }, { onConflict: 'league_id,season' })
  if (cacheError) throw new HttpError(`Could not cache league availability: ${cacheError.message}`, 500)
  context && logEvent(context, 'stage_completed', { source: 'provider', dataScope: 'historical', playersAvailable: seasonData.coverage?.players === true })
  return {
    ...found,
    league: { ...found.league, name: displayLeague?.name ?? found.league.name },
    selectedSeason: seasonData,
  }
}

async function getTeams(leagueId: number, season: number | null, context?: RequestContext) {
  if (context) {
    context.leagueId = leagueId
    if (season !== null) context.season = season
    setStage(context, 'club_listing')
  }
  if (season === null) {
    const { data: cached, error: cacheError } = await getAdminDb().from('football_current_clubs')
      .select('team_id,name,country,logo,cached_at')
      .eq('league_id', leagueId)
      .gt('cached_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
    if (cacheError) throw new HttpError(`Could not check cached current clubs: ${cacheError.message}`, 500)
    if (cached?.length) {
      const teams = cached.map((team: any) => ({ id: Number(team.team_id), name: team.name, country: team.country, logo: team.logo }))
      context && logEvent(context, 'stage_completed', { source: 'cache', clubs: teams.length, dataScope: 'current_squad' })
      return teams
    }

    const { response: rows } = await api<any>('/teams', { league: leagueId }, context)
    const teams = rows.filter((row: any) => row && typeof row === 'object')
      .map((row: any) => ({ id: Number(row.team?.id), name: row.team?.name, country: row.team?.country, logo: row.team?.logo }))
      .filter((team: any) => Number.isSafeInteger(team.id) && team.id > 0 && typeof team.name === 'string' && team.name.trim())
    if (!teams.length) {
      throw new HttpError(`API-Football returned no clubs for provider competition ${leagueId}. The provider may not expose this competition on the configured plan.`, 404)
    }
    const cachedAt = new Date().toISOString()
    const { error: clearError } = await getAdminDb().from('football_current_clubs').delete().eq('league_id', leagueId)
    if (clearError) throw new HttpError(`Could not refresh the current club cache: ${clearError.message}`, 500)
    const { error: writeError } = await getAdminDb().from('football_current_clubs').upsert(teams.map((team: any) => ({
      league_id: leagueId, team_id: team.id, name: team.name, country: team.country ?? null, logo: team.logo ?? null, cached_at: cachedAt,
    })), { onConflict: 'league_id,team_id' })
    if (writeError) throw new HttpError(`Could not cache current clubs: ${writeError.message}`, 500)
    context && logEvent(context, 'stage_completed', { source: 'provider', endpoint: '/teams', clubs: teams.length, dataScope: 'current_squad' })
    return teams
  }

  const { data: cached, error: cacheError } = await getAdminDb().from('football_clubs').select('team_id,name,country,logo,cached_at')
    .eq('league_id', leagueId).eq('season', season).gt('cached_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
  if (cacheError) throw new HttpError(`Could not check cached clubs: ${cacheError.message}`, 500)
  if (cached?.length) {
    const teams = cached.map((team: any) => ({ id: Number(team.team_id), name: team.name, country: team.country, logo: team.logo }))
    context && logEvent(context, 'stage_completed', { source: 'cache', clubs: teams.length })
    return teams
  }

  const { response: rows } = await api<any>('/teams', { league: leagueId, season }, context)
  const teams = rows.filter((row: any) => row && typeof row === 'object').map((row: any) => ({ id: Number(row.team?.id), name: row.team?.name, country: row.team?.country, logo: row.team?.logo }))
    .filter((team: any) => Number.isInteger(team.id) && team.name)
  if (teams.length) {
    const upserts = teams.map((team: any) => ({ team_id: team.id, league_id: leagueId, season, name: team.name, country: team.country, logo: team.logo, cached_at: new Date().toISOString() }))
    const { error } = await getAdminDb().from('football_clubs').upsert(upserts, { onConflict: 'team_id,league_id,season' })
    if (error) throw new HttpError(`Could not cache clubs: ${error.message}`, 500)
  }
  context && logEvent(context, 'stage_completed', { source: 'provider', clubs: teams.length })
  return teams
}

async function updateJob(jobId: string) {
  const { data: teamRows, error: teamError } = await getAdminDb().from('roster_import_teams').select('status,imported_players').eq('job_id', jobId)
  if (teamError) throw new HttpError(teamError.message, 500)
  if (!Array.isArray(teamRows)) throw new HttpError('Could not read import team status rows.', 500)
  const completed = teamRows.filter((row: any) => row.status === 'completed').length
  const failed = teamRows.filter((row: any) => row.status === 'failed').length
  const pending = teamRows.length - completed - failed
  const imported = teamRows.reduce((total: number, row: any) => total + (row.imported_players || 0), 0)
  const status = pending ? 'running' : failed ? (completed ? 'completed_with_errors' : 'failed') : 'completed'
  const { error } = await getAdminDb().from('roster_import_jobs').update({ total_teams: teamRows.length, completed_teams: completed, failed_teams: failed, imported_players: imported, status, updated_at: new Date().toISOString() }).eq('id', jobId)
  if (error) throw new HttpError(error.message, 500)
}

function normalizeEntry(
  entry: any,
  selectedLeague: any,
  team: any,
  season: number | null,
  syncedAt: string,
  dataScope: 'historical' | 'current_squad' = 'historical',
) {
  if (!entry || typeof entry !== 'object' || !entry.player || typeof entry.player !== 'object') return null
  const person = entry.player
  const statistics = Array.isArray(entry.statistics) ? entry.statistics.filter((item: any) => item && typeof item === 'object') : []
  const statistic = statistics.find((item: any) => Number(item.team?.id) === Number(team.id)) ?? statistics[0] ?? {}
  const playerId = Number(person.id)
  if (!Number.isSafeInteger(playerId) || playerId <= 0) return null
  const rawFirstName = typeof person.firstname === 'string' ? person.firstname.trim() : ''
  const rawLastName = typeof person.lastname === 'string' ? person.lastname.trim() : ''
  const name = (typeof person.name === 'string' ? person.name.trim() : '') || [rawFirstName, rawLastName].filter(Boolean).join(' ')
  if (!name) return null
  const firstName = rawFirstName || name.split(' ')[0]
  const lastName = rawLastName || name.slice(firstName.length).trim()
  const rawPosition = typeof statistic.games?.position === 'string' ? statistic.games.position
    : typeof person.position === 'string' ? person.position : ''
  const position = rawPosition.trim() || 'Unknown'
  const normalizedPosition = position === 'Attacker' ? 'Forward' : position
  const apps = dataScope === 'historical' ? Number(statistic.games?.appearences ?? statistic.games?.appearances ?? 0) || 0 : 0
  const goals = dataScope === 'historical' ? Number(statistic.goals?.total ?? 0) || 0 : 0
  const assists = dataScope === 'historical' ? Number(statistic.goals?.assists ?? 0) || 0 : 0
  const rawNumber = Number(statistic.games?.number ?? person.number ?? 0) || 0
  const number = Number.isInteger(rawNumber) && rawNumber >= 0 && rawNumber <= 99 ? rawNumber : 0
  const rawAge = Number(person.age ?? 0) || 0
  const age = Number.isInteger(rawAge) && rawAge >= 0 && rawAge <= 120 ? rawAge : 0
  const rawHeight = Number.parseInt(typeof person.height === 'string' ? person.height : '', 10)
  const heightCm = Number.isInteger(rawHeight) && rawHeight >= 1 && rawHeight <= 300 ? rawHeight : null
  const rawWeight = Number.parseInt(typeof person.weight === 'string' ? person.weight : '', 10)
  const weightKg = Number.isInteger(rawWeight) && rawWeight >= 1 && rawWeight <= 400 ? rawWeight : null
  const rawFoot = typeof person.foot === 'string' ? person.foot.trim().toLowerCase() : ''
  const preferredFoot = rawFoot === 'right' ? 'Right' : rawFoot === 'left' ? 'Left' : rawFoot === 'both' ? 'Both' : null
  const nationality = typeof person.nationality === 'string' ? person.nationality : ''
  const photo = typeof person.photo === 'string' ? person.photo : ''
  const birthDateValue = typeof person.birth?.date === 'string' ? person.birth.date : ''
  const birthPlace = typeof person.birth?.place === 'string' ? person.birth.place : ''
  const height = typeof person.height === 'string' ? person.height : ''
  const weight = typeof person.weight === 'string' ? person.weight : ''
  const profile = {
    id: `api-football-${playerId}`, name, shortName: name, nationality, countryCode: '',
    position: normalizedPosition, club: team.name, league: selectedLeague.league.name, number,
    dataScope,
    statisticsScope: dataScope === 'historical' ? 'historical' as const : 'unavailable' as const,
    syncedAt,
    age, dob: birthDateValue || 'Not provided', birthplace: birthPlace || 'Not provided',
    height: height || 'Not provided', foot: preferredFoot ?? 'Not provided', image: photo, accent: '#c7ff35',
    bio: dataScope === 'current_squad'
      ? `${name} is listed in API-Football's current ${team.name} squad. This snapshot does not include season statistics.`
      : `${name} is listed by API-Football for ${team.name} in ${selectedLeague.league.name}.`,
    playingStyle: 'Not provided by API-Football.', careerHighlights: [],
    stats: { goals, assists, appearances: apps, trophies: 0 },
    seasons: season === null ? [] : [{ season: String(season), club: team.name, apps, goals, assists }],
    career: season === null ? [] : [{ years: String(season), club: team.name }], achievements: [],
  }
  const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(birthDateValue) ? birthDateValue : null
  return {
    row: {
      id: profile.id, external_api_id: playerId, profile, first_name: firstName, last_name: lastName,
      age: profile.age || null, birth_date: birthDate, nationality: profile.nationality || null,
      height_cm: heightCm, weight_kg: weightKg,
      position: normalizedPosition, preferred_foot: preferredFoot, jersey_number: number || null, photo_url: photo || null,
      current_club: team.name, league_name: selectedLeague.league.name, season, data_scope: dataScope, synced_at: syncedAt, is_published: true,
    },
    competition: season === null ? null : {
      player_id: profile.id, team_id: Number(team.id), league_id: Number(selectedLeague.league.id), season,
      club_name: team.name, league_name: selectedLeague.league.name,
      stats: { appearances: apps, goals, assists, position: normalizedPosition, shirtNumber: number }, synced_at: syncedAt,
    },
    currentSquadAssociation: season === null ? {
      player_id: profile.id, team_id: Number(team.id), league_id: Number(selectedLeague.league.id),
      club_name: team.name, league_name: selectedLeague.league.name, synced_at: syncedAt,
    } : null,
  }
}

function unpackCurrentSquad(responseRows: unknown, teamId: number): any[] | null {
  if (!Array.isArray(responseRows) || responseRows.length !== 1) return null
  const squad = responseRows[0]
  if (!squad || typeof squad !== 'object' || Number(squad.team?.id) !== teamId || !Array.isArray(squad.players)) return null
  if (squad.players.some((player: any) => !player || typeof player !== 'object'
    || !Number.isSafeInteger(Number(player.id)) || Number(player.id) <= 0
    || typeof player.name !== 'string' || !player.name.trim())) return null
  return squad.players.map((player: any) => ({ player, statistics: [] }))
}

function mergeExistingCurrentProfile(item: any, existing: any) {
  const prior = existing?.profile && typeof existing.profile === 'object' ? existing.profile : null
  if (!prior) return
  const profile = item.row.profile
  const historicalSnapshot = prior.dataScope === 'current_squad'
    ? prior.historicalSnapshot
    : prior
  const hasHistoricalStats = Boolean(historicalSnapshot && (
    Array.isArray(historicalSnapshot.seasons) && historicalSnapshot.seasons.length > 0
    || historicalSnapshot.stats && typeof historicalSnapshot.stats === 'object'
  ))
  const mergedProfile = {
    ...profile,
    nationality: profile.nationality || prior.nationality || '',
    age: profile.age || prior.age || 0,
    number: profile.number || prior.number || 0,
    position: profile.position !== 'Unknown' ? profile.position : prior.position || 'Unknown',
    image: profile.image || prior.image || '',
    dob: profile.dob !== 'Not provided' ? profile.dob : prior.dob || 'Not provided',
    birthplace: profile.birthplace !== 'Not provided' ? profile.birthplace : prior.birthplace || 'Not provided',
    height: profile.height !== 'Not provided' ? profile.height : prior.height || 'Not provided',
    foot: profile.foot !== 'Not provided' ? profile.foot : prior.foot || 'Not provided',
    ...(hasHistoricalStats ? {
      statisticsScope: 'historical',
      stats: historicalSnapshot.stats,
      seasons: Array.isArray(historicalSnapshot.seasons) ? historicalSnapshot.seasons : [],
      career: Array.isArray(historicalSnapshot.career) ? historicalSnapshot.career : [],
      historicalSnapshot,
    } : {}),
  }
  item.row.profile = mergedProfile
  item.row.age = mergedProfile.age || null
  item.row.birth_date = existing.birth_date ?? item.row.birth_date
  item.row.nationality = mergedProfile.nationality || null
  item.row.height_cm = existing.height_cm ?? item.row.height_cm
  item.row.weight_kg = existing.weight_kg ?? item.row.weight_kg
  item.row.position = mergedProfile.position
  item.row.preferred_foot = existing.preferred_foot ?? item.row.preferred_foot
  item.row.jersey_number = mergedProfile.number || null
  item.row.photo_url = mergedProfile.image || null
}

async function importTeam(jobId: string, userId: string, teamId: number, context: RequestContext) {
  context.teamId = teamId
  setStage(context, 'import_job_lookup')
  const { data: job, error: jobError } = await getAdminDb().from('roster_import_jobs').select('*').eq('id', jobId).eq('created_by', userId).maybeSingle()
  if (jobError || !job) throw new HttpError('Import job was not found for your account.', 404)
  context.leagueId = Number(job.league_id)
  const dataScope: 'historical' | 'current_squad' = job.data_scope === 'current_squad' ? 'current_squad' : 'historical'
  const selectedSeason = job.season === null ? null : Number(job.season)
  if (selectedSeason !== null) context.season = selectedSeason
  logEvent(context, 'stage_completed', { found: true, dataScope })
  setStage(context, 'club_lookup')
  const { data: teamRecord, error: teamError } = await getAdminDb().from('roster_import_teams').select('*').eq('job_id', jobId).eq('team_id', teamId).maybeSingle()
  if (teamError || !teamRecord) throw new HttpError('That club is not part of this import job.', 404)
  logEvent(context, 'stage_completed', { found: true })
  setStage(context, 'club_import_lock')
  const { data: startedTeam, error: startError } = await getAdminDb().from('roster_import_teams')
    .update({ status: 'running', attempts: teamRecord.attempts + 1, error: null, updated_at: new Date().toISOString() })
    .eq('id', teamRecord.id)
    .neq('status', 'running')
    .select('id')
    .maybeSingle()
  if (startError) throw new HttpError(`Could not start club import: ${startError.message}`, 500)
  if (!startedTeam) throw new HttpError('This club is already being imported. Refresh import history before retrying.', 409)
  logEvent(context, 'stage_completed', { locked: true, attempt: Number(teamRecord.attempts) + 1 })

  try {
    if (dataScope === 'historical' && selectedSeason === null) {
      throw new HttpError('The historical import job has no season recorded.', 500)
    }
    const displayLeague = supported.find((item) => item.id === Number(job.league_id))
    if (!displayLeague) throw new HttpError('The import job references an unsupported competition.', 400)
    const league = dataScope === 'current_squad'
      ? { league: { id: Number(job.league_id), name: displayLeague.name } }
      : await getLeague(Number(job.league_id), selectedSeason as number, context)
    const team = { id: Number(teamRecord.team_id), name: teamRecord.team_name }
    const leagueId = Number(job.league_id)
    setStage(context, 'squad_cache_lookup')
    let cacheQuery = getAdminDb().from('football_squad_cache')
      .select('response,cached_at')
      .eq('provider', providerName)
      .eq('snapshot_type', dataScope)
      .eq('team_id', team.id)
      .eq('league_id', leagueId)
      .eq('cache_key', dataScope === 'current_squad' ? 'current' : `season:${selectedSeason}`)
      .gt('cached_at', new Date(Date.now() - (dataScope === 'current_squad' ? squadCacheTtlMs : 6 * 60 * 60 * 1000)).toISOString())
    cacheQuery = selectedSeason === null ? cacheQuery.is('season', null) : cacheQuery.eq('season', selectedSeason)
    const { data: cachedSquad, error: squadCacheError } = await cacheQuery.maybeSingle()
    if (squadCacheError) throw new HttpError(`Could not check the cached squad: ${squadCacheError.message}`, 500)

    let allEntries: any[]
    let syncedAt: string
    let usedCache = false
    const cachedEntries = dataScope === 'current_squad'
      ? unpackCurrentSquad(cachedSquad?.response, team.id)
      : Array.isArray(cachedSquad?.response) ? cachedSquad.response : null
    const usableCachedEntries = cachedEntries?.length ? cachedEntries : null
    if (cachedSquad && !usableCachedEntries) {
      logEvent(context, 'squad_cache_malformed', { provider: providerName, snapshotType: dataScope })
    }
    logEvent(context, 'stage_completed', { cacheHit: Boolean(usableCachedEntries), snapshotType: dataScope })
    if (usableCachedEntries) {
      allEntries = usableCachedEntries
      syncedAt = cachedSquad.cached_at
      usedCache = true
      setStage(context, 'club_squad_retrieval', { source: 'cache' })
      logEvent(context, 'stage_completed', { source: 'cache', players: allEntries.length })
    } else {
      setStage(context, 'club_squad_retrieval', { source: 'API-Football' })
      let cacheResponse: unknown
      if (dataScope === 'current_squad') {
        const payload = await api<any>('/players/squads', { team: team.id }, context, { maxAttempts: 1 })
        const entries = unpackCurrentSquad(payload.response, team.id)
        if (!entries) throw new HttpError('API-Football returned an invalid current-squad response for this club.', 502)
        if (!entries.length) throw new HttpError("API-Football returned no players for this club's current squad.", 422)
        allEntries = entries
        cacheResponse = payload.response
        logEvent(context, 'current_squad_received', {
          endpoint: '/players/squads',
          requestedPage: null,
          returnedPlayers: allEntries.length,
        })
      } else {
        allEntries = []
        let page = 1
        let totalPages = 1
        let expectedPages: number | null = null
        do {
          const payload = await api<any>('/players', { team: team.id, season: selectedSeason as number, page }, context)
          if (!Array.isArray(payload.response)) throw new HttpError(`API-Football returned an invalid player list on page ${page}.`, 502)
          const requestedPage = Number(payload.paging?.current)
          totalPages = Number(payload.paging?.total)
          if (!Number.isSafeInteger(requestedPage) || requestedPage !== page
            || !Number.isSafeInteger(totalPages) || totalPages < 1 || totalPages < requestedPage) {
            throw new HttpError('API-Football returned invalid pagination data for this club squad.', 502)
          }
          if (expectedPages !== null && totalPages !== expectedPages) {
            throw new HttpError('API-Football pagination changed while retrieving this club squad. No partial roster was imported.', 502)
          }
          expectedPages = totalPages
          context && logEvent(context, 'squad_page_received', { endpoint: '/players', requestedPage: page, returnedPlayers: payload.response.length, totalPages })
          if (totalPages > maxPlayerPages) {
            throw new HttpError(`API-Football requires ${totalPages} pages for this club and season, but this plan allows at most ${maxPlayerPages}. No partial roster was imported.`, 422)
          }
          allEntries.push(...payload.response)
          page += 1
        } while (page <= totalPages)
        cacheResponse = allEntries
      }
      if (!allEntries.length) throw new HttpError('API-Football returned no players for this club and requested roster.', 422)
      syncedAt = new Date().toISOString()
      setStage(context, 'squad_cache_write', { entries: allEntries.length })
      const { error: cacheWriteError } = await getAdminDb().from('football_squad_cache').upsert({
        provider: providerName,
        team_id: team.id,
        league_id: leagueId,
        season: selectedSeason,
        snapshot_type: dataScope,
        cache_key: selectedSeason === null ? 'current' : `season:${selectedSeason}`,
        response: cacheResponse,
        cached_at: syncedAt,
      }, { onConflict: 'provider,team_id,league_id,cache_key' })
      if (cacheWriteError) throw new HttpError(`Could not cache the fetched squad: ${cacheWriteError.message}`, 500)
      logEvent(context, 'stage_completed', { players: allEntries.length, snapshotType: dataScope })
    }

    setStage(context, 'player_normalization', { providerEntries: allEntries.length, snapshotType: dataScope })
    const normalized = allEntries.map((entry) => normalizeEntry(entry, league, team, selectedSeason, syncedAt, dataScope)).filter(Boolean)
    if (normalized.length !== allEntries.length) {
      throw new HttpError('Some provider squad entries were malformed. No partial roster was imported.', 422)
    }
    const uniqueById = new Map(normalized.map((item: any) => [item.row.external_api_id, item]))
    const records = [...uniqueById.values()] as any[]
    logEvent(context, 'stage_completed', { providerEntries: allEntries.length, validRecords: normalized.length, uniquePlayers: records.length })
    if (!records.length) throw new HttpError('API-Football returned no usable player records for this club.', 422)
    if (records.length !== normalized.length) throw new HttpError('API-Football returned duplicate player IDs for this squad. No partial roster was imported.', 502)
    let previousCurrentPlayerIds: string[] = []
    if (dataScope === 'current_squad') {
      const externalIds = records.map((item) => item.row.external_api_id)
      const { data: previousAssociations, error: previousAssociationsError } = await getAdminDb().from('player_current_squads')
        .select('player_id').eq('team_id', team.id).eq('league_id', leagueId)
      if (previousAssociationsError) throw new HttpError(`Could not inspect existing current club associations: ${previousAssociationsError.message}`, 500)
      if (!Array.isArray(previousAssociations)) throw new HttpError('The database returned an invalid current association list.', 500)
      previousCurrentPlayerIds = previousAssociations.map((row: any) => String(row.player_id))
      const { data: existingPlayers, error: existingError } = await getAdminDb().from('players')
        .select('external_api_id,profile,age,birth_date,nationality,height_cm,weight_kg,preferred_foot,jersey_number')
        .in('external_api_id', externalIds)
      if (existingError) throw new HttpError(`Could not preserve existing player history: ${existingError.message}`, 500)
      if (!Array.isArray(existingPlayers)) throw new HttpError('The database returned an invalid existing-player result.', 500)
      const existingById = new Map(existingPlayers.map((item: any) => [Number(item.external_api_id), item]))
      for (const item of records) mergeExistingCurrentProfile(item, existingById.get(item.row.external_api_id))
    }
    setStage(context, 'player_database_upsert', { players: records.length })
    for (let index = 0; index < records.length; index += 100) {
      const { error } = await getAdminDb().from('players').upsert(records.slice(index, index + 100).map((item) => item.row), { onConflict: 'external_api_id' })
      if (error) throw new HttpError(`Player write failed: ${error.message}`, 500)
    }
    logEvent(context, 'stage_completed', { players: records.length, batchSize: 100 })
    setStage(context, 'club_association_upsert', { associations: records.length })
    if (dataScope === 'current_squad') {
      for (let index = 0; index < records.length; index += 100) {
        const { error } = await getAdminDb().from('player_current_squads')
          .upsert(records.slice(index, index + 100).map((item) => item.currentSquadAssociation), { onConflict: 'player_id' })
        if (error) throw new HttpError(`Current club association write failed: ${error.message}`, 500)
      }
    } else {
      for (let index = 0; index < records.length; index += 100) {
        const { error } = await getAdminDb().from('player_competitions')
          .upsert(records.slice(index, index + 100).map((item) => item.competition), { onConflict: 'player_id,team_id,league_id,season' })
        if (error) throw new HttpError(`Club association write failed: ${error.message}`, 500)
      }
    }
    logEvent(context, 'stage_completed', { associations: records.length, batchSize: 100 })
    if (records.length) {
      setStage(context, 'read_back_verification', { players: records.length })
      const externalIds = records.map((item) => item.row.external_api_id)
      const playerIds = records.map((item) => item.row.id)
      const { data: savedPlayers, error: playerCheckError } = await getAdminDb().from('players')
        .select('external_api_id,data_scope').in('external_api_id', externalIds)
      if (playerCheckError) throw new HttpError(`Could not verify saved players: ${playerCheckError.message}`, 500)
      if (!Array.isArray(savedPlayers)) throw new HttpError('The database returned an invalid player verification result.', 500)
      const verifiedPlayerIds = new Set(savedPlayers
        .filter((row: any) => row.data_scope === dataScope)
        .map((row: any) => Number(row.external_api_id)))
      if (verifiedPlayerIds.size !== externalIds.length) {
        throw new HttpError('The database did not confirm every imported player record.', 500)
      }
      const associationQuery = dataScope === 'current_squad'
        ? getAdminDb().from('player_current_squads').select('player_id,team_id,league_id')
          .eq('team_id', team.id).eq('league_id', Number(league.league.id)).in('player_id', playerIds)
        : getAdminDb().from('player_competitions').select('player_id,team_id,league_id,season')
          .eq('team_id', team.id).eq('league_id', Number(league.league.id)).eq('season', selectedSeason as number).in('player_id', playerIds)
      const { data: savedAssociations, error: associationCheckError } = await associationQuery
      if (associationCheckError) throw new HttpError(`Could not verify player-club associations: ${associationCheckError.message}`, 500)
      if (!Array.isArray(savedAssociations)) throw new HttpError('The database returned an invalid club association verification result.', 500)
      if (new Set(savedAssociations.map((row: any) => row.player_id)).size !== playerIds.length) {
        throw new HttpError('The database did not confirm every player-club association.', 500)
      }
      if (dataScope === 'current_squad') {
        const importedIds = new Set(playerIds)
        const staleIds = previousCurrentPlayerIds.filter((playerId) => !importedIds.has(playerId))
        if (staleIds.length) {
          setStage(context, 'stale_current_association_cleanup', { stalePlayers: staleIds.length })
          const { error: staleDeleteError } = await getAdminDb().from('player_current_squads').delete()
            .eq('team_id', team.id).eq('league_id', leagueId).in('player_id', staleIds)
          if (staleDeleteError) throw new HttpError(`Could not remove stale current club associations: ${staleDeleteError.message}`, 500)
          const { data: remainingAssociations, error: remainingAssociationsError } = await getAdminDb().from('player_current_squads')
            .select('player_id').in('player_id', staleIds)
          if (remainingAssociationsError) throw new HttpError(`Could not verify stale current associations: ${remainingAssociationsError.message}`, 500)
          if (!Array.isArray(remainingAssociations)) throw new HttpError('The database returned an invalid remaining association list.', 500)
          const stillCurrent = new Set(remainingAssociations.map((row: any) => String(row.player_id)))
          const noLongerCurrent = staleIds.filter((playerId) => !stillCurrent.has(playerId))
          if (noLongerCurrent.length) {
            const { data: retiredPlayers, error: retiredPlayersError } = await getAdminDb().from('players')
              .select('id,profile').in('id', noLongerCurrent)
            if (retiredPlayersError) throw new HttpError(`Could not inspect retired squad profiles: ${retiredPlayersError.message}`, 500)
            if (!Array.isArray(retiredPlayers)) throw new HttpError('The database returned an invalid retired-player result.', 500)
            const withoutHistory = retiredPlayers.filter((row: any) => !row.profile?.historicalSnapshot).map((row: any) => String(row.id))
            if (withoutHistory.length) {
              const { error: hideRetiredError } = await getAdminDb().from('players').update({ is_published: false }).in('id', withoutHistory)
              if (hideRetiredError) throw new HttpError(`Could not remove former squad players from the current directory: ${hideRetiredError.message}`, 500)
            }
          }
          logEvent(context, 'stage_completed', { staleAssociationsRemoved: staleIds.length, formerPlayersHidden: noLongerCurrent.length })
        }
      }
      logEvent(context, 'stage_completed', { playersVerified: externalIds.length, associationsVerified: playerIds.length, dataScope })
    }
    setStage(context, 'import_history_update')
    const { error } = await getAdminDb().from('roster_import_teams').update({ status: 'completed', imported_players: records.length, error: null, updated_at: new Date().toISOString() }).eq('id', teamRecord.id)
    if (error) throw new HttpError(error.message, 500)
    await updateJob(jobId)
    logEvent(context, 'stage_completed', { importedPlayers: records.length, cached: usedCache })
    return { teamId, teamName: team.name, importedPlayers: records.length, cached: usedCache, dataScope }
  } catch (error) {
    logFailure(context, error)
    const message = safeText(error, context.sensitiveValues)
    try {
      setStage(context, 'persist_import_failure')
      const [teamStatusResult, jobStatusResult] = await Promise.allSettled([
        getAdminDb().from('roster_import_teams').update({ status: 'failed', error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq('id', teamRecord.id),
        getAdminDb().from('roster_import_jobs').update({ last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq('id', jobId),
      ])
      if (teamStatusResult.status === 'rejected' || jobStatusResult.status === 'rejected') {
        throw new Error('A database request rejected while saving failure status.')
      }
      const teamStatusError = teamStatusResult.value.error
      const jobStatusError = jobStatusResult.value.error
      if (teamStatusError || jobStatusError) {
        logFailure(context, teamStatusError ?? jobStatusError, { operation: 'persist_import_failure' })
      } else {
        logEvent(context, 'stage_completed', { failureRecorded: true })
        await updateJob(jobId)
      }
    } catch (persistError) {
      logFailure(context, persistError, { operation: 'persist_import_failure' })
    }
    throw error
  }
}

Deno.serve(async (req: Request) => {
  const context: RequestContext = {
    requestId: crypto.randomUUID(),
    stage: 'request_received',
    sensitiveValues: [],
  }
  try {
    logEvent(context, 'request_received', { method: req.method })
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return response({ error: 'Use POST for roster actions.' }, 405)
    const user = await requireAdmin(req, context)
    setStage(context, 'request_validation')
    if (!req.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      throw new HttpError('Send roster actions as JSON.', 415)
    }
    const rawBody = await req.text()
    if (rawBody.length > 20_000) throw new HttpError('Roster request is too large.', 413)
    let body: Record<string, any>
    try {
      const parsed: unknown = JSON.parse(rawBody)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected an object.')
      body = parsed as Record<string, any>
    } catch {
      throw new HttpError('The request body must be valid JSON.', 400)
    }
    const action = validateActionBody(body)
    context.action = action
    logEvent(context, 'stage_completed', { action })

    if (action === 'leagues') {
      const { response: rows } = await api<any>('/leagues', { current: 'true' }, context)
      const results = rows.filter((row: any) => supportedLeague(Number(row.league?.id), row.league?.name, row.country?.name))
      const cache = results.flatMap((row: any) => (row.seasons ?? []).filter((season: any) => season.current).map((season: any) => ({
        league_id: Number(row.league.id), season: Number(season.year), name: supported.find((item) => item.id === Number(row.league.id))?.name ?? row.league.name, country: row.country?.name ?? '', logo: row.league.logo ?? null,
        coverage: season.coverage ?? {}, is_current: true, cached_at: new Date().toISOString(),
      })))
      if (cache.length) {
        const { error } = await getAdminDb().from('football_leagues').upsert(cache, { onConflict: 'league_id,season' })
        if (error) throw new HttpError(`Could not cache league list: ${error.message}`, 500)
      }
      const byId = new Map(results.map((row: any) => [Number(row.league.id), row]))
      return response({
        leagues: supported.map((league) => {
          const row = byId.get(league.id)
          return {
            id: league.id,
            name: league.name,
            country: row?.country?.name ?? league.country,
            logo: row?.league?.logo ?? '',
            available: Boolean(row?.seasons?.some((season: any) => season.current === true)),
            currentSeason: row?.seasons?.filter((season: any) => season.current === true)
              .map((season: any) => Number(season.year)).filter(Number.isInteger).sort((a: number, b: number) => b - a)[0] ?? null,
            seasons: (row?.seasons ?? []).map((season: any) => ({
              year: Number(season.year),
              current: Boolean(season.current),
              available: season.coverage?.players === true,
            })),
          }
        }),
      })
    }

    if (action === 'seasons') {
      const leagueId = requiredInteger(body.leagueId, 'competition', 1, Number.MAX_SAFE_INTEGER)
      context.leagueId = leagueId
      if (!Number.isInteger(leagueId) || !supported.some((league) => league.id === leagueId)) {
        throw new HttpError('Choose one of the supported competitions.')
      }
      const { response: rows } = await api<any>('/leagues', { id: leagueId }, context)
      const row = rows.find((entry: any) => supportedLeague(leagueId, entry.league?.name, entry.country?.name))
      if (!row) throw new HttpError('This competition is not in the supported list.', 404)
      const seasons = (row.seasons ?? []).map((season: any) => ({
        year: Number(season.year),
        current: Boolean(season.current),
        available: season.coverage?.players === true,
        coverage: season.coverage?.players === true,
      })).filter((season: any) => Number.isInteger(season.year)).sort((a: any, b: any) => b.year - a.year)
      const displayName = supported.find((league) => league.id === leagueId)?.name ?? row.league.name
      const cache = seasons.map((season: any) => ({
        league_id: leagueId,
        season: season.year,
        name: displayName,
        country: row.country?.name ?? null,
        logo: row.league.logo ?? null,
        coverage: { players: season.coverage },
        is_current: season.current === true,
        cached_at: new Date().toISOString(),
      }))
      if (cache.length) {
        const { error } = await getAdminDb().from('football_leagues').upsert(cache, { onConflict: 'league_id,season' })
        if (error) throw new HttpError(`Could not cache league seasons: ${error.message}`, 500)
      }
      return response({ seasons })
    }

    if (action === 'teams') {
      const leagueId = requiredInteger(body.leagueId, 'competition', 1, Number.MAX_SAFE_INTEGER)
      const dataScope = body.dataScope === undefined ? 'historical' : body.dataScope
      if (dataScope !== 'historical' && dataScope !== 'current_squad') throw new HttpError('Choose a valid roster data scope.')
      if (!supported.some((league) => league.id === leagueId)) throw new HttpError('Choose one of the supported competitions.')
      if (dataScope === 'current_squad') {
        return response({ teams: await getTeams(leagueId, null, context) })
      }
      const season = requiredInteger(body.season, 'season', 1990, new Date().getFullYear() + 1)
      await getLeague(leagueId, season, context)
      return response({ teams: await getTeams(leagueId, season, context) })
    }

    if (action === 'create-job') {
      const leagueId = requiredInteger(body.leagueId, 'competition', 1, Number.MAX_SAFE_INTEGER)
      const dataScope = body.dataScope === undefined ? 'historical' : body.dataScope
      if (dataScope !== 'historical' && dataScope !== 'current_squad') throw new HttpError('Choose a valid roster data scope.')
      if (!supported.some((league) => league.id === leagueId)) throw new HttpError('Choose one of the supported competitions.')
      const season = dataScope === 'historical'
        ? requiredInteger(body.season, 'season', 1990, new Date().getFullYear() + 1)
        : null
      const league = dataScope === 'historical'
        ? await getLeague(leagueId, season as number, context)
        : { league: { id: leagueId, name: supported.find((item) => item.id === leagueId)!.name } }
      const availableTeams = await getTeams(leagueId, season, context)
      if (body.teamIds !== undefined && (!Array.isArray(body.teamIds) || body.teamIds.length > 200
        || body.teamIds.some((teamId) => typeof teamId !== 'number' || !Number.isSafeInteger(teamId) || teamId <= 0)
        || new Set(body.teamIds).size !== body.teamIds.length)) {
        throw new HttpError('Choose at most 200 clubs for one import job.')
      }
      const requested = Array.isArray(body.teamIds) ? new Set(body.teamIds) : null
      if (requested && [...requested].some((teamId) => !availableTeams.some((team: any) => team.id === teamId))) {
        throw new HttpError(dataScope === 'current_squad'
          ? 'One or more selected clubs were not returned by API-Football for this competition.'
          : 'One or more selected clubs are not available in this competition and season.', 400)
      }
      const teams = requested ? availableTeams.filter((team: any) => requested.has(team.id)) : availableTeams
      if (!teams.length) throw new HttpError('No clubs selected for import.')
      const { data: job, error } = await getAdminDb().from('roster_import_jobs').insert({
        created_by: user.id,
        league_id: leagueId,
        league_name: league.league.name,
        season: dataScope === 'current_squad' ? null : season,
        data_scope: dataScope,
        total_teams: teams.length,
        status: 'queued',
      }).select().single()
      if (error) throw new HttpError(error.message, 500)
      const { error: teamInsertError } = await getAdminDb().from('roster_import_teams').insert(teams.map((team: any) => ({ job_id: job.id, team_id: team.id, team_name: team.name })))
      if (teamInsertError) {
        const message = `Could not create club import records: ${teamInsertError.message}`
        const { error: updateError } = await getAdminDb().from('roster_import_jobs')
          .update({ status: 'failed', last_error: message.slice(0, 1000), updated_at: new Date().toISOString() })
          .eq('id', job.id)
        if (updateError) throw new HttpError(`${message}; could not update the import history: ${updateError.message}`, 500)
        throw new HttpError(message, 500)
      }
      return response({ job, teams })
    }

    if (action === 'import-team') {
      const jobId = requiredJobId(body.jobId)
      const teamId = requiredInteger(body.teamId, 'club', 1, Number.MAX_SAFE_INTEGER)
      const result = await importTeam(
        jobId,
        user.id,
        teamId,
        context,
      )
      return response(result)
    }

    if (action === 'retry-failed') {
      const jobId = requiredJobId(body.jobId)
      const { data: ownedJob, error: ownedJobError } = await getAdminDb().from('roster_import_jobs')
        .select('id').eq('id', jobId).eq('created_by', user.id).maybeSingle()
      if (ownedJobError || !ownedJob) throw new HttpError('Import job was not found for your account.', 404)
      const { data: failedTeams, error } = await getAdminDb().from('roster_import_teams').select('team_id,team_name').eq('job_id', jobId).eq('status', 'failed')
      if (error) throw new HttpError(error.message, 500)
      if (!failedTeams?.length) return response({ retried: 0 })
      const results = []
      for (const team of failedTeams) {
        try {
          const retryContext: RequestContext = { ...context, sensitiveValues: context.sensitiveValues, teamId: Number(team.team_id) }
          results.push({ ok: true, ...(await importTeam(jobId, user.id, Number(team.team_id), retryContext)) })
        }
        catch (error) { results.push({ ok: false, teamId: team.team_id, teamName: team.team_name, error: safeText(error, context.sensitiveValues) }) }
      }
      return response({ retried: results.length, results })
    }

    if (action === 'history') {
      const { data, error } = await getAdminDb().from('roster_import_jobs').select('*,roster_import_teams(*)').eq('created_by', user.id).order('created_at', { ascending: false }).limit(20)
      if (error) throw new HttpError(error.message, 500)
      return response({ jobs: data ?? [] })
    }

    if (action === 'status') {
      const payload = await api<any>('/status', {}, context)
      return response(payload.response?.[0] ?? {})
    }

    throw new HttpError('Unknown roster action.')
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    const message = safeText(error, context.sensitiveValues)
    logFailure(context, error, { httpStatus: status })
    try {
      return response({ error: message }, status)
    } catch (responseError) {
      logFailure(context, responseError, { operation: 'error_response_serialization' })
      return new Response('{"error":"The roster request failed."}', {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }
})
