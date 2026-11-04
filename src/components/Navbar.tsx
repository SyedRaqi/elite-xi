import { useState } from 'react'
import { ArrowUpRight, Menu, X } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { Brand } from './Brand'

const navItems = [['Home', '/'], ['Players', '/players'], ['Matches', '/matches'], ['Statistics', '/statistics'], ['Media', '/media']]

export function Navbar() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return <header className="site-header" id="top"><div className="nav-wrap"><Brand onClick={close} /><nav className={open ? 'main-nav open' : 'main-nav'} aria-label="Main navigation">{navItems.map(([label, path]) => <NavLink key={path} to={path} end={path === '/'} onClick={close}>{label}</NavLink>)}</nav><div className="nav-right"><span className="season-indicator"><i />2026 / 27 SEASON</span><Link className="nav-cta" to="/players">EXPLORE PLAYERS <ArrowUpRight size={14} /></Link></div><button className="menu-toggle" onClick={() => setOpen(!open)} aria-label={open ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={open}>{open ? <X /> : <Menu />}</button></div></header>
}
