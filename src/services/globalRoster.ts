import type { ImportJob, ImportTeam } from '../types/database'
import { isSupabaseConfigured } from './supabaseConfig'

export type LeagueSeason = { year: number; current: boolean; available: boolean; coverage?: boolean | null }
export type FootballLeague = { id: number; name: string; country: string; logo: string; available: boolean; currentSeason: number | null; seasons: LeagueSeason[] }
export type FootballClub = { id: number; name: string; country?: string; logo?: string }
export type ImportJobWithTeams = ImportJob & { roster_import_teams: ImportTeam[] }

const inFlight = new Map<string, Promise<unknown>>()

function deduplicateRequest<T>(key: string, request: () => Promise<T>): Promise<T> {
  const pending = inFlight.get(key)
  if (pending) return pending as Promise<T>
  const promise = request().finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
  return promise
}

async function cachedResponse<T>(key: string, fetch: () => Promise<T>): Promise<T> {
  try {
    const stored = sessionStorage.getItem(`elite-xi:${key}`)
    if (stored) {
      const cached: unknown = JSON.parse(stored)
      if (cached && typeof cached === 'object' && 'savedAt' in cached && 'value' in cached
        && typeof cached.savedAt === 'number' && Date.now() - cached.savedAt < 30 * 60 * 1000) {
        return cached.value as T
      }
    }
  } catch {
    // Continue to the server if browser storage is unavailable or invalid.
  }
  return deduplicateRequest(key, async () => {
    const value = await fetch()
    try {
      sessionStorage.setItem(`elite-xi:${key}`, JSON.stringify({ savedAt: Date.now(), value }))
    } catch {
      // The edge function and database remain the source of truth.
    }
    return value
  })
}

async function invokeRoster<T>(body: Record<string, unknown>): Promise<T> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Add its public URL and publishable key before using roster imports.')
  }
  const { supabase } = await import('./supabase')
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data, error } = await supabase.functions.invoke<unknown>('global-roster', { body })
  if (error) {
    let message = error.message
    if (error.context instanceof Response) {
      try {
        const payload: unknown = await error.context.clone().json()
        if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
          message = payload.error
        }
      } catch {
        // Keep the Functions client's error message when the response is not JSON.
      }
    }
    throw new Error(message)
  }
  if (!data || typeof data !== 'object') throw new Error('The roster service returned an empty or invalid response.')
  if ('error' in data && typeof data.error === 'string') throw new Error(data.error)
  return data as T
}

export function getAvailableLeagues() {
  return cachedResponse('football-leagues-current-squads-v1', () => invokeRoster<{ leagues: FootballLeague[] }>({ action: 'leagues' }))
}

export function getLeagueSeasons(leagueId: number) {
  return cachedResponse(`league-seasons-${leagueId}`, () => invokeRoster<{ seasons: LeagueSeason[] }>({ action: 'seasons', leagueId }))
}

export function getLeagueClubs(leagueId: number, season?: number, dataScope: 'historical' | 'current_squad' = 'historical') {
  return invokeRoster<{ teams: FootballClub[] }>({
    action: 'teams', leagueId, dataScope,
    ...(dataScope === 'historical' && season !== undefined ? { season } : {}),
  })
}

export function createImportJob(leagueId: number, season?: number, teamIds?: number[], dataScope: 'historical' | 'current_squad' = 'historical') {
  return invokeRoster<{ job: ImportJob; teams: FootballClub[] }>({
    action: 'create-job',
    leagueId,
    dataScope,
    ...(dataScope === 'historical' && season !== undefined ? { season } : {}),
    ...(teamIds ? { teamIds } : {}),
  })
}

export function importClub(jobId: string, teamId: number) {
  return invokeRoster<{ teamId: number; teamName: string; importedPlayers: number; cached: boolean }>({
    action: 'import-team',
    jobId,
    teamId,
  })
}

export function retryFailedClubs(jobId: string) {
  return invokeRoster<{
    retried: number
    results: Array<{ ok: boolean; teamId: number; teamName: string; importedPlayers?: number; error?: string }>
  }>({ action: 'retry-failed', jobId })
}

export function getImportHistory() {
  return deduplicateRequest('import-history', () => invokeRoster<{ jobs: ImportJobWithTeams[] }>({ action: 'history' }))
}
