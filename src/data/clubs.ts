export type ClubShowcase = {
  name: string
  country: string
  league: string
  apiFootballId: number
  accent: string
  atmosphere: string
}

// Crest images use API-Football's public media CDN; no API key is sent by the browser.
export const clubShowcase: ClubShowcase[] = [
  { name: 'Manchester City', country: 'England', league: 'Premier League', apiFootballId: 50, accent: '#68c8ff', atmosphere: 'photo-1508098682722-e99c643e7f0b' },
  { name: 'Real Madrid', country: 'Spain', league: 'La Liga', apiFootballId: 541, accent: '#e8c87e', atmosphere: 'photo-1574629810360-7efbbe195018' },
  { name: 'Barcelona', country: 'Spain', league: 'La Liga', apiFootballId: 529, accent: '#bd75ff', atmosphere: 'photo-1517466787929-bc90951d0974' },
  { name: 'Liverpool', country: 'England', league: 'Premier League', apiFootballId: 40, accent: '#ff727c', atmosphere: 'photo-1522778119026-d647f0596c20' },
  { name: 'Bayern Munich', country: 'Germany', league: 'Bundesliga', apiFootballId: 157, accent: '#ff6b7b', atmosphere: 'photo-1431324155629-1a6deb1dec8d' },
  { name: 'Paris Saint-Germain', country: 'France', league: 'Ligue 1', apiFootballId: 85, accent: '#9b91ff', atmosphere: 'photo-1521412644187-c49fa049e84d' },
  { name: 'Arsenal', country: 'England', league: 'Premier League', apiFootballId: 42, accent: '#ff817e', atmosphere: 'photo-1553778263-73a83bab9b0c' },
  { name: 'Chelsea', country: 'England', league: 'Premier League', apiFootballId: 49, accent: '#63a9ff', atmosphere: 'photo-1518604666860-9ed391f76460' },
]
