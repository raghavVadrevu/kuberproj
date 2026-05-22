import type { GroupMemberDto } from '@/lib/api'

export type MentionOption = {
  id: string
  label: string
  insert: string
  kind: 'ai' | 'member'
}

export function getActiveMention(
  value: string,
  cursorPos: number,
): { query: string; start: number } | null {
  const before = value.slice(0, cursorPos)
  const match = before.match(/@([a-zA-Z0-9_]*)$/)
  if (!match) return null
  return {
    query: match[1] ?? '',
    start: cursorPos - match[0].length,
  }
}

function memberLabel(m: GroupMemberDto): string {
  return m.display_name?.trim() || m.email?.split('@')[0] || 'Member'
}

function mentionScore(label: string, query: string): number {
  const name = label.toLowerCase()
  const q = query.toLowerCase()
  if (!q) return 1
  if (name.startsWith(q)) return 3
  const parts = name.split(/\s+/)
  if (parts.some((p) => p.startsWith(q))) return 2
  if (name.includes(q)) return 1
  return 0
}

export function buildMentionSuggestions(
  query: string,
  members: GroupMemberDto[],
  meSub: string | null,
): MentionOption[] {
  const out: MentionOption[] = []
  const q = query.toLowerCase()

  if (!q || 'huddle'.startsWith(q) || mentionScore('huddle', query) > 0) {
    out.push({
      id: 'huddle',
      label: 'Huddle AI',
      insert: 'huddle',
      kind: 'ai',
    })
  }

  for (const m of members) {
    if (m.user_sub === meSub) continue
    const label = memberLabel(m)
    const score = mentionScore(label, query)
    if (score <= 0) continue
    const first = label.split(/\s+/)[0] ?? label
    const insert = first.replace(/[^a-zA-Z0-9_]/g, '') || first
    out.push({
      id: m.user_sub,
      label,
      insert,
      kind: 'member',
    })
  }

  return out.sort((a, b) => {
    if (a.kind === 'ai' && b.kind !== 'ai') return -1
    if (b.kind === 'ai' && a.kind !== 'ai') return 1
    const sa = mentionScore(a.label, query) + (a.kind === 'ai' ? 2 : 0)
    const sb = mentionScore(b.label, query) + (b.kind === 'ai' ? 2 : 0)
    if (sb !== sa) return sb - sa
    return a.label.localeCompare(b.label)
  })
}

export function applyMention(
  value: string,
  start: number,
  cursorPos: number,
  insert: string,
): { nextValue: string; nextCursor: number } {
  const before = value.slice(0, start)
  const after = value.slice(cursorPos)
  const nextValue = `${before}@${insert} ${after}`
  const nextCursor = before.length + insert.length + 2
  return { nextValue, nextCursor }
}

export function formatTypingLabel(
  names: string[],
): string | null {
  if (names.length === 0) return null
  if (names.length === 1) return `${names[0]} is typing…`
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`
  return `${names[0]} and ${names.length - 1} others are typing…`
}
