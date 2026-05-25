export function subMonogram(sub: string): string {
  const alnum = sub.replace(/[^a-zA-Z0-9]/g, '')
  if (alnum.length >= 2) return alnum.slice(0, 2).toUpperCase()
  return sub.slice(0, 2).toUpperCase()
}

export function initialsFromName(name: string | null | undefined, sub: string): string {
  if (name?.trim()) {
    const p = name.trim().split(/\s+/)
    if (p.length >= 2) return (p[0]![0] + p[1]![0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  return subMonogram(sub)
}
