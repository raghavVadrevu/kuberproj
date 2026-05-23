import { fetchAuthSession } from 'aws-amplify/auth'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function apiBase(): string {
  const raw = import.meta.env.VITE_API_BASE as string | undefined
  const trimmed = raw?.trim()
  if (!trimmed) return '/api'
  return trimmed.replace(/\/$/, '')
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await fetchAuthSession()
  const token = session.tokens?.idToken?.toString()
  if (!token) {
    throw new ApiError(401, 'Not signed in')
  }
  const p = path.startsWith('/') ? path : `/${path}`
  const url = `${apiBase()}${p}`
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(url, { ...init, headers })
  const text = await res.text()
  if (!res.ok) {
    let msg = text
    try {
      const j = JSON.parse(text) as { detail?: unknown }
      if (j?.detail !== undefined) {
        msg = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
      }
    } catch {
      /* keep text */
    }
    throw new ApiError(res.status, msg || res.statusText)
  }
  if (!text) {
    return undefined as T
  }
  return JSON.parse(text) as T
}

export type UserProfileDto = {
  sub: string
  email: string | null
  display_name: string
}

export type FriendRequestDto = {
  id: string
  from_sub: string
  to_sub: string
  status: string
  created_at: string
  from_display_name?: string | null
  from_email?: string | null
  to_display_name?: string | null
  to_email?: string | null
}

export type FriendRequestCreateResultDto = {
  became_friends: boolean
  request: FriendRequestDto | null
}

export type GroupDto = {
  id: string
  name: string
  created_by: string
  created_at: string
  member_count: number
}

export type GroupMemberDto = {
  user_sub: string
  role: string
  joined_at: string
  display_name?: string | null
  email?: string | null
}

export type GroupDetailDto = GroupDto & { members: GroupMemberDto[] }

export type PollOptionDto = {
  id: string
  label: string
  sort_order: number
  first_choice_votes: number
}

export type PollDto = {
  id: string
  group_id: string
  title: string
  status: string
  created_by: string
  created_at: string
  options: PollOptionDto[]
  vote_count: number
  my_ranking: string[] | null
}

export type HeatmapCellDto = {
  count: number
  members: string[]
}

export type AvailabilityDto = {
  heatmap: Record<string, Record<string, HeatmapCellDto>>
  mine: string[]
}

export type TabMemberLiteDto = {
  user_sub: string
  display_name?: string | null
}

export type ExpenseOutDto = {
  id: string
  group_id: string
  description: string
  amount: number
  category: string
  paid_by_sub: string
  paid_by_display_name?: string | null
  participant_subs: string[]
  participant_count: number
  share_amount: number
  settled: boolean
  created_at: string
}

export type TabBalanceRowDto = {
  user_sub: string
  display_name?: string | null
  net: number
}

export type TabOverviewDto = {
  viewer_sub: string
  my_net: number
  balances: TabBalanceRowDto[]
  expenses: ExpenseOutDto[]
  members: TabMemberLiteDto[]
}

export type PulseTldrDto = {
  tldr: string
  generated_by: 'llm' | 'fallback'
}

export type VaultItemDto = {
  id: string
  group_id: string
  item_type: string
  title: string
  subtitle: string | null
  value: string
  category: string
  created_by: string
  created_at: string
  updated_at: string
}

export type ChatMessageDto = {
  id: string
  group_id: string
  sender_sub: string
  sender_display_name: string | null
  content: string
  created_at: string
  is_ai: boolean
}

export const VAULT_CATEGORIES = ['Access Codes', 'Locations', 'Links'] as const

export const ACTIVE_GROUP_STORAGE_KEY = 'huddle:activeGroupId'

export function resolveActiveGroupId(groups: GroupDto[]): string | null {
  if (groups.length === 0) return null
  const stored = localStorage.getItem(ACTIVE_GROUP_STORAGE_KEY)
  if (stored && groups.some((g) => g.id === stored)) return stored
  return groups[0]!.id
}
