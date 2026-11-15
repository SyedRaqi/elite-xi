import { ArrowUpRight, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Player } from '../types/player'
import { PlayerPortrait } from './PlayerPortrait'

export function PlayerCard({ player }: { player: Player }) {
  const hasImportedId = player.id.startsWith('api-football-')
  return <Link className="player-card" to={`/players/${player.id}`}>
    <div className="player-photo-wrap"><PlayerPortrait className="player-card-portrait" name={player.name} fallback={player.image || '/images/player-fallback.svg'} preferFallback={hasImportedId} /><span className="player-number">{player.number > 0 ? String(player.number).padStart(2, '0') : '—'}</span><span className="player-card-arrow"><ArrowUpRight size={18} /></span></div>
    <div className="player-card-info"><div><h3>{player.name}</h3><p><MapPin size={12} />{player.club} <span>·</span> {player.nationality}</p>{player.dataScope === 'current_squad' && <small className="current-squad-tag">CURRENT SQUAD</small>}</div><span className="position-tag">{player.position}</span></div>
  </Link>
}
