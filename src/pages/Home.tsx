import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, animate, motion, useReducedMotion, useScroll, useSpring, useTransform, useMotionValue } from 'framer-motion'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flag,
  Goal,
  MapPin,
  Shield,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PlayerPortrait } from '../components/PlayerPortrait'
import { usePlayerStore } from '../data/PlayerStore'
import { players as presentationPlayers } from '../data/players'
import { clubShowcase } from '../data/clubs'
import { matches } from '../data/matches'
import type { Player } from '../types/player'
import '../styles/home.css'

const stadiumBackdrop = 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=2400&q=90'
const shortcuts = [
  { label: 'Players', detail: 'Explore the roster', href: '/players', icon: Users, number: '01' },
  { label: 'Clubs', detail: 'Club directory', href: '/#clubs', icon: Shield, number: '02' },
  { label: 'Leagues', detail: 'Competition index', href: '/#leagues', icon: Flag, number: '03' },
  { label: 'Matches', detail: 'Fixtures & results', href: '/matches', icon: CalendarDays, number: '04' },
  { label: 'Analytics', detail: 'Performance data', href: '/statistics', icon: BarChart3, number: '05' },
  { label: 'Career', detail: 'Player journeys', href: '/#career', icon: Trophy, number: '06' },
]

function AnimatedFigure({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (reducedMotion) {
      setCount(value)
      return
    }
    let controls: ReturnType<typeof animate> | undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !controls) {
        controls = animate(0, value, {
          duration: 1.35,
          ease: 'easeOut',
          onUpdate: (latest) => setCount(Math.round(latest)),
        })
        observer.disconnect()
      }
    }, { threshold: 0.4 })
    observer.observe(node)
    return () => {
      observer.disconnect()
      controls?.stop()
    }
  }, [reducedMotion, value])

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>
}

function SampleTag() {
  return <span className="home-sample-tag"><Sparkles size={12} /> PRESENTATION PREVIEW · SAMPLE DATA</span>
}

function matchDate(date: string): Date | null {
  const parts = date.match(/(\d{1,2})\s+([A-Z]{3})\s+(\d{4})(?:\s*[·-]\s*(\d{1,2}):(\d{2}))?/i)
  if (!parts) return null
  const month = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(parts[2].toUpperCase())
  if (month < 0) return null
  return new Date(Number(parts[3]), month, Number(parts[1]), Number(parts[4] ?? 23), Number(parts[5] ?? 59))
}

