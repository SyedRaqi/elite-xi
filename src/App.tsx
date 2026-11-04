import { lazy, Suspense, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { Footer } from './components/Footer'
import { PlayerStoreProvider } from './data/PlayerStore'
const Home = lazy(() => import('./pages/Home').then((module) => ({ default: module.Home })))
const Players = lazy(() => import('./pages/Players').then((module) => ({ default: module.Players })))
const PlayerProfile = lazy(() => import('./pages/PlayerProfile').then((module) => ({ default: module.PlayerProfile })))
const Matches = lazy(() => import('./pages/Matches').then((module) => ({ default: module.Matches })))
const Statistics = lazy(() => import('./pages/Statistics').then((module) => ({ default: module.Statistics })))
const Media = lazy(() => import('./pages/Media').then((module) => ({ default: module.Media })))
const Admin = lazy(() => import('./pages/Admin').then((module) => ({ default: module.Admin })))

function PageRoutes() {
  const location = useLocation()
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [location.pathname])
  return <AnimatePresence mode="wait"><motion.div key={location.pathname} className="route-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}><Suspense fallback={<div className="loading-state">LOADING ELITE XI…</div>}><Routes location={location}><Route path="/" element={<Home />} /><Route path="/players" element={<Players />} /><Route path="/players/:playerId" element={<PlayerProfile />} /><Route path="/matches" element={<Matches />} /><Route path="/statistics" element={<Statistics />} /><Route path="/media" element={<Media />} /><Route path="/admin" element={<Admin />} /><Route path="*" element={<Home />} /></Routes></Suspense></motion.div></AnimatePresence>
}

function Layout() {
  return <><Navbar /><main id="main-content"><PageRoutes /></main><Footer /></>
}

export default function App() {
  return <PlayerStoreProvider><BrowserRouter><Layout /></BrowserRouter></PlayerStoreProvider>
}
