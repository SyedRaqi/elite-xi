import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { isSupabaseConfigured } from '../services/supabaseConfig'
import { Brand } from './Brand'

export function Footer() {
  return <footer className="site-footer"><div className="footer-top"><Brand /><nav className="footer-nav" aria-label="Footer navigation"><Link to="/">HOME</Link><Link to="/players">PLAYERS</Link><Link to="/matches">MATCHES</Link><Link to="/statistics">STATISTICS</Link><Link to="/media">MEDIA</Link><Link to="/admin">ADMIN</Link></nav><a className="back-top" href="#top">BACK TO TOP <ArrowUpRight size={14} /></a></div><div className="footer-bottom"><span>© 2026 ELITE XI. SAMPLE PLATFORM.</span><span>Ronaldo photo: <a href="https://commons.wikimedia.org/wiki/File:Cristiano_Ronaldo_in_Al_Nassr_in_2023.jpg" target="_blank" rel="noreferrer">Mehrdad Esfahani / SNN</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></span><span>{isSupabaseConfigured ? 'Supabase client configured · imports require an admin session' : 'Demonstration data · no backend configured'}</span></div></footer>
}
