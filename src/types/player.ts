export type Player = {
  id: string
  dataScope?: 'historical' | 'current_squad'
  statisticsScope?: 'historical' | 'unavailable'
  syncedAt?: string
  historicalSnapshot?: Player
  name: string
  shortName: string
  nationality: string
  countryCode: string
  position: string
  club: string
  league: string
  number: number
  age: number
  dob: string
  birthplace: string
  height: string
  foot: string
  image: string
  accent: string
  bio: string
  playingStyle: string
  careerHighlights: string[]
  stats: { goals: number; assists: number; appearances: number; trophies: number }
  seasons: { season: string; club: string; apps: number; goals: number; assists: number }[]
  career: { years: string; club: string }[]
  achievements: string[]
}
