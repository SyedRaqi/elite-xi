import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.argv[2]?.trim().toLowerCase()

function fail(message) {
  console.error(message)
  process.exit(1)
}

function safeAuthMessage(error) {
  return String(error?.message ?? 'Unknown Supabase Auth error').split(serviceRoleKey).join('[redacted]')
}

function validateProjectUrl(value) {
  if (!value) fail('Missing SUPABASE_URL. Set the project URL in the ignored .env.admin file.')
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    fail('SUPABASE_URL is not a valid URL. Copy the Project URL from the same Supabase project as the backend key.')
  }
  const localHost = ['localhost', '127.0.0.1', 'host.docker.internal'].includes(parsed.hostname)
  if ((!localHost && parsed.protocol !== 'https:') || (localHost && !['http:', 'https:'].includes(parsed.protocol))
    || parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) {
    fail('SUPABASE_URL must be the Supabase project URL, without credentials, a path, or query parameters.')
  }
}

function validateServiceCredential(value) {
  if (!value) {
    fail('Missing SUPABASE_SERVICE_ROLE_KEY. Set a server-side Supabase secret key or legacy service_role key in .env.admin.')
  }
  if (value.startsWith('sb_publishable_')) {
    fail('SUPABASE_SERVICE_ROLE_KEY contains a publishable key. Replace it with this project’s server-side secret key (sb_secret_...) or legacy service_role key. Never put either key in frontend variables.')
  }
  if (value.startsWith('sb_secret_')) return

  const segments = value.split('.')
  if (segments.length !== 3) {
    fail('SUPABASE_SERVICE_ROLE_KEY is not a recognized server-side key. Use the project secret key (sb_secret_...) or legacy service_role JWT, not a publishable/anon key.')
  }

  let claims
  try {
    claims = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'))
  } catch {
    fail('SUPABASE_SERVICE_ROLE_KEY is not a valid service_role JWT. Copy the server-side key from the matching Supabase project.')
  }
  if (claims.role === 'anon') {
    fail('SUPABASE_SERVICE_ROLE_KEY contains an anon key. Replace it with this project’s server-side secret key or legacy service_role key.')
  }
  if (claims.role !== 'service_role') {
    fail('SUPABASE_SERVICE_ROLE_KEY is a JWT without the service_role claim. Use the project’s server-side secret/service_role key.')
  }
  if (typeof claims.exp === 'number' && claims.exp <= Math.floor(Date.now() / 1000)) {
    fail('SUPABASE_SERVICE_ROLE_KEY is expired. Create or copy a current server-side key for this project.')
  }
}

validateProjectUrl(url)
validateServiceCredential(serviceRoleKey)

if (!email || !email.includes('@')) {
  console.error('Usage: npm run supabase:grant-admin -- person@example.com')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let page = 1
let targetUser

while (!targetUser) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 })
  if (error) {
    const authMessage = safeAuthMessage(error)
    if (error.status === 401 || /valid bearer token|invalid api key|invalid jwt/i.test(authMessage)) {
      fail('Supabase rejected the backend credential. Confirm SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY belong to the same project, and that the key is a secret/service_role key, not a publishable/anon key.')
    }
    fail(`Could not list Auth users: ${authMessage}`)
  }

  targetUser = data.users.find((user) => user.email?.toLowerCase() === email)
  if (targetUser || data.users.length < 100) break
  page += 1
}

if (!targetUser) {
  console.error(`No Supabase Auth user found for ${email}. Create the account in the Supabase Dashboard first.`)
  process.exit(1)
}

const { error } = await supabase.auth.admin.updateUserById(targetUser.id, {
  app_metadata: { ...targetUser.app_metadata, role: 'admin' },
})

if (error) {
  const authMessage = safeAuthMessage(error)
  if (error.status === 401 || /valid bearer token|invalid api key|invalid jwt/i.test(authMessage)) {
    fail('Supabase rejected the backend credential while updating the user. Confirm the project URL and server-side secret/service_role key match.')
  }
  fail(`Could not grant admin access: ${authMessage}`)
}

console.log(`Admin role granted to ${email}. Sign out and back in to refresh the session claim.`)
