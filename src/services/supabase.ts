import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import { isSupabaseConfigured, supabaseConfig } from './supabaseConfig'

/** A publishable key is safe for browser use only when the database enforces RLS. */
export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseConfig.url, supabaseConfig.publishableKey)
  : null