function FeaturedPlayer({ player, index, total }: { player: Player; index: number; total: number }) {
  const profileHref = `/players/${player.id}`
  const prefersReducedMotion = useReducedMotion()
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const rotateX = useSpring(useTransform(pointerY, [-0.5, 0.5], [3.2, -3.2]), { stiffness: 110, damping: 20, mass: 0.5 })
  const rotateY = useSpring(useTransform(pointerX, [-0.5, 0.5], [-4.2, 4.2]), { stiffness: 110, damping: 20, mass: 0.5 })
  const imageX = useSpring(useTransform(pointerX, [-0.5, 0.5], [7, -7]), { stiffness: 90, damping: 20 })
  const imageY = useSpring(useTransform(pointerY, [-0.5, 0.5], [5, -5]), { stiffness: 90, damping: 20 })
  const ringsX = useSpring(useTransform(pointerX, [-0.5, 0.5], [-5, 5]), { stiffness: 75, damping: 22 })
  const ringsY = useSpring(useTransform(pointerY, [-0.5, 0.5], [-4, 4]), { stiffness: 75, damping: 22 })

  const trackPointer = (event: ReactPointerEvent<HTMLElement>) => {
    if (prefersReducedMotion || event.pointerType !== 'mouse') return
    const bounds = event.currentTarget.getBoundingClientRect()
    pointerX.set((event.clientX - bounds.left) / bounds.width - 0.5)
    pointerY.set((event.clientY - bounds.top) / bounds.height - 0.5)
  }

  const resetPointer = () => {
    pointerX.set(0)
    pointerY.set(0)
  }

  return <motion.article
    className="home-feature-card"
    initial={prefersReducedMotion ? false : { opacity: 0, x: 40 }}
    animate={{ opacity: 1, x: 0 }}
    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: -32 }}
    transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    onPointerMove={trackPointer}
    onPointerLeave={resetPointer}
    style={prefersReducedMotion ? undefined : { transformPerspective: 1200, rotateX, rotateY }}
    role="group"
    aria-roledescription="slide"
    aria-label={`Sample player ${index + 1} of ${total}: ${player.name}`}
  >
    <div className="home-feature-image-wrap">
      <motion.div className="home-feature-rings" style={{ x: ringsX, y: ringsY }} aria-hidden="true" />
      <motion.div className="home-feature-parallax" style={{ x: imageX, y: imageY }}>
        <PlayerPortrait name={player.name} fallback={player.image} className="home-feature-image" />
      </motion.div>
      <span className="home-feature-number">{String(player.number).padStart(2, '0')}</span>
      <span className="home-feature-index">PROFILE / {String(index + 1).padStart(2, '0')} — {String(total).padStart(2, '0')}</span>
      <span className="home-feature-glint" aria-hidden="true" />
    </div>
    <div className="home-feature-meta">
      <div>
        <span className="home-feature-kicker">FEATURED PROFILE · SAMPLE</span>
        <h2>{player.name}</h2>
        <p>{player.position} <i /> {player.club}</p>
      </div>
      <Link className="home-round-link" to={profileHref} aria-label={`Open ${player.name} profile`}><ArrowUpRight size={18} /></Link>
    </div>
    <div className="home-feature-footer"><span><MapPin size={12} /> {player.nationality}</span><span>PLAYER FILE <b>001</b></span></div>
  </motion.article>
}

