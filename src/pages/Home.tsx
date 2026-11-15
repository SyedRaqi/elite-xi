import { ArrowRight, ArrowUpRight, Activity, CalendarDays, Goal, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { players as demoPlayers } from '../data/players'
import { usePlayerStore } from '../data/PlayerStore'
import { matches } from '../data/matches'
import { PlayerCard } from '../components/PlayerCard'
import { MatchCard } from '../components/MatchCard'
import { SectionHeader } from '../components/SectionHeader'
import { StatCard } from '../components/StatCard'

const photo = 'https://commons.wikimedia.org/wiki/Special:FilePath/Cristiano_Ronaldo_in_Al_Nassr_in_2023.jpg?width=1400'

export function Home() {
  const { players } = usePlayerStore()
  const ronaldo = players.find((player) => player.id === 'cristiano-ronaldo') ?? demoPlayers[0]
  const profilePath = players.some((player) => player.id === ronaldo.id) ? `/players/${ronaldo.id}` : '/players'
  return <>
    <section className="hero" id="home-hero"><div className="hero-image" style={{ backgroundImage: `url(${photo})` }} /><div className="hero-shade" /><div className="hero-content"><p className="eyebrow"><span className="eyebrow-line" />THE ELITE XI PROFILE · 001</p><p className="hero-kicker">THE STANDARD<br />NEVER STANDS STILL.</p><h1>CRISTIANO<br /><span>RONALDO</span><i>.</i></h1><div className="hero-meta"><span>🇵🇹 &nbsp;PORTUGAL</span><span>FORWARD</span><span>AL-NASSR</span><span>NO. 07</span></div><p className="hero-copy">A career measured in moments that changed the game. Explore the numbers, chapters and ambition behind a global icon.</p><div className="hero-actions"><Link to={profilePath} className="button-lime">EXPLORE PROFILE <ArrowUpRight size={16} /></Link><Link to="/media" className="button-outline">VIEW THE GALLERY <ArrowUpRight size={15} /></Link></div></div><div className="hero-aside"><span>ELITE XI / PLAYER FILE</span><b>001<span>—</span>008</b><i>2026 / 27</i></div><div className="hero-bottomline"><span>SCROLL TO EXPLORE</span><span>01 — 06</span></div></section>
    <section className="section section-stats"><SectionHeader eyebrow="CAREER AT A GLANCE" title="NUMBERS THAT TRAVEL." description="A snapshot of a remarkable career. Figures shown are illustrative demonstration data." action={<Link className="text-link" to="/statistics">FULL STATISTICS <ArrowRight size={15} /></Link>} /><div className="stats-grid"><StatCard icon={Goal} label="CAREER GOALS" value="965" note="Club + international · sample" /><StatCard icon={Activity} label="ASSISTS" value="260" note="Career contributions · sample" /><StatCard icon={CalendarDays} label="APPEARANCES" value="1,300" note="All competitions · sample" /><StatCard icon={Trophy} label="TROPHIES" value="35" note="Team honours · sample" /></div></section>
    <section className="career-band"><div className="career-heading"><p className="eyebrow">THE LONG GAME</p><h2>EVERY ERA.<br /><span>ONE AMBITION.</span></h2><p>Six chapters. One unmistakable pursuit of excellence.</p><Link className="text-link" to={profilePath}>EXPLORE THE PROFILE <ArrowRight size={15} /></Link></div><div className="timeline">{ronaldo.career.map((chapter, index) => <div className="timeline-item" key={chapter.club}><span className="timeline-index">0{index + 1}</span><div><small>{chapter.years}</small><h3>{chapter.club}</h3></div><span className="timeline-dot" /></div>)}</div></section>
    <section className="section section-matches"><SectionHeader eyebrow="THE FIXTURE LIST" title="FORM & FIXTURES." description="Recent results and what’s next. Sample schedule for product demonstration." action={<Link className="text-link" to="/matches">MATCH CENTRE <ArrowRight size={15} /></Link>} /><div className="match-grid">{matches.slice(0, 3).map((match) => <MatchCard key={match.id} match={match} />)}</div></section>
    <section className="achievement-strip"><div><p className="eyebrow">A LEGACY IN NUMBERS</p><h2>GREATNESS<br />LEAVES A MARK.</h2></div><div className="achievement-grid"><div><b>05</b><span>BALLON D’OR</span></div><div><b>05</b><span>UEFA CHAMPIONS LEAGUE</span></div><div><b>01</b><span>EUROPEAN CHAMPION</span></div><div><b>01</b><span>ALL-TIME INT’L SCORER</span></div></div></section>
    <section className="section"><SectionHeader eyebrow="THE ROSTER" title="PLAYERS TO WATCH." description="A small selection from the world’s most compelling talent." action={<Link className="text-link" to="/players">DISCOVER ALL PLAYERS <ArrowRight size={15} /></Link>} /><div className="player-grid home-players">{players.slice(0, 4).map((player) => <PlayerCard key={player.id} player={player} />)}</div></section>
    <section className="media-teaser"><div className="media-teaser-image" style={{ backgroundImage: `url(${photo})` }} /><div><p className="eyebrow">THE GAME IN PICTURES</p><h2>BEYOND<br />THE <span>90.</span></h2><p>Moments, atmosphere and the details that make football unforgettable.</p><Link className="button-lime" to="/media">OPEN THE GALLERY <ArrowUpRight size={15} /></Link></div></section>
  </>
}
