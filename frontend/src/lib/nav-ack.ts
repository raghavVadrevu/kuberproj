import type {
  ChatMessageDto,
  FriendRequestDto,
  PollDto,
  TabOverviewDto,
  VaultItemDto,
} from '@/lib/api'

const FRIENDS_ACK_KEY = 'huddle:navAck:_friends'

export type NavAckSnapshot = {
  pulse?: string
  decision?: string
  tab?: string
  vault?: string
  chat?: string
}

function groupAckKey(groupId: string): string {
  return `huddle:navAck:${groupId}`
}

export function loadGroupAck(groupId: string): NavAckSnapshot {
  try {
    const raw = localStorage.getItem(groupAckKey(groupId))
    if (!raw) return {}
    return JSON.parse(raw) as NavAckSnapshot
  } catch {
    return {}
  }
}

function saveGroupAck(groupId: string, patch: NavAckSnapshot): void {
  const next = { ...loadGroupAck(groupId), ...patch }
  localStorage.setItem(groupAckKey(groupId), JSON.stringify(next))
}

export function pollsFingerprint(polls: PollDto[]): string {
  const active = polls
    .filter((p) => p.status === 'active')
    .map((p) => ({
      id: p.id,
      vc: p.vote_count,
      mr: p.my_ranking,
      opts: p.options.map((o) => [o.id, o.first_choice_votes]),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
  return JSON.stringify(active)
}

export function tabFingerprint(tab: TabOverviewDto | null): string {
  if (!tab) return ''
  const unsettled = tab.expenses
    .filter((e) => !e.settled)
    .map((e) => [e.id, e.amount, e.settled, e.created_at])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  return JSON.stringify({ unsettled, net: tab.my_net })
}

export function pulseFingerprint(polls: PollDto[], tab: TabOverviewDto | null): string {
  return JSON.stringify({
    polls: pollsFingerprint(polls),
    tab: tabFingerprint(tab),
  })
}

export function vaultFingerprint(items: VaultItemDto[]): string {
  const stamp = items.reduce(
    (max, item) => Math.max(max, new Date(item.updated_at).getTime()),
    0,
  )
  return JSON.stringify({ count: items.length, stamp })
}

export function friendsFingerprint(incoming: FriendRequestDto[]): string {
  return JSON.stringify(incoming.map((r) => r.id).sort())
}

/** Unread chat = new messages from others (not the viewer, not @huddle bot lines). */
export function chatFingerprint(
  messages: ChatMessageDto[],
  viewerSub: string,
): string {
  const fromOthers = messages.filter(
    (m) => m.sender_sub !== viewerSub && !m.is_ai,
  )
  if (fromOthers.length === 0) return ''
  const last = fromOthers[fromOthers.length - 1]!
  return JSON.stringify({
    count: fromOthers.length,
    id: last.id,
    at: last.created_at,
  })
}

export function getFriendsAck(): string {
  return localStorage.getItem(FRIENDS_ACK_KEY) ?? ''
}

export function markFriendsSeen(fingerprint: string): void {
  localStorage.setItem(FRIENDS_ACK_KEY, fingerprint)
}

/** Record what the user has seen on each tab for this group. */
export function markNavTabsSeen(
  groupId: string,
  paths: {
    pulse?: string
    decision?: string
    tab?: string
    vault?: string
    chat?: string
  },
): void {
  saveGroupAck(groupId, paths)
}

export function isUnseenSinceAck(
  stored: string | undefined,
  current: string,
  hasContent: boolean,
): boolean {
  if (!hasContent) return false
  if (stored === undefined) return hasContent
  return stored !== current
}
