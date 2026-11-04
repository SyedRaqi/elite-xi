import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Pencil, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react'
import { matches } from '../data/matches'
import { usePlayerStore } from '../data/PlayerStore'
import type { PlayerBasics } from '../data/PlayerStore'
import type { Player } from '../types/player'
import { SectionHeader } from '../components/SectionHeader'
import { GlobalRosterManager } from '../components/GlobalRosterManager'

const emptyForm: PlayerBasics = { name: '', club: '', nationality: '', position: '' }

export function Admin() {
  const { players, storageAvailable, rosterSource, user, isAdmin, signIn, signOut, addPlayer, updatePlayer, deletePlayer, resetPlayers } = usePlayerStore()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Player | null>(null)
  const [form, setForm] = useState<PlayerBasics>(emptyForm)
  const [notice, setNotice] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const clubs = useMemo(() => new Set(players.map((player) => player.club)).size, [players])
  const visible = players.filter((player) => `${player.name} ${player.club} ${player.nationality}`.toLowerCase().includes(search.toLowerCase()))
  const remoteMode = rosterSource === 'remote' || rosterSource === 'loading'
  const canManage = rosterSource === 'local' || rosterSource === 'remote-error' || (rosterSource === 'remote' && isAdmin)

  const openEditor = (player?: Player) => {
    setEditing(player ?? null)
    setForm(player ? { name: player.name, club: player.club, nationality: player.nationality, position: player.position } : emptyForm)
    setNotice('')
    document.querySelector<HTMLDialogElement>('#player-editor')?.showModal()
  }

  const savePlayer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      if (editing) await updatePlayer(editing.id, form)
      else await addPlayer(form)
      document.querySelector<HTMLDialogElement>('#player-editor')?.close()
      setNotice(rosterSource === 'remote' ? 'Roster change saved to Supabase.' : 'Roster change saved in this browser.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The player could not be saved.')
    }
  }

  const removePlayer = (player: Player) => {
    if (!window.confirm(`Remove ${player.name} from the roster?`)) return
    void deletePlayer(player.id)
      .then(() => setNotice(`${player.name} removed from the roster.`))
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : 'The player could not be removed.'))
  }

  const restoreDemo = () => {
    if (!window.confirm('Restore the original demonstration roster? This replaces the current roster.')) return
    void resetPlayers()
      .then(() => setNotice('The original demonstration roster has been restored.'))
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : 'The roster could not be restored.'))
  }

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await signIn(authEmail, authPassword)
      setAuthPassword('')
      setNotice('Signed in. Shared roster changes require the trusted admin role.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Sign-in failed.')
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      setNotice('Signed out.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Sign-out failed.')
    }
  }

  const statusDescription = rosterSource === 'remote'
    ? `Shared Supabase roster${isAdmin ? ' · administrator access active' : ' · read-only access'}.`
    : rosterSource === 'loading'
      ? 'Connecting to the shared Supabase roster…'
      : rosterSource === 'remote-error'
        ? 'Supabase could not be reached. Showing this browser’s saved roster.'
        : storageAvailable
          ? 'Browser storage is active. This roster is local to this browser.'
          : 'Browser storage is unavailable. Changes will reset when the page closes.'

  return <div className="page-wrap admin-page">
    <div className="page-masthead"><p className="eyebrow">ELITE XI · MANAGEMENT</p><h1>ADMIN<br /><span>CONSOLE.</span></h1><p>Manage the player roster and platform data.</p></div>
    {!remoteMode && <section className="section section-tight">
      <SectionHeader eyebrow="OVERVIEW" title="YOUR PLATFORM." description={statusDescription} />
      <div className="admin-metrics"><article><span>PLAYERS</span><b>{players.length.toString().padStart(2, '0')}</b><small>Roster records</small></article><article><span>CLUBS</span><b>{clubs.toString().padStart(2, '0')}</b><small>Represented clubs</small></article><article><span>MATCHES</span><b>{matches.length.toString().padStart(2, '0')}</b><small>Sample schedule</small></article></div>
    </section>}

    {rosterSource === 'local' && <section className="section section-tight roster-setup-note">
      <p className="eyebrow">GLOBAL IMPORT SETUP</p>
      <h2>CONNECT THE ROSTER.</h2>
      <p>This browser is showing demonstration data only. Configure the Supabase URL and publishable key, apply the roster migrations, deploy the <code>global-roster</code> Edge Function, and store <code>API_FOOTBALL_KEY</code> as a Supabase Edge Function secret.</p>
      <p className="form-note">The API key must never be added to a VITE_ variable or frontend code. Setup steps are documented in the Supabase README.</p>
    </section>}

    {remoteMode && <section className="section section-tight">
      <div className="admin-table-heading"><div><p className="eyebrow">SUPABASE ACCESS</p><h2>{isAdmin ? 'ADMIN SESSION.' : 'SIGN IN.'}</h2></div>{user && <button className="button-outline" onClick={() => void handleSignOut()}>SIGN OUT</button>}</div>
      {isAdmin
        ? <p className="form-note">Signed in as {user?.email}. Trusted administrator access is active.</p>
        : <form className="admin-auth-form" onSubmit={handleSignIn}><label className="form-field"><span>EMAIL</span><input type="email" autoComplete="username" required value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} /></label><label className="form-field"><span>PASSWORD</span><input type="password" autoComplete="current-password" required value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} /></label><button className="button-lime" type="submit">SIGN IN</button>{user && <p className="form-note">This account is signed in but does not have the trusted admin role.</p>}</form>}
    </section>}

    {rosterSource === 'remote' && isAdmin && <GlobalRosterManager />}

    {!remoteMode && <section className="section section-tight admin-roster">
      <div className="admin-table-heading"><div><p className="eyebrow">PLAYER MANAGEMENT</p><h2>THE ROSTER.</h2></div><div className="admin-heading-actions"><button className="button-outline" disabled={!canManage} onClick={restoreDemo}><RotateCcw size={15} /> RESET DEMO</button><button className="button-lime" disabled={!canManage} onClick={() => openEditor()}><Plus size={16} /> ADD PLAYER</button></div></div>
      <div className="admin-toolbar"><label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a player" /></label><span>{visible.length} / {players.length} PLAYERS</span></div>
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      <div className="table-scroll"><table className="data-table admin-table"><thead><tr><th>PLAYER</th><th>CLUB</th><th>NATIONALITY</th><th>POSITION</th><th>ACTIONS</th></tr></thead><tbody>{visible.map((player) => <tr key={player.id}><td><b>{player.name}</b></td><td>{player.club}</td><td>{player.nationality}</td><td>{player.position}</td><td><div className="row-actions"><button disabled={!canManage} aria-label={`Edit ${player.name}`} onClick={() => openEditor(player)}><Pencil size={15} /></button><button disabled={!canManage} aria-label={`Delete ${player.name}`} onClick={() => removePlayer(player)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table>{visible.length === 0 && <div className="empty-state"><h3>NO PLAYERS FOUND.</h3><p>Try another search or add a player.</p></div>}</div>
    </section>}

    {!remoteMode && <dialog id="player-editor" className="editor-dialog"><form onSubmit={savePlayer}><div className="dialog-heading"><div><p className="eyebrow">ROSTER EDITOR</p><h2>{editing ? 'EDIT PLAYER.' : 'ADD PLAYER.'}</h2></div><button type="button" aria-label="Close" onClick={() => document.querySelector<HTMLDialogElement>('#player-editor')?.close()}><X /></button></div>{(['name', 'club', 'nationality', 'position'] as const).map((key) => <label className="form-field" key={key}><span>{key.toUpperCase()}</span><input required value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} placeholder={`Enter ${key}`} /></label>)}<p className="form-note">Changes are saved in this browser.</p><button className="button-lime" type="submit">{editing ? 'SAVE CHANGES' : 'ADD TO ROSTER'}</button></form></dialog>}
  </div>
}
