interface PublicEnvironment {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

const environment = import.meta.env as PublicEnvironment

export const supabaseConfig = {
  url: environment.VITE_SUPABASE_URL ?? '',
  publishableKey: environment.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
}

export const isSupabaseConfigured = Boolean(supabaseConfig.url && supabaseConfig.publishableKey)
