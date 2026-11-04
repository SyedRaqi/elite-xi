import { ArrowRight } from 'lucide-react'
import type { Match } from '../data/matches'

export function MatchCard({ match }: { match: Match }) {
  return <article className="match-card"><div className="match-meta"><span>{match.competition}</span><span>{match.status === 'FT' ? 'FULL TIME' : 'FIXTURE'}</span></div><div className="match-teams"><strong>{match.home}</strong><span className={match.status === 'FT' ? 'match-score' : 'match-vs'}>{match.score ?? 'VS'}</span><strong>{match.away}</strong></div><div className="match-bottom"><span>{match.date}</span>{match.result && <span className={`result ${match.result.toLowerCase()}`}>{match.result}</span>}<ArrowRight size={15} /></div></article>
}
