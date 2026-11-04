import { players as demoPlayers } from '../data/players'
import type { Player } from '../types/player'

const STORAGE_KEY = 'elite-xi:players:v1'

export interface PlayerRepository {
  load(): Player[]
  save(players: Player[]): boolean
}

/** Browser-only repository used until a remote Supabase repository is configured. */
export const localPlayerRepository: PlayerRepository = {
  load() {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
      if (Array.isArray(stored) && stored.every((player) => typeof player?.id === 'string' && typeof player?.name === 'string')) return stored as Player[]
    } catch {
      // An unavailable or invalid local cache falls back to the built-in roster.
    }
    return demoPlayers
  },
  save(players) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(players))
      return true
    } catch {
      return false
    }
  },
}
