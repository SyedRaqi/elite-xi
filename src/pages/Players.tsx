import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowDownAZ, ArrowLeft, ArrowRight, LayoutGrid, List, RotateCcw, Search, SlidersHorizontal, Users, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PlayerCard } from '../components/PlayerCard'
import { PlayerPortrait } from '../components/PlayerPortrait'
import { usePlayerStore } from '../data/PlayerStore'
import { getGlobalPlayerFacets, getGlobalPlayerPage } from '../services/supabasePlayerRepository'
import type { GlobalPlayerFacets } from '../services/supabasePlayerRepository'
import type { Player } from '../types/player'
import '../styles/player-directory.css'

const pageSize = 24
const emptyFacets: GlobalPlayerFacets = { leagues: [], clubs: [], nationalities: [], positions: [] }
type SortMode = 'name' | 'age'
type ViewMode = 'grid' | 'list'

function hasValue(value: string | undefined): value is string {
  return Boolean(value?.trim() && !['not set', 'unknown', 'unassigned'].includes(value.trim().toLowerCase()))
}

function flagFromCode(code: string): string | null {
  const normalized = code.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(normalized)) return null
  return String.fromCodePoint(...[...normalized].map((letter) => letter.charCodeAt(0) + 127397))
}

function PlayerSkeleton({ index }: { index: number }) {
  return <div className="directory-skeleton" aria-hidden="true" style={{ animationDelay: `${Math.min(index * 55, 330)}ms` }}>
    <div className="directory-skeleton-photo" /><div className="directory-skeleton-line wide" /><div className="directory-skeleton-line" />
  </div>
}

