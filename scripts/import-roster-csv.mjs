import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const csvPath = process.argv[2]
if (!csvPath) {
  console.error('Usage: npm run roster:import -- path/to/roster.csv')
  process.exit(1)
}

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the ignored .env.admin file.')
  process.exit(1)
}

function parseCsv(input) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (quoted && char === '"' && input[index + 1] === '"') { cell += '"'; index += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[index + 1] === '\n') index += 1
      row.push(cell.trim()); cell = ''
      if (row.some(Boolean)) rows.push(row)
      row = []
    } else cell += char
  }
  if (quoted) throw new Error('CSV has an unclosed quoted field.')
  if (cell.length || row.length) { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row) }
  if (rows.length < 2) throw new Error('CSV needs a header and at least one player row.')
  const headers = rows.shift().map((header) => header.replace(/^\uFEFF/, ''))
  return rows.map((values, index) => Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ''])))
}

const fileContents = await readFile(resolve(csvPath), 'utf8')
const records = parseCsv(fileContents)
const required = ['name', 'nationality', 'position', 'club', 'league']
const missing = records.flatMap((record, index) => required.filter((field) => !record[field]).map((field) => `Row ${index + 2}: missing ${field}`))
if (missing.length) throw new Error(missing.slice(0, 12).join('\n'))

const slugify = (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const ids = records.map(({ name }) => slugify(name))
if (new Set(ids).size !== ids.length) throw new Error('CSV contains duplicate player names. Each player must have a unique name.')

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
const { data: existingRows, error: readError } = await supabase.from('players').select('id,profile')
if (readError) throw new Error(`Could not read the existing roster: ${readError.message}`)
const existing = new Map(existingRows.map(({ id, profile }) => [id, profile]))
const zeroStats = { goals: 0, assists: 0, appearances: 0, trophies: 0 }
const splitList = (value) => (value ?? '').split('|').map((item) => item.trim()).filter(Boolean)
const currentYear = new Date().getFullYear()

const profiles = records.map((record, index) => {
  const id = ids[index]
  const prior = existing.get(id)
  const dob = record.dateOfBirth || prior?.dob || 'Not set'
  const parsedDob = Date.parse(dob)
  const age = Number.isNaN(parsedDob) ? prior?.age ?? 0 : Math.max(0, Math.floor((Date.now() - parsedDob) / 31_557_600_000))
  const formerClubs = splitList(record.previousClubs)
  return {
    ...prior,
    id,
    name: record.name,
    shortName: record.shortName || prior?.shortName || record.name,
    nationality: record.nationality,
    countryCode: record.countryCode || prior?.countryCode || '',
    position: record.position,
    club: record.club,
    league: record.league,
    number: Number(record.number) || prior?.number || 0,
    age,
    dob,
    birthplace: record.birthplace || prior?.birthplace || 'Not set',
    height: record.height || prior?.height || 'Not set',
    foot: record.preferredFoot || prior?.foot || 'Not set',
    image: record.portraitUrl || prior?.image || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=900&q=80',
    accent: prior?.accent || '#c7ff35',
    bio: record.bio || prior?.bio || `${record.name} represents ${record.club} and ${record.nationality}.`,
    playingStyle: record.playingStyle || prior?.playingStyle || 'Add a playing-style description to the CSV to complete this detail.',
    stats: prior?.stats || zeroStats,
    seasons: prior?.seasons || [],
    career: [...formerClubs.map((club) => ({ years: 'CAREER', club })), { years: record.clubYears || `${currentYear}–present`, club: record.club }],
    achievements: splitList(record.achievements).length ? splitList(record.achievements) : prior?.achievements || [],
    careerHighlights: splitList(record.careerHighlights).length ? splitList(record.careerHighlights) : prior?.careerHighlights || [],
  }
})

for (let start = 0; start < profiles.length; start += 100) {
  const batch = profiles.slice(start, start + 100).map((profile) => ({ id: profile.id, profile }))
  const { error } = await supabase.from('players').upsert(batch)
  if (error) throw new Error(`Could not import rows ${start + 1}–${start + batch.length}: ${error.message}`)
}

console.log(`Imported or updated ${profiles.length} players. Existing records not in the CSV were kept.`)
