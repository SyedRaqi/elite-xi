import { Activity, ArrowLeft, ArrowUpRight, Award, CalendarDays, Footprints, Goal, Ruler, Shield, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SectionHeader } from '../components/SectionHeader'
import { StatCard } from '../components/StatCard'
import { PlayerPortrait } from '../components/PlayerPortrait'
import { usePlayerStore } from '../data/PlayerStore'
import { getGlobalPlayerById } from '../services/supabasePlayerRepository'
import type { Player } from '../types/player'

export function PlayerProfile() {
  const { playerId = '' } = useParams()
  const { players, rosterSource } = usePlayerStore()
  const [globalLookup, setGlobalLookup] = useState<{
    id: string
    status: 'loading' | 'ready' | 'error'
    player?: Player | null
    error?: string
  } | null>(null)
  const isGlobalPlayerId = playerId.startsWith('api-football-')

  useEffect(() => {
    if (!isGlobalPlayerId || rosterSource === 'loading') return
    if (rosterSource !== 'remote') {
      setGlobalLookup(null)
      return
    }
    let active = true
    setGlobalLookup({ id: playerId, status: 'loading' })
    void getGlobalPlayerById(playerId)
      .then((record) => {
        if (!active) return
        setGlobalLookup({ id: playerId, status: 'ready', player: record })
      })
      .catch((error: unknown) => {
        if (!active) return
        setGlobalLookup({
          id: playerId,
          status: 'error',
          error: error instanceof Error ? error.message : 'The player profile could not be loaded.',
        })
      })
    return () => { active = false }
  }, [isGlobalPlayerId, playerId, rosterSource])

  const currentLookup = globalLookup?.id === playerId ? globalLookup : null
  const player = currentLookup?.status === 'ready'
    ? currentLookup.player ?? undefined
    : isGlobalPlayerId ? undefined : players.find((candidate) => candidate.id === playerId)

  if (isGlobalPlayerId && (rosterSource === 'loading' || rosterSource === 'remote' && (!currentLookup || currentLookup.status === 'loading'))) {
    return <div className="empty-state profile-not-found"><h1>LOADING PLAYER.</h1><p>Fetching this profile from the published global roster…</p></div>
  }
  if (currentLookup?.status === 'error') {
    return <div className="empty-state profile-not-found"><h1>PROFILE UNAVAILABLE.</h1><p>{currentLookup.error}</p><Link className="button-lime" to="/players"><ArrowLeft size={15} /> BACK TO PLAYERS</Link></div>
  }
  if (!player) return <div className="empty-state profile-not-found"><h1>PLAYER NOT FOUND.</h1><p>This profile is not in the current roster.</p><Link className="button-lime" to="/players"><ArrowLeft size={15} /> BACK TO PLAYERS</Link></div>

  const isImported = player.id.startsWith('api-football-')
  const isCurrentSquad = player.dataScope === 'current_squad'
  const hasHistoricalStats = player.statisticsScope === 'historical'
  return <div className="player-profile">
    <section className="profile-hero">
      <PlayerPortrait className="profile-photo profile-photo-image" name={player.name} fallback={player.image || '/images/player-fallback.svg'} preferFallback={isImported} /><div className="profile-overlay" />
      <div className="profile-hero-content"><Link to="/players" className="back-link"><ArrowLeft size={15} /> ALL PLAYERS</Link><p className="eyebrow">{isCurrentSquad ? 'CURRENT SQUAD PLAYER' : 'PLAYER FILE'} · {player.club.toUpperCase()}</p><span className="profile-number">{player.number > 0 ? String(player.number).padStart(2, '0') : '—'}</span><h1>{player.name.split(' ').map((part, i) => <span key={`${part}-${i}`}>{part}<br /></span>)}</h1><div className="hero-meta"><span>{player.nationality.toUpperCase() || 'NATIONALITY NOT PROVIDED'}</span><span>{player.position.toUpperCase()}</span><span>{player.club.toUpperCase()}</span><span>{player.league.toUpperCase()}</span></div><p className="profile-bio">{player.bio}</p><a className="button-outline" href="#profile-stats">{isCurrentSquad ? 'PLAYER DATA' : 'CAREER OVERVIEW'} <ArrowUpRight size={15} /></a></div>
    </section>
    <section className="section" id="profile-stats"><SectionHeader eyebrow={isCurrentSquad ? hasHistoricalStats ? 'PRESERVED HISTORICAL STATISTICS' : 'CURRENT SQUAD SNAPSHOT' : isImported ? 'IMPORTED SEASON DATA' : 'DEMONSTRATION DATA'} title={isCurrentSquad && !hasHistoricalStats ? 'SQUAD DETAILS.' : 'THE NUMBERS.'} description={isCurrentSquad && !hasHistoricalStats ? 'API-Football’s current squad endpoint does not provide season statistics. No historical totals are inferred.' : isImported ? 'Historical statistics are kept separate from the current squad listing.' : 'Demonstration career figures are shown for interface preview only.'} />{isCurrentSquad && !hasHistoricalStats ? <p className="roster-inline-state">CURRENT SQUAD · Last synced {player.syncedAt ? new Date(player.syncedAt).toLocaleString() : 'time unavailable'}</p> : <div className="stats-grid"><StatCard icon={Goal} label="GOALS" value={player.stats.goals} note={isCurrentSquad ? 'Historical data' : isImported ? 'Selected season' : 'Demo only'} /><StatCard icon={Activity} label="ASSISTS" value={player.stats.assists} note={isCurrentSquad ? 'Historical data' : isImported ? 'Selected season' : 'Demo only'} /><StatCard icon={CalendarDays} label="APPEARANCES" value={player.stats.appearances.toLocaleString()} note={isCurrentSquad ? 'Historical data' : isImported ? 'Selected season' : 'Demo only'} /><StatCard icon={Trophy} label="TROPHIES" value={player.stats.trophies} note={isImported ? 'Not provided' : 'Demo only'} /></div>}</section>
    <section className="profile-info-grid"><div className="profile-bio-block"><p className="eyebrow">THE PLAYER</p><h2>BUILT FOR<br />THE BIG MOMENT.</h2><p>{player.bio}</p><div className="profile-facts"><div><span>NATIONALITY</span><b>{player.nationality || 'Not provided'}</b></div><div><span>DATE OF BIRTH</span><b>{player.dob}</b></div><div><span>AGE</span><b>{player.age > 0 ? player.age : 'Not provided'}</b></div><div><span>BIRTHPLACE</span><b>{player.birthplace}</b></div><div><span>CURRENT CLUB</span><b>{player.club || 'Not provided'}</b></div><div><span>POSITION</span><b>{player.position}</b></div><div><span>LEAGUE</span><b>{player.league || 'Not provided'}</b></div><div><span>HEIGHT</span><b><Ruler size={14} /> {player.height}</b></div><div><span>PREFERRED FOOT</span><b><Footprints size={14} /> {player.foot}</b></div></div></div><div className="profile-honours"><p className="eyebrow">HONOURS & HIGHLIGHTS</p><h2>THE HONOUR<br />ROLL.</h2>{player.achievements.map((item, i) => <div className="honour-row" key={item}><span>0{i + 1}</span><Award size={17} /><b>{item}</b></div>)}</div></section>
    <section className="section profile-detail-grid"><div><p className="eyebrow">ON THE PITCH</p><h2>PLAYING STYLE.</h2><p>{player.playingStyle}</p></div><div><p className="eyebrow">CAREER NOTES</p><h2>KEY MOMENTS.</h2>{player.careerHighlights.map((highlight, index) => <div className="honour-row" key={highlight}><span>0{index + 1}</span><Award size={17} /><b>{highlight}</b></div>)}</div></section>
    {player.seasons.length > 0 && <section className="section"><SectionHeader eyebrow={isCurrentSquad ? 'HISTORICAL SEASON RECORDS' : 'SEASON BY SEASON'} title="RECENT CAMPAIGNS." description={isCurrentSquad ? 'Previously imported historical records; these do not describe the current squad snapshot.' : 'Statistics recorded for the selected competition seasons.'} /><div className="table-scroll"><table className="data-table"><thead><tr><th>SEASON</th><th>CLUB</th><th>APPS</th><th>GOALS</th><th>ASSISTS</th><th>G / APP</th></tr></thead><tbody>{player.seasons.map((season) => <tr key={season.season}><td>{season.season}</td><td>{season.club}</td><td>{season.apps}</td><td className="lime-text">{season.goals}</td><td>{season.assists}</td><td>{season.apps ? (season.goals / season.apps).toFixed(2) : '—'}</td></tr>)}</tbody></table></div></section>}
    {player.career.length > 0 && <section className="career-band profile-career"><div className="career-heading"><p className="eyebrow">{isCurrentSquad ? 'HISTORICAL CLUB RECORDS' : 'THE JOURNEY'}</p><h2>EVERY ERA.<br /><span>ONE AMBITION.</span></h2></div><div className="timeline">{player.career.map((item, index) => <div className="timeline-item" key={`${item.club}-${index}`}><span className="timeline-index">0{index + 1}</span><div><small>{item.years}</small><h3>{item.club}</h3></div><span className="timeline-dot" /></div>)}</div></section>}
    <section className="section profile-end"><Shield size={22} /><p>{isCurrentSquad ? `CURRENT SQUAD DATA SYNCHRONIZED FROM API-FOOTBALL${player.syncedAt ? ` · ${new Date(player.syncedAt).toLocaleString()}` : ''}` : isImported ? 'PLAYER DETAILS SYNCHRONIZED FROM API-FOOTBALL · HISTORICAL STATISTICS ARE SEASON-SPECIFIC' : 'DEMONSTRATION PROFILE · NOT A VERIFIED PLAYER RECORD'}</p><Link to="/players" className="text-link">BACK TO THE INDEX <ArrowLeft size={15} /></Link></section>
  </div>
}