export function Players() {
  const { players, rosterSource } = usePlayerStore()
  const prefersReducedMotion = useReducedMotion()
  const [query, setQuery] = useState('')
  const [nationality, setNationality] = useState('')
  const [position, setPosition] = useState('')
  const [club, setClub] = useState('')
  const [league, setLeague] = useState('')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<SortMode>('name')
  const [view, setView] = useState<ViewMode>('grid')
  const [remoteRows, setRemoteRows] = useState<Player[]>([])
  const [remoteTotal, setRemoteTotal] = useState(0)
  const [facets, setFacets] = useState<GlobalPlayerFacets>(emptyFacets)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retryToken, setRetryToken] = useState(0)

  const isRemote = rosterSource === 'remote'
  const waitingForConnection = rosterSource === 'loading'

  useEffect(() => {
    if (!isRemote) return
    let active = true
    void getGlobalPlayerFacets()
      .then((result) => { if (active) setFacets(result) })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Filter options could not be loaded.') })
    return () => { active = false }
  }, [isRemote, retryToken])

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
  }, [isRemote, query, nationality, position, club, league, page, retryToken])

  const localFiltered = useMemo(() => players.filter((player) =>
    `${player.name} ${player.club} ${player.nationality}`.toLowerCase().includes(query.trim().toLowerCase())
    && (!nationality || player.nationality === nationality)
    && (!position || player.position === position)
    && (!club || player.club === club)
    && (!league || player.league === league)), [players, query, nationality, position, club, league])

  const total = isRemote ? remoteTotal : localFiltered.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const sortedLocal = useMemo(() => [...localFiltered].sort((a, b) => sort === 'name'
    ? a.name.localeCompare(b.name)
    : (a.age > 0 ? a.age : Number.POSITIVE_INFINITY) - (b.age > 0 ? b.age : Number.POSITIVE_INFINITY)), [localFiltered, sort])
  const pagePlayers = isRemote ? remoteRows : sortedLocal.slice(page * pageSize, (page + 1) * pageSize)
  const visiblePlayers = useMemo(() => isRemote ? [...pagePlayers].sort((a, b) => sort === 'name'
    ? a.name.localeCompare(b.name)
    : (a.age > 0 ? a.age : Number.POSITIVE_INFINITY) - (b.age > 0 ? b.age : Number.POSITIVE_INFINITY)) : pagePlayers, [isRemote, pagePlayers, sort])
  const featured = visiblePlayers[0]

  const options = (key: 'nationalities' | 'positions' | 'clubs' | 'leagues') => {
    if (isRemote) return facets[key]
    const fields: Record<typeof key, 'nationality' | 'position' | 'club' | 'league'> = {
      nationalities: 'nationality', positions: 'position', clubs: 'club', leagues: 'league',
    }
    return [...new Set(players.map((player) => player[fields[key]]).filter(Boolean))].sort()
  }

  const activeFilters = [
    query.trim() ? { label: `Search: ${query.trim()}`, clear: () => setQuery('') } : null,
    nationality ? { label: nationality, clear: () => setNationality('') } : null,
    position ? { label: position, clear: () => setPosition('') } : null,
    club ? { label: club, clear: () => setClub('') } : null,
    league ? { label: league, clear: () => setLeague('') } : null,
  ].filter((filter): filter is { label: string; clear: () => void } => filter !== null)

  const clearFilters = useCallback(() => {
    setQuery(''); setNationality(''); setPosition(''); setClub(''); setLeague(''); setPage(0)
  }, [])
  const updateFilter = (setter: (value: string) => void, value: string) => {
    setter(value)
    setPage(0)
  }
  const retry = () => {
    setError('')
    setRetryToken((value) => value + 1)
  }
  const dataLabel = isRemote ? 'LIVE DATABASE' : 'SAMPLE ROSTER'
  const animationDuration = prefersReducedMotion ? 0 : 0.38

  return <main className="player-directory page-wrap">
    <section className="directory-hero" aria-labelledby="directory-title">
      <div className="directory-hero-light directory-hero-light-one" />
      <div className="directory-hero-light directory-hero-light-two" />
      <div className="directory-hero-grain" />
      <nav className="directory-breadcrumb" aria-label="Breadcrumb"><Link to="/">HOME</Link><span>/</span><span aria-current="page">PLAYERS</span></nav>
      <div className="directory-hero-copy">
        <p className="directory-kicker"><span /> ELITE XI INTELLIGENCE · {dataLabel}</p>
        <h1 id="directory-title">GLOBAL PLAYER<br /><em>DATABASE</em></h1>
        <p className="directory-subtitle">Explore the world’s football talent through one searchable directory of player profiles, clubs, leagues and verified roster details.</p>
        <div className="directory-hero-metrics">
          <div className="directory-total"><b>{waitingForConnection ? '—' : total.toLocaleString()}</b><span>PLAYER PROFILES</span></div>
          <div className="directory-total-divider" />
          <div className="directory-total"><b>{isRemote ? 'LIVE' : 'SAMPLE'}</b><span>{isRemote ? 'SUPABASE DIRECTORY' : 'DEMO CONTENT'}</span></div>
        </div>
      </div>
      {featured && <motion.div className="directory-feature" initial={prefersReducedMotion ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: animationDuration, delay: 0.1 }}>
        <div className="directory-feature-label"><span>PROFILE SPOTLIGHT</span><span>{isRemote ? 'DATABASE RECORD' : 'SAMPLE PROFILE'}</span></div>
        <Link to={`/players/${featured.id}`} className="directory-feature-link" aria-label={`View profile for ${featured.name}`}>
          <PlayerPortrait className="directory-feature-photo" name={featured.name} fallback={featured.image || '/images/player-fallback.svg'} preferFallback={featured.id.startsWith('api-football-')} />
          <span className="directory-feature-shade" />
          <span className="directory-feature-info"><small>{hasValue(featured.club) ? featured.club : 'CLUB NOT LISTED'}</small><strong>{featured.name}</strong><span>{hasValue(featured.position) ? featured.position : 'Position not listed'}{hasValue(featured.nationality) ? ` · ${featured.nationality}` : ''}</span></span>
          <span className="directory-feature-open"><ArrowRight size={17} /></span>
        </Link>
      </motion.div>}
      {!featured && !waitingForConnection && <div className="directory-feature-empty"><Users size={19} /><span>PLAYER SPOTLIGHT<br /><b>Browse the directory below</b></span></div>}
      <span className="directory-hero-index">01 / GLOBAL SCOUTING</span>
    </section>

    <section className="directory-content" aria-label="Player search and results">
      <header className="directory-section-heading">
        <div><p className="directory-kicker"><span /> SCOUTING TOOLS</p><h2>DISCOVER <em>PLAYERS</em></h2></div>
        <p>Search by name, then refine by competition, club, position or nationality.</p>
      </header>

      <div className="directory-filter-panel">
        <div className="directory-search-row">
          <label className="directory-search"><Search size={19} /><input value={query} onChange={(event) => updateFilter(setQuery, event.target.value)} placeholder="Search player name, club or nationality" aria-label="Search players" /><kbd>↵</kbd></label>
          <div className="directory-sort"><ArrowDownAZ size={16} /><label htmlFor="directory-sort">SORT</label><select id="directory-sort" value={sort} onChange={(event) => setSort(event.target.value as SortMode)}><option value="name">Name A–Z</option><option value="age">Age · verified</option></select></div>
        </div>
        <div className="directory-filter-row">
          <span className="directory-filter-title"><SlidersHorizontal size={15} /> FILTER BY</span>
          {[
            { label: 'Nationality', value: nationality, setter: setNationality, items: options('nationalities') },
            { label: 'Position', value: position, setter: setPosition, items: options('positions') },
            { label: 'Club', value: club, setter: setClub, items: options('clubs') },
            { label: 'League', value: league, setter: setLeague, items: options('leagues') },
          ].map((filter) => <label className="directory-select-wrap" key={filter.label}><span className="sr-only">Filter by {filter.label.toLowerCase()}</span><select value={filter.value} onChange={(event) => updateFilter(filter.setter, event.target.value)}><option value="">All {filter.label}s</option>{filter.items.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>)}
          {activeFilters.length > 0 && <button className="directory-clear" onClick={clearFilters}><RotateCcw size={13} /> CLEAR ALL</button>}
        </div>
        {activeFilters.length > 0 && <div className="directory-active-filters" aria-label="Active filters">{activeFilters.map((filter) => <button key={filter.label} onClick={() => { filter.clear(); setPage(0) }}>{filter.label}<X size={12} /></button>)}</div>}
      </div>

      <div className="directory-results-bar">
        <div><strong>{loading ? '…' : total.toLocaleString()}</strong><span> {total === 1 ? 'PROFILE' : 'PROFILES'} FOUND</span><i /> <small>{dataLabel}</small></div>
        <div className="directory-view-toggle" role="group" aria-label="Player layout">
          <button className={view === 'grid' ? 'active' : ''} aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid size={16} /></button>
          <button className={view === 'list' ? 'active' : ''} aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={17} /></button>
        </div>
      </div>

      {error && <div className="directory-error" role="alert"><div><strong>DIRECTORY CONNECTION ISSUE</strong><span>{error}</span></div><button onClick={retry}><RotateCcw size={14} /> RETRY</button></div>}
      {(waitingForConnection || loading) && <div className="directory-grid directory-loading" aria-label="Loading players">{Array.from({ length: 8 }, (_, index) => <PlayerSkeleton key={index} index={index} />)}</div>}

      <AnimatePresence mode="wait" initial={false}>
        {!waitingForConnection && !loading && !error && visiblePlayers.length > 0 && <motion.div key={`${page}-${view}-${sort}-${activeFilters.map((item) => item.label).join('|')}`} className={`directory-grid ${view === 'list' ? 'is-list' : ''}`} initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }} transition={{ duration: animationDuration }}>
          {visiblePlayers.map((player, index) => <motion.div className="directory-card-shell" key={player.id} initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: animationDuration, delay: prefersReducedMotion ? 0 : Math.min(index * 0.035, 0.42) }}>
            <PlayerCard player={player} variant="directory" sample={!isRemote} />
            {view === 'list' && <div className="directory-card-extra"><span>{hasValue(player.league) ? player.league : 'League not listed'}</span>{player.age > 0 && <span>AGE {player.age}</span>}{hasValue(player.height) && <span>{player.height}</span>}{player.countryCode && flagFromCode(player.countryCode) && <span aria-label={`${player.nationality} flag`}>{flagFromCode(player.countryCode)}</span>}</div>}
          </motion.div>)}
        </motion.div>}
      </AnimatePresence>

      {!waitingForConnection && !loading && !error && visiblePlayers.length === 0 && <div className="directory-empty"><span className="directory-empty-icon"><Search size={24} /></span><p className="directory-kicker">NO MATCHING RECORDS</p><h3>REFINE YOUR <em>SEARCH</em></h3><p>{isRemote ? 'No published player profiles match the selected search and filters.' : 'No sample player profiles match the selected search and filters.'}</p><button onClick={clearFilters}>CLEAR SEARCH & FILTERS</button></div>}

      {!waitingForConnection && !loading && total > 0 && <nav className="directory-pagination" aria-label="Player directory pages">
        <span>PAGE <b>{page + 1}</b> OF <b>{pageCount}</b><small> · {isRemote && sort !== 'name' ? 'SORTED WITHIN THIS PAGE' : `${Math.min(total, page * pageSize + 1)}–${Math.min(total, (page + 1) * pageSize)} OF ${total}`}</small></span>
        <div><button aria-label="Previous player page" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}><ArrowLeft size={16} /> PREVIOUS</button><button aria-label="Next player page" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>NEXT <ArrowRight size={16} /></button></div>
      </nav>}
      {!isRemote && <p className="directory-demo-note">SAMPLE DATA · This demonstration roster is separate from imported Supabase player records. Profile details may be incomplete.</p>}
      {isRemote && sort === 'age' && <p className="directory-demo-note">AGE SORT · Profiles without a verified age appear after profiles with age data. Remote records are sorted within the current page.</p>}
    </section>
  </main>
}
