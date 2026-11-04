import type { Player } from './player'

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type ImportJob = {
  id: string
  created_by: string
  league_id: number
  league_name: string
  season: number | null
  data_scope: 'historical' | 'current_squad'
  status: 'queued' | 'running' | 'completed' | 'completed_with_errors' | 'failed'
  total_teams: number
  completed_teams: number
  imported_players: number
  failed_teams: number
  last_error: string | null
  created_at: string
  updated_at: string
}

export type ImportTeam = {
  id: string
  job_id: string
  team_id: number
  team_name: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  attempts: number
  imported_players: number
  error: string | null
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      players: {
        Row: {
          id: string
          profile: Player
          data_scope: 'historical' | 'current_squad'
          external_api_id: number | null
          first_name: string | null
          last_name: string | null
          age: number | null
          birth_date: string | null
          nationality: string | null
          height_cm: number | null
          weight_kg: number | null
          position: string | null
          preferred_foot: string | null
          jersey_number: number | null
          photo_url: string | null
          current_club: string | null
          league_name: string | null
          season: number | null
          synced_at: string | null
          is_published: boolean
          updated_at: string
        }
        Insert: {
          id: string
          profile: Player
          data_scope?: 'historical' | 'current_squad'
          external_api_id?: number | null
          first_name?: string | null
          last_name?: string | null
          age?: number | null
          birth_date?: string | null
          nationality?: string | null
          height_cm?: number | null
          weight_kg?: number | null
          position?: string | null
          preferred_foot?: string | null
          jersey_number?: number | null
          photo_url?: string | null
          current_club?: string | null
          league_name?: string | null
          season?: number | null
          synced_at?: string | null
          is_published?: boolean
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['players']['Insert']>
        Relationships: []
      }
      football_leagues: {
        Row: { league_id: number; season: number; name: string; country: string | null; logo: string | null; coverage: Json; is_current: boolean; cached_at: string }
        Insert: { league_id: number; season: number; name: string; country?: string | null; logo?: string | null; coverage?: Json; is_current?: boolean; cached_at?: string }
        Update: Partial<Database['public']['Tables']['football_leagues']['Insert']>
        Relationships: []
      }
      football_clubs: {
        Row: { team_id: number; league_id: number; season: number; name: string; country: string | null; logo: string | null; cached_at: string }
        Insert: { team_id: number; league_id: number; season: number; name: string; country?: string | null; logo?: string | null; cached_at?: string }
        Update: Partial<Database['public']['Tables']['football_clubs']['Insert']>
        Relationships: []
      }
      football_current_clubs: {
        Row: { league_id: number; team_id: number; name: string; country: string | null; logo: string | null; cached_at: string }
        Insert: { league_id: number; team_id: number; name: string; country?: string | null; logo?: string | null; cached_at?: string }
        Update: Partial<Database['public']['Tables']['football_current_clubs']['Insert']>
        Relationships: []
      }
      player_competitions: {
        Row: { player_id: string; team_id: number; league_id: number; season: number; club_name: string; league_name: string; stats: Json; synced_at: string }
        Insert: { player_id: string; team_id: number; league_id: number; season: number; club_name: string; league_name: string; stats?: Json; synced_at?: string }
        Update: Partial<Database['public']['Tables']['player_competitions']['Insert']>
        Relationships: []
      }
      player_current_squads: {
        Row: { player_id: string; team_id: number; league_id: number; club_name: string; league_name: string; synced_at: string }
        Insert: { player_id: string; team_id: number; league_id: number; club_name: string; league_name: string; synced_at?: string }
        Update: Partial<Database['public']['Tables']['player_current_squads']['Insert']>
        Relationships: []
      }
      roster_import_jobs: {
        Row: ImportJob
        Insert: Omit<ImportJob, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<ImportJob>
        Relationships: []
      }
      roster_import_teams: {
        Row: ImportTeam
        Insert: Omit<ImportTeam, 'id' | 'updated_at'>
        Update: Partial<ImportTeam>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      global_player_directory_page: {
        Args: {
          p_search?: string | null
          p_league?: string | null
          p_club?: string | null
          p_nationality?: string | null
          p_position?: string | null
          p_limit?: number
          p_offset?: number
        }
        Returns: Array<{
          total_count: number
          id: string
          profile: Player
          external_api_id: number
          first_name: string | null
          last_name: string | null
          nationality: string | null
          height_cm: number | null
          weight_kg: number | null
          position: string | null
          preferred_foot: string | null
          jersey_number: number | null
          photo_url: string | null
          current_club: string | null
          league_name: string | null
          season: number | null
          synced_at: string | null
        }>
      }
      global_player_directory_facets: { Args: Record<string, never>; Returns: Json }
      'global-roster': { Args: Record<string, Json | undefined>; Returns: Json }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
