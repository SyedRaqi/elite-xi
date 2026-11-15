import { useEffect, useRef, useState } from 'react'

const portraitCache = new Map<string, Promise<string | null>>()

function findPortrait(name: string) {
  const existing = portraitCache.get(name)
  if (existing) return existing

  const params = new URLSearchParams({
    action: 'query', format: 'json', prop: 'pageimages', piprop: 'thumbnail',
    pithumbsize: '900', redirects: '1', origin: '*', titles: name,
  })
  const request = fetch(`https://en.wikipedia.org/w/api.php?${params}`)
    .then(async (response) => {
      if (!response.ok) return null
      const payload = await response.json() as { query?: { pages?: Record<string, { thumbnail?: { source?: string } }> } }
      return Object.values(payload.query?.pages ?? {})[0]?.thumbnail?.source ?? null
    })
    .catch(() => null)
  portraitCache.set(name, request)
  return request
}

export function usePlayerPortrait(name: string, fallback: string, preferFallback = false) {
  const [portrait, setPortrait] = useState(fallback)
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    let active = true
    setPortrait(fallback)
    if (preferFallback || !name) return
    const element = imageRef.current
    if (!element) return
    const load = () => {
      void findPortrait(name).then((source) => {
        if (active && source) setPortrait(source)
      })
    }
    if (!('IntersectionObserver' in window)) {
      load()
      return () => { active = false }
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        observer.disconnect()
        load()
      }
    }, { rootMargin: '160px' })
    observer.observe(element)
    return () => { active = false; observer.disconnect() }
  }, [name, fallback, preferFallback])

  return { portrait, imageRef }
}

export function PlayerPortrait({ name, fallback, className, preferFallback = false }: { name: string; fallback: string; className?: string; preferFallback?: boolean }) {
  const { portrait, imageRef } = usePlayerPortrait(name, fallback, preferFallback)
  return <img ref={imageRef} className={className} src={portrait} alt={`${name} portrait`} loading="lazy" onError={(event) => { event.currentTarget.src = fallback }} />
}
