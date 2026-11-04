import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal } from 'lucide-react'
import { usePlayerStore } from '../data/PlayerStore'
import { PlayerCard } from '../components/PlayerCard'
import { SectionHeader } from '../components/SectionHeader'
import { getGlobalPlayerFacets, getGlobalPlayerPage } from '../services/supabasePlayerRepository'
import type { GlobalPlayerFacets } from '../services/supabasePlayerRepository'
import type { Player } from '../types/player'
import '../styles/global-roster.css'

const pageSize = 24
const emptyFacets: GlobalPlayerFacets = { leagues: [], clubs: [], nationalities: [], positions: [] }

export function Players() {
  const { players, rosterSource } = usePlayerStore()
  const [query, setQuery] = useState('')
  const [nationality, setNationality] = useState('')
  const [position, setPosition] = useState('')
  const [club, setClub] = useState('')
  const [league, setLeague] = useState('')
  const [page, setPage] = useState(0)
  const [remoteRows, setRemoteRows] = useState<Player[]>([])
  const [remoteTotal, setRemoteTotal] = useState(0)
  const [facets, setFacets] = useState<GlobalPlayerFacets>(emptyFacets)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isRemote = rosterSource === 'remote'
  const waitingForConnection = rosterSource === 'loading'

  useEffect(() => {
    if (!isRemote) return
    let active = true
    void getGlobalPlayerFacets()
      .then((result) => { if (active) setFacets(result) })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Roster filters could not be loaded.') })
    return () => { active = false }
  }, [isRemote])

  useEffect(() => {
    if (!isRemote) return
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError('')
      void getGlobalPlayerPage({ search: query, nationality, position, club, league }, page, pageSize)
        .then((result) => {
          if (!active) return
          setRemoteRows(result.players.map((record) => record.profile))
          setRemoteTotal(result.total)
        })
        .catch((cause: unknown) => {
          if (active) setError(cause instanceof Error ? cause.message : 'The global player directory could not be loaded.')
        })
        .finally(() => { if (active) setLoading(false) })
    }, query ? 250 : 0)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [isRemote, query, nationality, position, club, league, page])

  const localFiltered = useMemo(() => players.filter((player) =>
    `${player.name} ${player.club} ${player.nationality}`.toLowerCase().includes(query.trim().toLowerCase())
    && (!nationality || player.nationality === nationality)
    && (!position || player.position === position)
    && (!club || player.club === club)
    && (!league || player.league === league)), [players, query, nationality, position, club, league])
  const total = isRemote ? remoteTotal : localFiltered.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const visiblePlayers = isRemote ? remoteRows : localFiltered.slice(page * pageSize, (page + 1) * pageSize)

  const options = (key: 'nationalities' | 'positions' | 'clubs' | 'leagues') => {
    if (isRemote) return facets[key]
    const fields: Record<typeof key, 'nationality' | 'position' | 'club' | 'league'> = {
      nationalities: 'nationality',
      positions: 'position',
      clubs: 'club',
      leagues: 'league',
    }
    return [...new Set(players.map((player) => player[fields[key]]).filter(Boolean))].sort()
  }
  const clearFilters = () => {
    setQuery('')
    setNationality('')
    setPosition('')
    setClub('')
    setLeague('')
    setPage(0)
  }
  const updateFilter = (setter: (value: string) => void, value: string) => {
    setter(value)
    setPage(0)
  }
  const dataLabel = isRemote ? 'LIVE SUPABASE DIRECTORY' : 'DEMONSTRATION ROSTER'

  return <div className="page-wrap">
    <div className="page-masthead">
      <p className="eyebrow">{isRemote ? 'GLOBAL ROSTER' : 'DEMO ROSTER'} · {total.toLocaleString()} PLAYERS</p>
      <h1>FIND YOUR<br /><span>GAME CHANGER.</span></h1>
      <p>Browse current squad profiles by name, league, club, position or nationality. Historical season statistics remain labeled separately.</p>
    </div>
    <section className="section section-tight">
      <SectionHeader eyebrow="PLAYER DIRECTORY" title="THE PLAYER INDEX." description="Filters and search run against the published roster." />
      <div className="filters">
        <label className="search-field"><Search size={18} /><input value={query} onChange={(event) => updateFilter(setQuery, event.target.value)} placeholder="Search imported players by name" aria-label="Search players by name" /></label>
        <div className="filter-label"><SlidersHorizontal size={16} /> FILTERS</div>
        {[
          { label: 'All nationalities', value: nationality, setter: setNationality, items: options('nationalities') },
          { label: 'All positions', value: position, setter: setPosition, items: options('positions') },
          { label: 'All clubs', value: club, setter: setClub, items: options('clubs') },
          { label: 'All leagues', value: league, setter: setLeague, items: options('leagues') },
        ].map((filter) => <select key={filter.label} aria-label={filter.label} value={filter.value} onChange={(event) => updateFilter(filter.setter, event.target.value)}>
          <option value="">{filter.label}</option>
          {filter.items.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>)}
      </div>
      <div className="result-count"><span>{total.toLocaleString()} PLAYER{total === 1 ? '' : 'S'} FOUND</span><span>{dataLabel}</span></div>
      {waitingForConnection && <div className="empty-state"><p>Connecting to the shared player directory…</p></div>}
      {error && <div className="roster-alert error" role="alert">{error}</div>}
      {loading && <div className="empty-state"><p>Loading this page of the global roster…</p></div>}
      {!waitingForConnection && !loading && !error && visiblePlayers.length > 0 && <div className="player-grid">{visiblePlayers.map((player) => <PlayerCard key={player.id} player={player} />)}</div>}
      {!waitingForConnection && !loading && !error && visiblePlayers.length === 0 && <div className="empty-state"><h3>NO PLAYERS MATCH.</h3><p>{isRemote ? 'No imported player records match these filters.' : 'The current demo roster has no matching players.'}</p><button className="button-outline" onClick={clearFilters}>CLEAR FILTERS</button></div>}
      {!waitingForConnection && !loading && total > 0 && <div className="roster-pagination">
        <span>PAGE {page + 1} OF {pageCount}</span>
        <div><button aria-label="Previous player page" disabled={page === 0} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /></button>
          <button aria-label="Next player page" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}><ChevronRight size={16} /></button></div>
      </div>}
      {!isRemote && <p className="roster-demo-note">Showing demonstration players only. Configure Supabase and import a league to publish real API-Football roster records.</p>}
    </section>
  </div>
}
