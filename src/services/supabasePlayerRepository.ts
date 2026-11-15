import type { Player } from '../types/player'
import type { Database } from '../types/database'
import { isSupabaseConfigured } from './supabaseConfig'

export type GlobalPlayerRecord = Pick<
  Database['public']['Functions']['global_player_directory_page']['Returns'][number],
  | 'id'
  | 'profile'
  | 'external_api_id'
  | 'first_name'
  | 'last_name'
  | 'nationality'
  | 'height_cm'
  | 'weight_kg'
  | 'position'
  | 'preferred_foot'
  | 'jersey_number'
  | 'photo_url'
  | 'current_club'
  | 'league_name'
  | 'season'
  | 'synced_at'
>

export type GlobalPlayerFilters = {
  search?: string
  league?: string
  club?: string
  nationality?: string
  position?: string
}

export type GlobalPlayerFacets = {
  leagues: string[]
  clubs: string[]
  nationalities: string[]
  positions: string[]
}

const pendingReads = new Map<string, Promise<unknown>>()

function deduplicateRead<T>(key: string, read: () => Promise<T>): Promise<T> {
  const pending = pendingReads.get(key)
  if (pending) return pending as Promise<T>
  const request = read().finally(() => pendingReads.delete(key))
  pendingReads.set(key, request)
  return request
}

async function getClient() {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
  }
  const { supabase } = await import('./supabase')
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function boundedSearch(search: string | undefined): string | null {
  const value = search?.trim().replace(/[%_*]/g, '').slice(0, 100)
  return value || null
}

export function getGlobalPlayerPage(
  filters: GlobalPlayerFilters,
  page: number,
  pageSize = 24,
): Promise<{ players: GlobalPlayerRecord[]; total: number }> {
  const key = `directory:${JSON.stringify({ ...filters, search: boundedSearch(filters.search), page, pageSize })}`
  return deduplicateRead(key, async () => {
    const client = await getClient()
    const { data, error } = await client.rpc('global_player_directory_page', {
      p_search: boundedSearch(filters.search),
      p_league: filters.league || null,
      p_club: filters.club || null,
      p_nationality: filters.nationality || null,
      p_position: filters.position || null,
      p_limit: pageSize,
      p_offset: Math.max(0, page) * pageSize,
    })
    if (error) throw error
    return {
      players: data.map(({ total_count: _total, ...player }) => player),
      total: data[0]?.total_count ?? 0,
    }
  })
}

export function getGlobalPlayerFacets(): Promise<GlobalPlayerFacets> {
  return deduplicateRead('directory-facets', async () => {
    const client = await getClient()
    const { data, error } = await client.rpc('global_player_directory_facets')
    if (error) throw error
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('The roster filter options returned an invalid response.')
    }
    const facets = data as Partial<GlobalPlayerFacets>
    return {
      leagues: Array.isArray(facets.leagues) ? facets.leagues.filter((value): value is string => typeof value === 'string') : [],
      clubs: Array.isArray(facets.clubs) ? facets.clubs.filter((value): value is string => typeof value === 'string') : [],
      nationalities: Array.isArray(facets.nationalities) ? facets.nationalities.filter((value): value is string => typeof value === 'string') : [],
      positions: Array.isArray(facets.positions) ? facets.positions.filter((value): value is string => typeof value === 'string') : [],
    }
  })
}

export async function getGlobalPlayerById(id: string): Promise<Player | null> {
  const client = await getClient()
  const { data, error } = await client.from('players')
    .select('profile,data_scope')
    .eq('id', id)
    .not('external_api_id', 'is', null)
    .eq('is_published', true)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  if (data.data_scope === 'current_squad') {
    const { data: association, error: associationError } = await client.from('player_current_squads')
      .select('player_id').eq('player_id', id).maybeSingle()
    if (associationError) throw associationError
    if (!association) return data.profile.historicalSnapshot ?? null
  }
  return data.profile
}

export async function getRemotePlayerById(id: string): Promise<Player | null> {
  const client = await getClient()
  const { data, error } = await client.from('players')
    .select('profile')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data?.profile ?? null
}

function optionalNumber(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function playerRow(player: Player): Database['public']['Tables']['players']['Insert'] {
  const nameParts = player.name.trim().split(/\s+/)
  const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(player.dob) ? player.dob : null
  return {
    id: player.id,
    profile: player,
    first_name: nameParts[0] ?? null,
    last_name: nameParts.slice(1).join(' ') || null,
    age: player.age > 0 ? player.age : null,
    birth_date: birthDate,
    nationality: player.nationality || null,
    height_cm: optionalNumber(player.height),
    position: player.position || null,
    preferred_foot: ['Right', 'Left', 'Both'].includes(player.foot) ? player.foot : null,
    jersey_number: player.number > 0 ? player.number : null,
    photo_url: player.image || null,
    current_club: player.club || null,
    league_name: player.league || null,
    is_published: true,
  }
}

/** Database RLS limits mutations to authenticated administrators. */
export async function upsertRemotePlayer(player: Player): Promise<void> {
  const client = await getClient()
  const { error } = await client.from('players').upsert(playerRow(player), { onConflict: 'id' })
  if (error) throw error
}

export async function deleteRemotePlayer(id: string): Promise<void> {
  const client = await getClient()
  const { error } = await client.from('players').delete().eq('id', id)
  if (error) throw error
}
