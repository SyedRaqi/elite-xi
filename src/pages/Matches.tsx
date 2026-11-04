import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { matches } from '../data/matches'
import { MatchCard } from '../components/MatchCard'
import { SectionHeader } from '../components/SectionHeader'

export function Matches() {
  const [filter, setFilter] = useState<'ALL' | 'RESULTS' | 'FIXTURES'>('ALL')
  const shown = matches.filter((match) => filter === 'ALL' || (filter === 'RESULTS' ? match.status === 'FT' : match.status === 'UPCOMING'))
  return <div className="page-wrap"><div className="page-masthead"><p className="eyebrow">FORM · FIXTURES · COMPETITIONS</p><h1>THE MATCH<br /><span>CENTRE.</span></h1><p>Follow recent results and upcoming fixtures across the Elite XI sample schedule.</p></div><section className="section section-tight"><SectionHeader eyebrow="SAUDI PRO LEAGUE & CUP" title="ON THE CALENDAR." description="All match details below are illustrative demonstration content." action={<span className="sample-chip"><CalendarDays size={14} /> SAMPLE SCHEDULE</span>} /><div className="segmented">{(['ALL', 'RESULTS', 'FIXTURES'] as const).map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div><div className="match-grid match-grid-page">{shown.map((match) => <MatchCard key={match.id} match={match} />)}</div></section></div>
}
