import { useState } from 'react'
import { ArrowUpRight, BarChart3, CalendarDays, Flag, Home as HomeIcon, Menu, Search, Shield, Trophy, Users, X } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Brand } from './Brand'

const navItems = [
  { label: 'Home', path: '/', icon: HomeIcon, end: true },
  { label: 'Players', path: '/players', icon: Users },
  { label: 'Clubs', path: '/#clubs', icon: Shield },
  { label: 'Leagues', path: '/#leagues', icon: Trophy },
  { label: 'Matches', path: '/matches', icon: CalendarDays },
  { label: 'Analytics', path: '/statistics', icon: BarChart3 },
  { label: 'Media', path: '/media', icon: Flag },
]

export function Navbar() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const isHome = location.pathname === '/'
  const close = () => setOpen(false)
  return <header className={isHome ? 'site-header home-header' : 'site-header'} id="top"><div className="nav-wrap"><Brand onClick={close} subtitle={isHome ? 'BEYOND FOOTBALL' : undefined} /><nav className={open ? 'main-nav open' : 'main-nav'} aria-label="Main navigation">{navItems.map(({ label, path, icon: Icon, end }) => path.includes('#') ? <Link key={path} className={location.hash === path.slice(1) ? 'active' : ''} to={path} onClick={close}><Icon size={15} aria-hidden="true" /><span>{label}</span></Link> : <NavLink key={path} to={path} end={end} className={({ isActive }) => isActive && (!end || !location.hash) ? 'active' : ''} onClick={close}><Icon size={15} aria-hidden="true" /><span>{label}</span></NavLink>)}</nav><div className="nav-right"><Link className="nav-search" to="/players" aria-label="Search players"><Search size={17} /></Link><span className="season-indicator"><i />2026 / 27</span><Link className="nav-cta" to="/players">EXPLORE <ArrowUpRight size={14} /></Link></div><button className="menu-toggle" onClick={() => setOpen(!open)} aria-label={open ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={open}>{open ? <X /> : <Menu />}</button></div></header>
}
