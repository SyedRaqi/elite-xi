import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { players as demoPlayers } from './players'
import { localPlayerRepository } from '../services/playerRepository'
import { deleteRemotePlayer, getRemotePlayerById, upsertRemotePlayer } from '../services/supabasePlayerRepository'
import { isSupabaseConfigured } from '../services/supabaseConfig'
import type { Player } from '../types/player'

export type PlayerBasics = Pick<Player, 'name' | 'club' | 'nationality' | 'position'>
export type RosterSource = 'local' | 'loading' | 'remote' | 'remote-error'

type PlayerStoreValue = {
  players: Player[]
  storageAvailable: boolean
  rosterSource: RosterSource
  user: User | null
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  addPlayer: (details: PlayerBasics) => Promise<void>
  updatePlayer: (id: string, details: PlayerBasics) => Promise<void>
  deletePlayer: (id: string) => Promise<void>
  resetPlayers: () => Promise<void>
}

const PlayerStore = createContext<PlayerStoreValue | null>(null)

export function PlayerStoreProvider({ children }: { children: ReactNode }) {
  const [players, setPlayers] = useState<Player[]>(() => localPlayerRepository.load())
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [rosterSource, setRosterSource] = useState<RosterSource>(isSupabaseConfigured ? 'loading' : 'local')
  const [user, setUser] = useState<User | null>(null)
  const isAdmin = user?.app_metadata?.role === 'admin'

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let active = true
    let unsubscribe = () => {}

    void (async () => {
      const { supabase } = await import('../services/supabase')
      if (!supabase || !active) return
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (active) setUser(session?.user ?? null)
      })
      unsubscribe = () => subscription.unsubscribe()
      const { data: { session } } = await supabase.auth.getSession()
      if (active) setUser(session?.user ?? null)
      if (active) setRosterSource('remote')
    })().catch(() => {
      if (active) setRosterSource('remote-error')
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    setStorageAvailable(localPlayerRepository.save(players))
  }, [players])

  const value = useMemo<PlayerStoreValue>(() => {
    const requireRemoteAdmin = () => {
      if (rosterSource !== 'local' && rosterSource !== 'remote-error' && !isAdmin) {
        throw new Error('Sign in with an administrator account to change the shared roster.')
      }
      if (rosterSource === 'loading') throw new Error('Wait for the shared roster connection to finish.')
    }

    return {
      players,
      storageAvailable,
      rosterSource,
      user,
      isAdmin,
      signIn: async (email, password) => {
        if (!isSupabaseConfigured) throw new Error('Supabase is not configured.')
        const { supabase } = await import('../services/supabase')
        if (!supabase) throw new Error('Supabase is not configured.')
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      },
      signOut: async () => {
        if (!isSupabaseConfigured) return
        const { supabase } = await import('../services/supabase')
        if (!supabase) return
        const { error } = await supabase.auth.signOut()
        if (error) throw error
      },
      addPlayer: async (details) => {
        requireRemoteAdmin()
        const base = details.name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `player-${Date.now()}`
        const id = players.some((player) => player.id === base) ? `${base}-${Date.now()}` : base
        const newPlayer: Player = {
          id,
          ...details,
          shortName: details.name.trim(),
          countryCode: '',
          league: 'Unassigned',
          number: 0,
          age: 0,
          dob: 'Not set',
          birthplace: 'Not set',
          height: 'Not set',
          foot: 'Not set',
          image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=900&q=80',
          accent: '#c7ff35',
          bio: 'Profile details can be expanded in the player editor.',
          playingStyle: 'Not set',
          careerHighlights: [],
          stats: { goals: 0, assists: 0, appearances: 0, trophies: 0 },
          seasons: [],
          career: [{ years: 'CURRENT', club: details.club }],
          achievements: [],
        }
        if (rosterSource === 'remote') await upsertRemotePlayer(newPlayer)
        setPlayers((current) => [newPlayer, ...current])
      },
      updatePlayer: async (id, details) => {
        requireRemoteAdmin()
        const current = players.find((player) => player.id === id)
          ?? (rosterSource === 'remote' ? await getRemotePlayerById(id) : null)
        if (!current) throw new Error('That player is no longer in the roster.')
        const updated: Player = { ...current, ...details, shortName: details.name.trim(), career: current.career.map((item, index) => index === current.career.length - 1 ? { ...item, club: details.club } : item) }
        if (rosterSource === 'remote') await upsertRemotePlayer(updated)
        setPlayers((items) => items.map((player) => player.id === id ? updated : player))
      },
      deletePlayer: async (id) => {
        requireRemoteAdmin()
        if (rosterSource === 'remote') await deleteRemotePlayer(id)
        setPlayers((current) => current.filter((player) => player.id !== id))
      },
      resetPlayers: async () => {
        requireRemoteAdmin()
        if (rosterSource === 'remote') {
          throw new Error('The shared roster cannot be replaced with demo data. Remove or edit individual records instead.')
        }
        setPlayers(demoPlayers)
      },
    }
  }, [players, storageAvailable, rosterSource, user, isAdmin])

  return <PlayerStore.Provider value={value}>{children}</PlayerStore.Provider>
}

export function usePlayerStore() {
  const value = useContext(PlayerStore)
  if (!value) throw new Error('usePlayerStore must be used within PlayerStoreProvider.')
  return value
}
