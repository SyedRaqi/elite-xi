import { useId } from 'react'
import { Link } from 'react-router-dom'

type BrandProps = { onClick?: () => void; subtitle?: string }

export function Brand({ onClick, subtitle = 'FOOTBALL INTELLIGENCE' }: BrandProps) {
  const markId = useId().replace(/:/g, '')
  return <Link to="/" className="brand" aria-label="Elite XI home" onClick={onClick}>
    <svg className="brand-mark" viewBox="0 0 72 80" role="presentation" aria-hidden="true">
      <defs>
        <linearGradient id={`${markId}-crystal`} x1="8" y1="4" x2="65" y2="75" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7CF7FF" />
          <stop offset=".34" stopColor="#6C8BFF" />
          <stop offset=".68" stopColor="#C27BFF" />
          <stop offset="1" stopColor="#FFD27A" />
        </linearGradient>
        <linearGradient id={`${markId}-face`} x1="13" y1="9" x2="59" y2="69" gradientUnits="userSpaceOnUse">
          <stop stopColor="#142B44" stopOpacity=".98" />
          <stop offset=".5" stopColor="#101322" stopOpacity=".96" />
          <stop offset="1" stopColor="#24162C" stopOpacity=".98" />
        </linearGradient>
        <linearGradient id={`${markId}-light`} x1="8" y1="0" x2="54" y2="65" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E7FFFF" />
          <stop offset=".42" stopColor="#75EAFF" />
          <stop offset="1" stopColor="#D49AFF" />
        </linearGradient>
        <filter id={`${markId}-glow`} x="-60%" y="-50%" width="220%" height="210%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path className="brand-mark-halo" d="M36 2 69 15v26c0 18.5-12.7 30.7-33 37C15.7 71.7 3 59.5 3 41V15L36 2Z" fill="none" stroke={`url(#${markId}-crystal)`} strokeWidth="1" />
      <path className="brand-mark-shield" d="M36 5 64 16v24c0 16.1-10.7 27.2-28 33C19.7 67.2 9 56.1 9 40V16L36 5Z" fill={`url(#${markId}-face)`} stroke={`url(#${markId}-crystal)`} strokeWidth="2.4" />
      <path d="m36 10 22 9v21c0 12.8-8 22.1-22 27.5C22 62.1 14 52.8 14 40V19l22-9Z" fill="none" stroke="#DDF9FF" strokeOpacity=".26" />
      <path className="brand-mark-crown" d="m25 17 5 5 6-8 6 8 5-5 2 10H23l2-10Z" fill={`url(#${markId}-crystal)`} filter={`url(#${markId}-glow)`} />
      <path d="m26 33 11 15m0-15L26 48m19-15v15m-4-15h9m-9 15h9" fill="none" stroke={`url(#${markId}-light)`} strokeWidth="3.6" strokeLinecap="square" />
      <path d="m18 54 18 10 18-10" fill="none" stroke={`url(#${markId}-crystal)`} strokeOpacity=".7" strokeWidth="1.2" />
      <path className="brand-mark-glint" d="M12 18 36 8l19 8" fill="none" stroke="#E9FFFF" strokeOpacity=".8" strokeWidth="1.2" />
      <circle cx="54" cy="27" r="2" fill="#FFF0BE" />
    </svg>
    <span className="brand-copy">
      <span className="brand-wordmark">ELITE<span className="brand-accent">XI</span></span>
      <small>{subtitle}</small>
    </span>
  </Link>
}
