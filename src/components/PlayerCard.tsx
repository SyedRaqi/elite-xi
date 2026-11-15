import { ArrowUpRight, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Player } from '../types/player'
import { PlayerPortrait } from './PlayerPortrait'

type PlayerCardProps = { player: Player; variant?: 'default' | 'directory'; sample?: boolean }

function available(value: string | undefined): value is string {
  return Boolean(value?.trim() && !['not set', 'unknown', 'unassigned'].includes(value.trim().toLowerCase()))
}

function flagFromCode(code: string): string | null {
  const normalized = code.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(normalized)) return null
  return String.fromCodePoint(...[...normalized].map((letter) => letter.charCodeAt(0) + 127397))
}

export function PlayerCard({ player, variant = 'default', sample = false }: PlayerCardProps) {
  const hasImportedId = player.id.startsWith('api-football-')
  const flag = flagFromCode(player.countryCode || '')
  if (variant === 'directory') return <Link className="player-card directory-player-card" to={`/players/${player.id}`}>
    <div className="player-photo-wrap directory-player-photo-wrap">
      <PlayerPortrait className="player-card-portrait directory-player-portrait" name={player.name} fallback={player.image || '/images/player-fallback.svg'} preferFallback={hasImportedId} />
      <span className="directory-card-vignette" />
      <span className="directory-card-topline">{player.dataScope === 'current_squad' ? 'CURRENT SQUAD' : sample ? 'SAMPLE PROFILE' : 'PLAYER PROFILE'}</span>
      {player.number > 0 && <span className="player-number directory-player-number">#{String(player.number).padStart(2, '0')}</span>}
      <span className="player-card-arrow directory-player-arrow"><ArrowUpRight size={18} /></span>
      <span className="directory-card-view">VIEW PROFILE <ArrowUpRight size={13} /></span>
    </div>
    <div className="player-card-info directory-player-card-info">
      <div className="directory-player-heading"><h3>{player.name}</h3><span className="directory-player-age">{player.age > 0 ? `${player.age} YRS` : ''}</span></div>
      <p className="directory-player-nationality">{flag && <span aria-label={`${player.nationality} flag`}>{flag}</span>}{available(player.nationality) ? player.nationality : 'Nationality not listed'}</p>
      <div className="directory-player-meta"><span><MapPin size={13} />{available(player.club) ? player.club : 'Club not listed'}</span>{available(player.position) && <span className="position-tag">{player.position}</span>}</div>
      {available(player.league) && <small className="directory-player-league">{player.league}</small>}
      {available(player.height) && <small className="directory-player-height">{player.height}</small>}
    </div>
  </Link>

  return <Link className="player-card" to={`/players/${player.id}`}>
    <div className="player-photo-wrap"><PlayerPortrait className="player-card-portrait" name={player.name} fallback={player.image || '/images/player-fallback.svg'} preferFallback={hasImportedId} /><span className="player-number">{player.number > 0 ? String(player.number).padStart(2, '0') : '—'}</span><span className="player-card-arrow"><ArrowUpRight size={18} /></span></div>
    <div className="player-card-info"><div><h3>{player.name}</h3><p><MapPin size={12} />{player.club} <span>·</span> {player.nationality}</p>{player.dataScope === 'current_squad' && <small className="current-squad-tag">CURRENT SQUAD</small>}</div><span className="position-tag">{player.position}</span></div>
  </Link>
}
