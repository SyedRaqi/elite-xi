import { Link } from 'react-router-dom'

type BrandProps = { onClick?: () => void }

export function Brand({ onClick }: BrandProps) {
  return <Link to="/" className="brand" aria-label="Elite XI home" onClick={onClick}>
    <img className="brand-mark" src="/elite-xi-mark.svg" alt="" aria-hidden="true" />
    <span className="brand-copy">
      <span className="brand-wordmark">ELITE<span className="brand-accent">XI</span></span>
      <small>FOOTBALL INTELLIGENCE</small>
    </span>
  </Link>
}
