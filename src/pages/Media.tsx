import { useState } from 'react'
import { ArrowUpRight, X } from 'lucide-react'
import { SectionHeader } from '../components/SectionHeader'

const items = [
  { title: 'UNDER THE LIGHTS', category: 'Atmosphere', label: '01 / MATCHDAY', image: 'photo-1522778119026-d647f0596c20' },
  { title: 'THE BEAUTIFUL GAME', category: 'Action', label: '02 / ACTION', image: 'photo-1574629810360-7efbbe195018' },
  { title: 'THE BUILD UP', category: 'Training', label: '03 / TRAINING', image: 'photo-1517466787929-bc90951d0974' },
  { title: 'EVERY LAST INCH', category: 'Action', label: '04 / ACTION', image: 'photo-1431324155629-1a6deb1dec8d' },
  { title: 'A CITY IN COLOUR', category: 'Atmosphere', label: '05 / MATCHDAY', image: 'photo-1508098682722-e99c43a406b2' },
  { title: 'BEFORE THE WHISTLE', category: 'Training', label: '06 / TRAINING', image: 'photo-1521412644187-c49fa049e84d' },
]
const filters = ['All moments', 'Action', 'Atmosphere', 'Training']

export function Media() {
  const [filter, setFilter] = useState('All moments')
  const [selected, setSelected] = useState<(typeof items)[number] | null>(null)
  const visible = filter === 'All moments' ? items : items.filter((item) => item.category === filter)
  return <div className="page-wrap"><div className="page-masthead"><p className="eyebrow">FRAMES FROM THE GAME</p><h1>THE MOMENTS<br /><span>THAT STAY.</span></h1><p>A visual collection of the atmosphere, craft and detail that make football matter.</p></div><section className="section section-tight"><SectionHeader eyebrow="ELITE XI VISUAL ARCHIVE" title="IN THE FRAME." description="Editorial football photography · demonstration gallery." /><div className="gallery-filters">{filters.map((item) => <button className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div><div className="media-grid">{visible.map((item, index) => <button className={`media-tile media-tile-${index % 3}`} key={item.title} onClick={() => setSelected(item)}><img src={`https://images.unsplash.com/${item.image}?auto=format&fit=crop&w=1200&q=85`} alt={item.title} loading="lazy" /><span className="media-overlay" /><span className="media-label">{item.label}</span><span className="media-caption"><span><small>{item.category}</small><b>{item.title}</b></span><ArrowUpRight size={18} /></span></button>)}</div></section>{selected && <div className="lightbox" role="dialog" aria-modal="true" aria-label={selected.title} onClick={() => setSelected(null)}><button className="lightbox-close" onClick={() => setSelected(null)} aria-label="Close image"><X /></button><img src={`https://images.unsplash.com/${selected.image}?auto=format&fit=crop&w=1800&q=90`} alt={selected.title} onClick={(e) => e.stopPropagation()} /><p>{selected.label} — {selected.title}</p></div>}</div>
}
