import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { SectionHeader } from './SectionHeader'
import {
  createImportJob,
  getAvailableLeagues,
  getImportHistory,
  getLeagueClubs,
  importClub,
} from '../services/globalRoster'
import type { FootballClub, FootballLeague, ImportJobWithTeams } from '../services/globalRoster'
import {
  deleteRemotePlayer,
  getGlobalPlayerFacets,
  getGlobalPlayerPage,
  upsertRemotePlayer,
} from '../services/supabasePlayerRepository'
import type { GlobalPlayerFacets, GlobalPlayerRecord } from '../services/supabasePlayerRepository'
import type { Player } from '../types/player'
import '../styles/global-roster.css'

const pageSize = 20
const emptyFacets: GlobalPlayerFacets = { leagues: [], clubs: [], nationalities: [], positions: [] }

function playerDisplayName(player: GlobalPlayerRecord): string {
  return player.profile?.name || [player.first_name, player.last_name].filter(Boolean).join(' ') || 'Unnamed player'
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'The roster request failed. Please try again.'
}

function jobStatus(status: ImportJobWithTeams['status']): string {
  return status.replaceAll('_', ' ').toUpperCase()
}

export function GlobalRosterManager() {
  const [leagues, setLeagues] = useState<FootballLeague[]>([])
  const [leagueId, setLeagueId] = useState('')
  const [clubs, setClubs] = useState<FootballClub[]>([])
  const [selectedClubIds, setSelectedClubIds] = useState<number[]>([])
  const [providerLoading, setProviderLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [history, setHistory] = useState<ImportJobWithTeams[]>([])
  const [historyError, setHistoryError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [jobProgress, setJobProgress] = useState<{ jobId: string; total: number; completed: number; saved: number; failed: number } | null>(null)
  const [clubResults, setClubResults] = useState<Array<{ name: string; saved?: number; cached?: boolean; error?: string }>>([])
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [directoryRows, setDirectoryRows] = useState<GlobalPlayerRecord[]>([])
  const [directoryTotal, setDirectoryTotal] = useState(0)
  const [facets, setFacets] = useState<GlobalPlayerFacets>(emptyFacets)
  const [directorySearch, setDirectorySearch] = useState('')
  const [directoryPage, setDirectoryPage] = useState(0)
  const [directoryBusy, setDirectoryBusy] = useState(false)
  const [directoryError, setDirectoryError] = useState('')
  const [editingPlayer, setEditingPlayer] = useState<GlobalPlayerRecord | null>(null)
  const [editName, setEditName] = useState('')
  const [editNationality, setEditNationality] = useState('')
  const [editPosition, setEditPosition] = useState('')
  const [editClub, setEditClub] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState('')

  const selectedLeague = useMemo(
    () => leagues.find((league) => String(league.id) === leagueId),
    [leagues, leagueId],
  )
  const allClubsSelected = clubs.length > 0 && clubs.every((club) => selectedClubIds.includes(club.id))

  const refreshHistory = useCallback(async () => {
    try {
      const result = await getImportHistory()
      setHistory(result.jobs)
      setHistoryError('')
    } catch (error) {
      setHistoryError(errorText(error))
    }
  }, [])

  useEffect(() => {
    let active = true
    setProviderLoading(true)
    setLoadError('')
    void Promise.allSettled([getAvailableLeagues(), getImportHistory(), getGlobalPlayerFacets()])
      .then(([leagueResult, historyResult, facetsResult]) => {
        if (!active) return
        if (leagueResult.status === 'fulfilled') setLeagues(leagueResult.value.leagues)
        else setLoadError(errorText(leagueResult.reason))
        if (historyResult.status === 'fulfilled') setHistory(historyResult.value.jobs)
        else setHistoryError(errorText(historyResult.reason))
        if (facetsResult.status === 'fulfilled') setFacets(facetsResult.value)
        else setDirectoryError(errorText(facetsResult.reason))
      })
      .finally(() => { if (active) setProviderLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      setDirectoryBusy(true)
      void getGlobalPlayerPage({ search: directorySearch }, directoryPage, pageSize)
        .then((result) => {
          if (!active) return
          setDirectoryRows(result.players)
          setDirectoryTotal(result.total)
          setDirectoryError('')
        })
        .catch((error: unknown) => {
          if (active) setDirectoryError(errorText(error))
        })
        .finally(() => {
          if (active) setDirectoryBusy(false)
        })
    }, directorySearch ? 250 : 0)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [directorySearch, directoryPage, refreshVersion])

  const chooseLeague = async (id: string) => {
    setLeagueId(id)
    setClubs([])
    setSelectedClubIds([])
    setLoadError('')
    if (!id) return
    setProviderLoading(true)
    try {
      const result = await getLeagueClubs(Number(id), undefined, 'current_squad')
      setClubs(result.teams)
      setSelectedClubIds(result.teams.map((club) => club.id))
      if (!result.teams.length) setLoadError('API-Football returned no clubs for this competition. Check the provider league ID and API plan, then try again.')
    } catch (error) {
      setLoadError(`Could not retrieve clubs from API-Football for this competition: ${errorText(error)}`)
    } finally {
      setProviderLoading(false)
    }
  }

  const toggleClub = (clubId: number) => {
    setSelectedClubIds((current) => current.includes(clubId)
      ? current.filter((id) => id !== clubId)
      : [...current, clubId])
  }

  const runImport = async (teamIds?: number[]) => {
    if (!selectedLeague || !clubs.length || importing) return
    setImporting(true)
    setLoadError('')
    setActionMessage('')
    setClubResults([])
    try {
      const { job, teams } = await createImportJob(selectedLeague.id, undefined, teamIds, 'current_squad')
      setJobProgress({ jobId: job.id, total: teams.length, completed: 0, saved: 0, failed: 0 })
      let completed = 0
      let saved = 0
      let failed = 0
      const results: Array<{ name: string; saved?: number; cached?: boolean; error?: string }> = []
      for (const club of teams) {
        try {
          const result = await importClub(job.id, club.id)
          saved += result.importedPlayers
          results.push({ name: club.name, saved: result.importedPlayers, cached: result.cached })
        } catch (error) {
          failed += 1
          results.push({ name: club.name, error: errorText(error) })
        }
        completed += 1
        setJobProgress({ jobId: job.id, total: teams.length, completed, saved, failed })
        setClubResults([...results])
      }
      setActionMessage(`${saved} player records were saved and verified across ${completed - failed} successful clubs${failed ? `; ${failed} club${failed === 1 ? '' : 's'} failed` : ''}.`)
      await refreshHistory()
      setRefreshVersion((version) => version + 1)
      try {
        setFacets(await getGlobalPlayerFacets())
        setDirectoryError('')
      } catch (error) {
        setDirectoryError(`Imports completed, but filter options could not refresh: ${errorText(error)}`)
      }
    } catch (error) {
      setLoadError(errorText(error))
      await refreshHistory()
    } finally {
      setImporting(false)
    }
  }

  const retryJob = async (job: ImportJobWithTeams) => {
    const failedClubs = job.roster_import_teams.filter((team) => team.status === 'failed')
    if (!failedClubs.length) return
    setImporting(true)
    setLoadError('')
    setActionMessage('')
    setClubResults([])
    setJobProgress({ jobId: job.id, total: failedClubs.length, completed: 0, saved: 0, failed: 0 })
    try {
      let completed = 0
      let saved = 0
      let failed = 0
      const results: Array<{ name: string; saved?: number; cached?: boolean; error?: string }> = []
      for (const club of failedClubs) {
        try {
          const result = await importClub(job.id, club.team_id)
          saved += result.importedPlayers
          results.push({ name: club.team_name, saved: result.importedPlayers, cached: result.cached })
        } catch (error) {
          failed += 1
          results.push({ name: club.team_name, error: errorText(error) })
        }
        completed += 1
        setJobProgress({ jobId: job.id, total: failedClubs.length, completed, saved, failed })
        setClubResults([...results])
      }
      setActionMessage(failed
        ? `Retried ${completed} failed clubs; ${failed} still need attention. ${saved} player records were saved and verified.`
        : `All ${completed} failed clubs were retried successfully; ${saved} player records were saved and verified.`)
      await refreshHistory()
      setRefreshVersion((version) => version + 1)
      try {
        setFacets(await getGlobalPlayerFacets())
        setDirectoryError('')
      } catch (error) {
        setDirectoryError(`Retries completed, but filter options could not refresh: ${errorText(error)}`)
      }
    } catch (error) {
      setLoadError(errorText(error))
    } finally {
      setImporting(false)
    }
  }

  const openEditor = (record: GlobalPlayerRecord) => {
    setEditingPlayer(record)
    setEditName(playerDisplayName(record))
    setEditNationality(record.profile.nationality ?? record.nationality ?? '')
    setEditPosition(record.profile.position ?? record.position ?? '')
    setEditClub(record.profile.club ?? record.current_club ?? '')
    setEditError('')
  }

  const savePlayer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingPlayer) return
    setEditBusy(true)
    setEditError('')
    try {
      const updated: Player = {
        ...editingPlayer.profile,
        name: editName.trim(),
        shortName: editName.trim(),
        nationality: editNationality.trim(),
        position: editPosition.trim(),
        club: editClub.trim(),
        career: editingPlayer.profile.career.map((item, index, list) =>
          index === list.length - 1 ? { ...item, club: editClub.trim() } : item),
      }
      await upsertRemotePlayer(updated)
      setEditingPlayer(null)
      setRefreshVersion((version) => version + 1)
      setActionMessage(`${updated.name} was saved to the shared roster.`)
    } catch (error) {
      setEditError(errorText(error))
    } finally {
      setEditBusy(false)
    }
  }

  const removePlayer = async (record: GlobalPlayerRecord) => {
    const name = playerDisplayName(record)
    if (!window.confirm(`Permanently remove ${name} from the shared global roster?`)) return
    try {
      await deleteRemotePlayer(record.id)
      setActionMessage(`${name} was removed from the roster.`)
      setRefreshVersion((version) => version + 1)
      try {
        setFacets(await getGlobalPlayerFacets())
        setDirectoryError('')
      } catch (error) {
        setDirectoryError(`The record was removed, but filter options could not refresh: ${errorText(error)}`)
      }
    } catch (error) {
      setLoadError(errorText(error))
    }
  }

  const pageCount = Math.max(1, Math.ceil(directoryTotal / pageSize))
  const editableFields = [
    { label: 'FULL NAME', value: editName, setValue: setEditName },
    { label: 'NATIONALITY', value: editNationality, setValue: setEditNationality },
    { label: 'POSITION', value: editPosition, setValue: setEditPosition },
    { label: 'CURRENT CLUB', value: editClub, setValue: setEditClub },
  ]

  return <section className="section section-tight global-roster-manager">
    <SectionHeader
      eyebrow="GLOBAL PLAYER DATABASE"
      title="ROSTER CONTROL."
      description="Import verified current club squads, track each club’s result, and manage API-Football player records. Historical statistics remain separate."
    />

    <div className="roster-metrics">
      <article><span>IMPORTED PLAYERS</span><b>{directoryTotal.toLocaleString()}</b><small>Published API-Football profiles</small></article>
      <article><span>CLUBS</span><b>{facets.clubs.length.toLocaleString()}</b><small>Clubs represented in imported records</small></article>
      <article><span>LEAGUES</span><b>{facets.leagues.length.toLocaleString()}</b><small>Competitions represented in the directory</small></article>
    </div>

    <div className="roster-import-panel">
      <div className="roster-panel-title">
        <div><p className="eyebrow">API-FOOTBALL · SERVER-SIDE IMPORT</p><h3>IMPORT CURRENT SQUADS.</h3></div>
        <span className="secure-label"><ShieldCheck size={15} /> API KEY STAYS SERVER-SIDE</span>
      </div>
      <div className="roster-selectors">
        <label className="form-field"><span>COMPETITION</span>
          <select value={leagueId} disabled={providerLoading || importing} onChange={(event) => void chooseLeague(event.target.value)}>
            <option value="">Select a competition</option>
            {leagues.map((league) => <option value={league.id} key={league.id}>{league.name}</option>)}
          </select>
        </label>
      </div>
      <p className="roster-inline-state">CURRENT SQUAD · Updated by API-Football · Season statistics are not included in this snapshot.</p>

      {providerLoading && <p className="roster-inline-state"><LoaderCircle className="spin" size={16} /> Checking clubs with API-Football…</p>}
      {loadError && <p className="roster-alert error" role="alert"><AlertCircle size={16} />{loadError}</p>}
      {actionMessage && <p className="roster-alert success" role="status"><Check size={16} />{actionMessage}</p>}

      {clubs.length > 0 && <div className="roster-clubs">
        <div className="roster-club-heading">
          <div><p className="eyebrow">AVAILABLE CLUBS</p><b>{clubs.length} clubs · {selectedClubIds.length} selected</b></div>
          <button type="button" className="text-button" onClick={() => setSelectedClubIds(allClubsSelected ? [] : clubs.map((club) => club.id))}>
            {allClubsSelected ? 'CLEAR SELECTION' : 'SELECT ALL'}
          </button>
        </div>
        <div className="roster-club-list">
          {clubs.map((club) => <label className="roster-club-option" key={club.id}>
            <input type="checkbox" checked={selectedClubIds.includes(club.id)} disabled={importing} onChange={() => toggleClub(club.id)} />
            {club.logo ? <img src={club.logo} alt="" loading="lazy" /> : <span className="club-placeholder"><Users size={15} /></span>}
            <span>{club.name}</span>
          </label>)}
        </div>
        <div className="roster-import-actions">
          <button type="button" className="button-lime" disabled={importing || selectedClubIds.length === 0} onClick={() => void runImport(selectedClubIds)}>
            {importing ? <><LoaderCircle className="spin" size={15} /> IMPORTING CLUBS…</> : 'IMPORT SELECTED CLUBS'}
          </button>
          <button type="button" className="button-outline" disabled={importing || clubs.length === 0} onClick={() => void runImport()}>
            IMPORT FULL LEAGUE
          </button>
        </div>
      </div>}
    </div>

    {jobProgress && <div className="roster-progress-panel" role="status">
      <div className="roster-progress-copy"><span>IMPORT JOB {jobProgress.jobId.slice(0, 8).toUpperCase()}</span><b>{jobProgress.completed} / {jobProgress.total} CLUBS PROCESSED</b></div>
      <progress value={jobProgress.completed} max={Math.max(1, jobProgress.total)} />
      <div className="roster-progress-stats"><span>{jobProgress.saved} player records saved & verified</span><span>{jobProgress.completed - jobProgress.failed} clubs successful · {jobProgress.failed} failed</span></div>
      {clubResults.length > 0 && <ul className="roster-club-results">{clubResults.map((result) => <li key={result.name} className={result.error ? 'failed' : 'passed'}>
        {result.error ? <AlertCircle size={14} /> : <Check size={14} />}
        <span>{result.name}</span>
        <small>{result.error ?? `${result.saved} verified players${result.cached ? ' · cached provider data' : ''}`}</small>
      </li>)}</ul>}
    </div>}

    <div className="roster-directory-panel">
      <div className="roster-panel-title">
        <div><p className="eyebrow">PUBLISHED API RECORDS</p><h3>GLOBAL PLAYER INDEX.</h3></div>
        <span className="record-count">{directoryTotal.toLocaleString()} PLAYERS</span>
      </div>
      <label className="search-field roster-search"><Search size={17} /><input value={directorySearch} onChange={(event) => { setDirectorySearch(event.target.value); setDirectoryPage(0) }} placeholder="Search imported players by name" /></label>
      {directoryError && <p className="roster-alert error" role="alert"><AlertCircle size={16} />{directoryError}</p>}
      {directoryBusy ? <p className="roster-inline-state"><LoaderCircle className="spin" size={16} /> Loading this page of the global roster…</p> : <div className="table-scroll">
        <table className="data-table roster-data-table">
          <thead><tr><th>PLAYER</th><th>NATIONALITY</th><th>POSITION</th><th>CLUB / LEAGUE</th><th>DATA SCOPE / LAST SYNC</th><th>ACTIONS</th></tr></thead>
          <tbody>{directoryRows.map((record) => <tr key={record.id}>
            <td><div className="roster-player-cell">{record.photo_url && <img src={record.photo_url} alt="" loading="lazy" />}<div><b>{playerDisplayName(record)}</b><small>API ID {record.external_api_id}</small></div></div></td>
            <td>{record.nationality ?? '—'}</td>
            <td>{record.position ?? '—'}</td>
            <td><b>{record.current_club ?? record.profile.club}</b><small className="table-subtext">{record.league_name ?? record.profile.league}</small></td>
            <td><b>{record.profile.dataScope === 'current_squad' ? 'CURRENT SQUAD' : record.season ?? 'HISTORICAL'}</b><small className="table-subtext">{record.synced_at ? new Date(record.synced_at).toLocaleString() : 'Sync time unavailable'}</small></td>
            <td><div className="row-actions">
              <button aria-label={`Edit ${playerDisplayName(record)}`} onClick={() => openEditor(record)}><Pencil size={15} /></button>
              <button aria-label={`Delete ${playerDisplayName(record)}`} onClick={() => void removePlayer(record)}><Trash2 size={15} /></button>
            </div></td>
          </tr>)}</tbody>
        </table>
        {!directoryRows.length && !directoryError && <div className="empty-state"><h3>NO IMPORTED PLAYERS YET.</h3><p>Select a competition and import its current squads to begin.</p></div>}
      </div>}
      <div className="roster-pagination">
        <span>PAGE {directoryPage + 1} OF {pageCount}</span>
        <div><button aria-label="Previous page" disabled={directoryPage === 0 || directoryBusy} onClick={() => setDirectoryPage((page) => page - 1)}><ChevronLeft size={16} /></button>
          <button aria-label="Next page" disabled={directoryPage + 1 >= pageCount || directoryBusy} onClick={() => setDirectoryPage((page) => page + 1)}><ChevronRight size={16} /></button></div>
      </div>
    </div>

    <div className="roster-history-panel">
      <div className="roster-panel-title">
        <div><p className="eyebrow">AUDIT TRAIL</p><h3>IMPORT HISTORY.</h3></div>
        <button type="button" className="text-button" onClick={() => void refreshHistory()} disabled={importing}><RefreshCw size={14} /> REFRESH</button>
      </div>
      {historyError && <p className="roster-alert error" role="alert"><AlertCircle size={16} />{historyError}</p>}
      {history.length ? <div className="roster-history-list">{history.map((job) => {
        const teams = job.roster_import_teams ?? []
        const failedTeams = teams.filter((team) => team.status === 'failed')
        return <article className="roster-history-item" key={job.id}>
          <div className="history-main"><span className={`job-badge ${job.status}`}>{jobStatus(job.status)}</span><b>{job.league_name} · {job.data_scope === 'current_squad' ? 'CURRENT SQUAD' : job.season}</b><small>{new Date(job.created_at).toLocaleString()}</small></div>
          <div className="history-summary"><span>{job.imported_players} verified players</span><span>{job.completed_teams}/{job.total_teams} clubs · {job.failed_teams} failed</span></div>
          {failedTeams.length > 0 && <button className="button-outline retry-button" disabled={importing} onClick={() => void retryJob(job)}><RefreshCw size={14} /> RETRY {failedTeams.length} FAILED CLUBS</button>}
          {(failedTeams.length > 0 || teams.some((team) => team.status === 'completed')) && <details className="history-details">
            <summary>View club results</summary>
            <ul>{teams.map((team) => <li key={team.id} className={team.status}>
              <span>{team.team_name}</span>
              <small>{team.status === 'completed' ? `${team.imported_players} players verified · synced ${new Date(team.updated_at).toLocaleString()}` : team.error ?? team.status}</small>
            </li>)}</ul>
          </details>}
        </article>
      })}</div> : !historyError && <p className="roster-empty-history">No import jobs have been created.</p>}
    </div>

    {editingPlayer && <div className="roster-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !editBusy) setEditingPlayer(null) }}>
      <form className="roster-edit-dialog" onSubmit={(event) => void savePlayer(event)}>
        <div className="roster-panel-title"><div><p className="eyebrow">API-FOOTBALL PLAYER · {editingPlayer.external_api_id}</p><h3>EDIT PROFILE.</h3></div><button type="button" aria-label="Close editor" disabled={editBusy} onClick={() => setEditingPlayer(null)}><X size={18} /></button></div>
        {editableFields.map((field) => <label className="form-field" key={field.label}><span>{field.label}</span><input required value={field.value} onChange={(event) => field.setValue(event.target.value)} /></label>)}
        {editError && <p className="roster-alert error" role="alert"><AlertCircle size={16} />{editError}</p>}
        <button className="button-lime" type="submit" disabled={editBusy}>{editBusy ? 'SAVING…' : 'SAVE PLAYER'}</button>
      </form>
    </div>}
  </section>
}
