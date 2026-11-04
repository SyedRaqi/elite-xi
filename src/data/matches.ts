export type Match = { id: string; competition: string; home: string; away: string; score?: string; date: string; status: 'FT' | 'UPCOMING'; result?: 'WIN' | 'DRAW' | 'LOSS' }

export const matches: Match[] = [
  { id: 'm1', competition: 'Saudi Pro League', home: 'Al-Nassr', away: 'Al-Ittihad', score: '2 — 1', date: '29 OCT 2026', status: 'FT', result: 'WIN' },
  { id: 'm2', competition: 'Saudi Pro League', home: 'Al-Hilal', away: 'Al-Nassr', score: '1 — 1', date: '24 OCT 2026', status: 'FT', result: 'DRAW' },
  { id: 'm3', competition: 'King’s Cup', home: 'Al-Nassr', away: 'Al-Ahli', score: '3 — 0', date: '19 OCT 2026', status: 'FT', result: 'WIN' },
  { id: 'm4', competition: 'Saudi Pro League', home: 'Al-Nassr', away: 'Al-Qadsiah', date: '08 NOV 2026 · 20:00', status: 'UPCOMING' },
  { id: 'm5', competition: 'AFC Champions League', home: 'Al-Nassr', away: 'Al-Sadd', date: '14 NOV 2026 · 21:15', status: 'UPCOMING' },
  { id: 'm6', competition: 'Saudi Pro League', home: 'Al-Taawoun', away: 'Al-Nassr', date: '21 NOV 2026 · 19:30', status: 'UPCOMING' },
]