export function Home() {
  const { players } = usePlayerStore()
  const featuredPlayers = players.length ? players : presentationPlayers
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [discoveryPosition, setDiscoveryPosition] = useState('')
  const heroRef = useRef<HTMLElement>(null)
  const prefersReducedMotion = useReducedMotion()
  const finalPointerX = useMotionValue(0)
  const finalPointerY = useMotionValue(0)
  const finalPlayerX = useSpring(useTransform(finalPointerX, [-0.5, 0.5], [17, -17]), { stiffness: 75, damping: 22 })
  const finalPlayerY = useSpring(useTransform(finalPointerY, [-0.5, 0.5], [11, -11]), { stiffness: 75, damping: 22 })
  const finalOrbitX = useSpring(useTransform(finalPointerX, [-0.5, 0.5], [-12, 12]), { stiffness: 55, damping: 22 })
  const finalOrbitY = useSpring(useTransform(finalPointerY, [-0.5, 0.5], [-8, 8]), { stiffness: 55, damping: 22 })
  const finalBackdropX = useTransform(finalPointerX, [-0.5, 0.5], [7, -7])
  const finalBackdropY = useTransform(finalPointerY, [-0.5, 0.5], [5, -5])
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const backdropY = useTransform(scrollYProgress, [0, 1], [0, prefersReducedMotion ? 0 : 72])
  const featured = featuredPlayers[selectedIndex % featuredPlayers.length] ?? presentationPlayers[0]
  const leagueNames = useMemo(() => [...new Set(featuredPlayers.map((player) => player.league).filter(Boolean))].slice(0, 5), [featuredPlayers])
  const recentSample = matches.filter((match) => match.status === 'FT')
    .map((match) => ({ match, date: matchDate(match.date) }))
    .filter((item) => item.date)
    .sort((a, b) => b.date!.getTime() - a.date!.getTime())[0]?.match
  const nextSample = matches.filter((match) => match.status === 'UPCOMING')
    .map((match) => ({ match, date: matchDate(match.date) }))
    .filter((item) => item.date && item.date.getTime() > Date.now())
    .sort((a, b) => a.date!.getTime() - b.date!.getTime())[0]?.match
  const availablePositions = [...new Set(featuredPlayers.map((player) => player.position.trim()).filter(Boolean))]
  const activeDiscoveryPosition = availablePositions.includes(discoveryPosition) ? discoveryPosition : (availablePositions[0] ?? '')
  const discoveryPlayers = featuredPlayers.filter((player) => player.position === activeDiscoveryPosition).slice(0, 4)

  const handleCarouselKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      showPlayer(-1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      showPlayer(1)
    }
  }

  const showPlayer = (direction: -1 | 1) => {
    setSelectedIndex((current) => (current + direction + featuredPlayers.length) % featuredPlayers.length)
  }

  const trackFinalParallax = (event: ReactPointerEvent<HTMLElement>) => {
    if (prefersReducedMotion || event.pointerType !== 'mouse') return
    const bounds = event.currentTarget.getBoundingClientRect()
    finalPointerX.set((event.clientX - bounds.left) / bounds.width - 0.5)
    finalPointerY.set((event.clientY - bounds.top) / bounds.height - 0.5)
  }

  const resetFinalParallax = () => {
    finalPointerX.set(0)
    finalPointerY.set(0)
  }

  return <div className="home-page">
    <section className="home-hero" id="home-hero" ref={heroRef}>
      <motion.div className="home-hero-backdrop" style={{ y: backdropY, backgroundImage: `url(${stadiumBackdrop})` }} aria-hidden="true" />
      <div className="home-hero-grid" aria-hidden="true" />
      <div className="home-hero-vignette" aria-hidden="true" />
      <motion.div className="home-orb home-orb-one" animate={prefersReducedMotion ? undefined : { y: [0, -12, 0], opacity: [0.38, 0.64, 0.38] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} aria-hidden="true" />
      <motion.div className="home-orb home-orb-two" animate={prefersReducedMotion ? undefined : { y: [0, 9, 0], opacity: [0.28, 0.5, 0.28] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }} aria-hidden="true" />
      <div className="home-spotlight home-spotlight-left" aria-hidden="true" />
      <div className="home-spotlight home-spotlight-right" aria-hidden="true" />
      <div className="home-atmosphere" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <span className={`home-particle home-particle-${index + 1}`} key={index} />)}</div>

      <div className="home-hero-inner">
        <motion.div className="home-hero-copy" initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.12 }}>
          <p className="home-eyebrow"><span /> THE GLOBAL FOOTBALL HUB</p>
          <h1>ELITE <em>XI</em></h1>
          <p className="home-hero-tagline">BEYOND FOOTBALL</p>
          <p className="home-hero-subtitle">Discover players, clubs, squads, stats and careers from around the world in one immersive platform.</p>
          <div className="home-hero-actions">
            <Link to="/players" className="home-primary-button">ENTER THE ROSTER <ArrowUpRight size={16} /></Link>
            <a href="#home-discover" className="home-text-button">DISCOVER ELITE XI <ArrowDown size={15} /></a>
          </div>
          <div className="home-hero-proof"><span className="home-live-dot" /> PLAYER PROFILES <i /> CLUBS <i /> MATCH CENTRE</div>
        </motion.div>

        <div className="home-player-stage" role="region" aria-roledescription="carousel" aria-label="Featured player sample carousel" aria-describedby="home-carousel-help" tabIndex={0} onKeyDown={handleCarouselKeyDown}>
          <span className="home-sr-only" id="home-carousel-help">Use the left and right arrow keys to browse sample player profiles.</span>
          <div className="home-stage-topline"><span>ELITE XI / PLAYER ARCHIVE</span><span>01 — {String(featuredPlayers.length).padStart(2, '0')}</span></div>
          <AnimatePresence mode="wait">
            <FeaturedPlayer key={featured.id} player={featured} index={selectedIndex} total={featuredPlayers.length} />
          </AnimatePresence>
          <aside className="home-feature-intel" aria-label={`Sample profile details for ${featured.name}`}>
            <div className="home-intel-name"><span>{featured.countryCode ? String.fromCodePoint(...[...featured.countryCode.toUpperCase()].map((letter) => letter.charCodeAt(0) + 127397)) : '★'}</span><div><small>FEATURED PLAYER · SAMPLE</small><b>{featured.name}</b></div></div>
            <p className="home-intel-club">{featured.club} <i /> {featured.position}</p>
            <div className="home-intel-facts"><span><b>{featured.age > 0 ? featured.age : '—'}</b><small>Age</small></span><span><b>{featured.height || '—'}</b><small>Height</small></span><span><b>{featured.number > 0 ? `#${featured.number}` : '—'}</b><small>Number</small></span></div>
            <div className="home-intel-stat"><span>Career goals <b>{featured.stats.goals}</b></span><i><b style={{ width: `${Math.min(100, Math.max(8, featured.stats.goals / 10))}%` }} /></i></div>
            <div className="home-intel-stat"><span>Assists <b>{featured.stats.assists}</b></span><i><b style={{ width: `${Math.min(100, Math.max(8, featured.stats.assists / 4))}%` }} /></i></div>
            <div className="home-intel-stat"><span>Appearances <b>{featured.stats.appearances}</b></span><i><b style={{ width: `${Math.min(100, Math.max(8, featured.stats.appearances / 15))}%` }} /></i></div>
            <Link to={`/players/${featured.id}`} className="home-intel-profile">VIEW FULL PROFILE <ArrowRight size={14} /></Link>
            <small className="home-intel-disclaimer">PRESENTATION DATA · CHECK PLAYER FILE</small>
          </aside>
          <aside className="home-roster-rail" aria-label="Choose a featured sample player">
            <span className="home-roster-rail-label">ROSTER SPOTLIGHT</span>
            {featuredPlayers.slice(0, 8).map((player) => {
              const playerIndex = featuredPlayers.findIndex((candidate) => candidate.id === player.id)
              return <button type="button" className={`home-roster-pick ${player.id === featured.id ? 'is-active' : ''}`} key={player.id} onClick={() => setSelectedIndex(playerIndex)} aria-pressed={player.id === featured.id}>
                <PlayerPortrait name={player.name} fallback={player.image} className="home-roster-pick-photo" />
                <span><b>{player.shortName}</b><small>{player.position} · {player.club}</small></span><ArrowUpRight size={14} />
              </button>
            })}
          </aside>
          <div className="home-carousel-controls">
            <div className="home-carousel-caption"><span>SCROLL THE ROSTER</span><b>{String(selectedIndex + 1).padStart(2, '0')} <i>/</i> {String(featuredPlayers.length).padStart(2, '0')}</b></div>
            <div className="home-carousel-buttons">
              <button type="button" onClick={() => showPlayer(-1)} aria-label="Previous featured player"><ChevronLeft size={17} /></button>
              <button type="button" onClick={() => showPlayer(1)} aria-label="Next featured player"><ChevronRight size={17} /></button>
            </div>
          </div>
        </div>
      </div>
      <div className="home-hero-bottom"><SampleTag /><a href="#home-discover">SCROLL TO EXPLORE <span>↓</span></a><span>EST. IN THE GAME</span></div>
    </section>

    <motion.section className="home-shortcuts" id="home-discover" aria-label="Explore Elite XI" initial={prefersReducedMotion ? false : { opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.08 }} transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.55 }}>
      <div className="home-section-label"><span>01 / EXPLORE</span><p>ONE GAME. EVERY ANGLE.</p></div>
      <div className="home-shortcut-grid">
        {shortcuts.map(({ label, detail, href, icon: Icon, number }, index) => <motion.div key={label} initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.25 }} transition={prefersReducedMotion ? { duration: 0 } : { delay: index * 0.06, duration: 0.4 }}>
          <Link className="home-shortcut" to={href}>
            <span className="home-shortcut-index">{number}</span><Icon size={19} /><span className="home-shortcut-copy"><b>{label}</b><small>{detail}</small></span><ArrowUpRight className="home-shortcut-arrow" size={16} />
          </Link>
        </motion.div>)}
      </div>
    </motion.section>

    <motion.section className="home-featured-section" id="career" initial={prefersReducedMotion ? false : { opacity: 0, y: 26 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.08 }} transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.58 }}>
      <div className="home-section-heading">
        <div><p className="home-eyebrow"><span /> 02 / PLAYER INTELLIGENCE</p><h2>THE GAME,<br /><em>IN DETAIL.</em></h2></div>
        <div className="home-heading-side"><SampleTag /><p>Featured player figures below are illustrative presentation data, not verified live statistics.</p><Link to="/statistics" className="home-text-button">OPEN ANALYTICS <ArrowUpRight size={15} /></Link></div>
      </div>
      <div className="home-player-stats">
        <motion.div className="home-stats-portrait" initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, x: -18 }} whileInView={{ opacity: 1, scale: 1, x: 0 }} whileHover={prefersReducedMotion ? undefined : { scale: 1.012, rotateY: 1.2 }} viewport={{ once: true }} transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }} style={{ perspective: 1100 }}>
          <PlayerPortrait name={featured.name} fallback={featured.image} className="home-stats-image" />
          <div className="home-stats-portrait-shade" />
          <motion.span className="home-intelligence-orbit" aria-hidden="true" animate={prefersReducedMotion ? undefined : { rotate: 360 }} transition={{ duration: 44, repeat: Infinity, ease: 'linear' }} />
          <span className="home-intelligence-scan" aria-hidden="true" />
          <span className="home-portrait-caption">PROFILE PREVIEW / {featured.name.toUpperCase()}</span>
          <Link to={`/players/${featured.id}`} className="home-portrait-link">VIEW PROFILE <ArrowUpRight size={14} /></Link>
        </motion.div>
        <motion.div className="home-stat-panel" initial={prefersReducedMotion ? false : { opacity: 0, x: 24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.2 }} transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.62, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}>
          <div className="home-stat-panel-heading"><div><span>PLAYER SNAPSHOT</span><h3>{featured.shortName}</h3></div><span className="home-data-state"><i /> SAMPLE</span></div>
          {featured.statisticsScope === 'unavailable' ? <div className="home-stats-unavailable"><Sparkles size={18} /><b>PLAYER DETAILS ONLY</b><span>No verified statistics are available for this presentation profile.</span></div> : <div className="home-stat-grid">
            <motion.div className="home-stat-cell" initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: prefersReducedMotion ? 0 : .42, delay: prefersReducedMotion ? 0 : .08 }}><span><Goal size={14} /> CAREER GOALS</span><strong><AnimatedFigure value={featured.stats.goals} /></strong><small>Illustrative profile data</small></motion.div>
            <motion.div className="home-stat-cell" initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: prefersReducedMotion ? 0 : .42, delay: prefersReducedMotion ? 0 : .15 }}><span><ArrowRight size={14} /> ASSISTS</span><strong><AnimatedFigure value={featured.stats.assists} /></strong><small>Illustrative profile data</small></motion.div>
            <motion.div className="home-stat-cell" initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: prefersReducedMotion ? 0 : .42, delay: prefersReducedMotion ? 0 : .22 }}><span><Clock3 size={14} /> APPEARANCES</span><strong><AnimatedFigure value={featured.stats.appearances} /></strong><small>Illustrative profile data</small></motion.div>
            <motion.div className="home-stat-cell" initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: prefersReducedMotion ? 0 : .42, delay: prefersReducedMotion ? 0 : .29 }}><span><Trophy size={14} /> HONOURS</span><strong><AnimatedFigure value={featured.stats.trophies} /></strong><small>Illustrative profile data</small></motion.div>
          </div>}
          {featured.statisticsScope !== 'unavailable' && <div className="home-stat-footnote"><Sparkles size={13} /> Temporary presentation figures from the local sample profile. Verify data in the player directory before relying on it.</div>}
        </motion.div>
      </div>
    </motion.section>

    <motion.section className="home-club-section" id="clubs" initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.08 }} transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.55 }}>
      <div className="home-section-heading home-compact-heading">
        <div><p className="home-eyebrow"><span /> 03 / CLUB CULTURE</p><h2>BUILT BY<br /><em>THE BADGE.</em></h2></div>
        <Link to="/players" className="home-text-button">EXPLORE PLAYER DIRECTORY <ArrowUpRight size={15} /></Link>
      </div>
      <div className="home-club-grid">
        {clubShowcase.map((club, index) => <motion.div key={club.name} className="home-club-card-wrap" initial={prefersReducedMotion ? false : { opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={prefersReducedMotion ? { duration: 0 } : { delay: index * 0.045, duration: 0.45 }} whileHover={prefersReducedMotion ? undefined : { y: -7, rotateX: 2, rotateY: index % 2 ? -2 : 2 }} style={{ '--club-accent': club.accent } as CSSProperties}>
          <Link to="/players" className="home-club-card">
            <img className="home-club-image" src={`https://images.unsplash.com/${club.atmosphere}?auto=format&fit=crop&w=1200&q=88`} alt="" aria-hidden="true" loading="lazy" />
            <span className="home-club-number">0{index + 1}</span><span className="home-club-mark">{club.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 3)}</span>
            <img className="home-club-crest" src={`https://media.api-sports.io/football/teams/${club.apiFootballId}.png`} alt={`${club.name} crest`} loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} />
            <div className="home-club-copy"><span>{club.country} · {club.league}</span><h3>{club.name}</h3><p>CLUB SPOTLIGHT <ArrowUpRight size={14} /></p></div>
          </Link>
        </motion.div>)}
      </div>
      <div className="home-league-band" id="leagues"><span>COMPETITIONS IN THE SAMPLE ROSTER</span><div>{leagueNames.map((league) => <Link to="/players" key={league}>{league}<ArrowUpRight size={12} /></Link>)}</div></div>
    </motion.section>

    <motion.section className="home-match-section" id="matches" initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.08 }} transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.55 }}>
      <div className="home-match-heading"><div><p className="home-eyebrow"><span /> 04 / MATCH CENTRE</p><h2>THE NEXT<br /><em>90 MINUTES.</em></h2></div><Link to="/matches" className="home-text-button">OPEN MATCH CENTRE <ArrowUpRight size={15} /></Link></div>
      <div className="home-match-board">
        <div className="home-match-board-top"><span><CalendarDays size={14} /> FIXTURE BOARD</span><span className="home-demo-pill">SAMPLE SCHEDULE · NOT LIVE</span></div>
      <div className="home-match-columns">
          {[{ label: 'LATEST SAMPLE RESULT', match: recentSample, score: true }, { label: nextSample ? 'NEXT SCHEDULED SAMPLE FIXTURE' : 'UPCOMING FIXTURE', match: nextSample, score: false }].map(({ label, match, score }) => <article className="home-match-preview" key={label}>
              <div className="home-match-title-row"><span className="home-match-label">{label}</span>{match && <span className={`home-match-state ${score ? 'is-complete' : 'is-upcoming'}`}>{score ? 'FULL TIME · SAMPLE' : 'UPCOMING · SAMPLE'}</span>}</div>
            {match ? <>
              <span className="home-match-comp">{match.competition}</span>
                <div className="home-match-teams"><div className="home-match-side"><span title="Team initials; crest not available in the existing match data">{match.home.split(/\s+/).map((part) => part[0]).join('').slice(0, 3)}</span><b>{match.home}</b><small>HOME</small></div><strong className={score ? 'home-match-score' : 'home-match-vs'}>{score ? match.score : 'VS'}</strong><div className="home-match-side away"><span title="Team initials; crest not available in the existing match data">{match.away.split(/\s+/).map((part) => part[0]).join('').slice(0, 3)}</span><b>{match.away}</b><small>AWAY</small></div></div>
              <div className="home-match-date"><CalendarDays size={13} /> {match.date}</div>
            </> : <p className="home-match-empty">No future sample fixture is scheduled in the available data.</p>}
            <span className="home-match-disclaimer">Existing local demo schedule · verify in Match Centre</span>
          </article>)}
        </div>
      </div>
    </motion.section>

    <motion.section className="home-discovery-section" id="player-discovery" initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.08 }} transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.55 }}>
      <div className="home-discovery-heading"><div><p className="home-eyebrow"><span /> 05 / PLAYER DISCOVERY</p><h2>FIND YOUR<br /><em>POSITION.</em></h2><p>Explore the sample roster by role, then open a player profile for more detail.</p></div><Link to="/players" className="home-primary-button">OPEN PLAYER DATABASE <ArrowUpRight size={16} /></Link></div>
      <div className="home-discovery-content">
        <div className="home-position-selector" role="group" aria-label="Discover players by position">
          <span>SELECT A ROLE</span>
          {availablePositions.map((position, index) => <button type="button" key={position} className={position === activeDiscoveryPosition ? 'active' : ''} aria-pressed={position === activeDiscoveryPosition} onClick={() => setDiscoveryPosition(position)}><small>0{index + 1}</small>{position}<ArrowUpRight size={14} /></button>)}
        </div>
        <div className="home-discovery-player-grid" aria-live="polite">
          <AnimatePresence mode="popLayout" initial={false}>
          {discoveryPlayers.map((player, index) => <motion.div layout key={player.id} className={`home-discovery-player home-discovery-player-${index + 1}`} initial={prefersReducedMotion ? false : { opacity: 0, y: 22, scale: .97, rotateX: -2 }} animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }} exit={prefersReducedMotion ? undefined : { opacity: 0, y: 12, scale: .97 }} whileHover={prefersReducedMotion ? undefined : { y: -7, rotateX: 2, rotateY: index % 2 ? -2 : 2, scale: 1.012 }} transition={prefersReducedMotion ? { duration: 0 } : { layout: { duration: .35 }, duration: .42, delay: index * .07, ease: [0.22, 1, 0.36, 1] }} style={{ perspective: 1000, transformStyle: 'preserve-3d' }}>
            <Link to={`/players/${player.id}`} aria-label={`View sample profile for ${player.name}`}>
              <PlayerPortrait name={player.name} fallback={player.image} className="home-discovery-photo" />
              <span className="home-discovery-shade" />
              <span className="home-discovery-number">0{index + 1}</span>
              <span className="home-discovery-copy"><small>{player.position} · SAMPLE PROFILE</small><b>{player.name}</b><span>{player.club} <ArrowUpRight size={13} /></span></span>
            </Link>
          </motion.div>)}
          </AnimatePresence>
          {discoveryPlayers.length === 0 && <p className="home-discovery-empty">No sample profiles are available for this position.</p>}
        </div>
      </div>
    </motion.section>

    <motion.section className="home-final-cta" onPointerMove={trackFinalParallax} onPointerLeave={resetFinalParallax} initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.08 }} transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.55 }}>
      <motion.div className="home-final-depth-layer" aria-hidden="true" style={{ x: finalBackdropX, y: finalBackdropY }} />
      <div className="home-final-pitch" aria-hidden="true"><i /><i /><i /></div>
      <motion.div className="home-final-orbit" aria-hidden="true" style={{ x: finalOrbitX, y: finalOrbitY }} />
      <motion.div className="home-final-player" aria-hidden="true" style={{ x: finalPlayerX, y: finalPlayerY, z: 38 }}><PlayerPortrait name={featured.name} fallback={featured.image} className="home-final-player-image" /><span>{featured.position} · SAMPLE PROFILE</span></motion.div>
      <div className="home-final-copy"><p className="home-eyebrow"><span /> THE WORLD GAME, REFRAMED</p><h2>FIND YOUR<br /><em>POINT OF VIEW.</em></h2><p>Explore player profiles and discover the stories behind every position.</p></div>
      <div className="home-final-actions"><Link to="/players" className="home-primary-button">EXPLORE THE PLAYERS <ArrowUpRight size={16} /></Link><div><button type="button" onClick={() => showPlayer(-1)} aria-label="Previous player"><ArrowLeft size={16} /></button><button type="button" onClick={() => showPlayer(1)} aria-label="Next player"><ArrowRight size={16} /></button><span>FEATURED PROFILE</span></div></div>
    </motion.section>
  </div>
}
