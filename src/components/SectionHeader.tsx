type Props = { eyebrow: string; title: string; description?: string; action?: React.ReactNode }

export function SectionHeader({ eyebrow, title, description, action }: Props) {
  return <div className="section-header"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{description && <p className="section-description">{description}</p>}</div>{action}</div>
}
