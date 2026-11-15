import type { LucideIcon } from 'lucide-react'

export function StatCard({ icon: Icon, label, value, note }: { icon: LucideIcon; label: string; value: string | number; note: string }) {
  return <article className="stat-card"><div className="stat-card-top"><span>{label}</span><Icon size={18} strokeWidth={1.7} /></div><strong>{value}</strong><small>{note}</small></article>
}
