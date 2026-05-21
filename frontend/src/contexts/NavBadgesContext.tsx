import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'

import {
  ACTIVE_GROUP_STORAGE_KEY,
  apiJson,
  resolveActiveGroupId,
  type FriendRequestDto,
  type GroupDto,
  type PollDto,
  type TabOverviewDto,
  type VaultItemDto,
} from '@/lib/api'
import { getVaultLastSeenMs, markVaultSeen } from '@/lib/vault-last-seen'

export type NavBadgePath = '/' | '/decision' | '/tab' | '/vault' | '/friends' | '/groups'

export type NavBadges = Record<NavBadgePath, boolean> & { more: boolean }

const defaultBadges: NavBadges = {
  '/': false,
  '/decision': false,
  '/tab': false,
  '/vault': false,
  '/friends': false,
  '/groups': false,
  more: false,
}

const NavBadgesContext = createContext<NavBadges>(defaultBadges)

function routeIsActive(path: string, pathname: string): boolean {
  if (path === '/ai') {
    return pathname === '/ai' || pathname === '/concierge'
  }
  return pathname === path
}

function moreMenuIsActive(pathname: string): boolean {
  return (
    routeIsActive('/friends', pathname) ||
    routeIsActive('/groups', pathname) ||
    routeIsActive('/ai', pathname)
  )
}

function countPollsNeedingVote(polls: PollDto[]): number {
  return polls.filter((p) => p.status === 'active' && !p.my_ranking?.length).length
}

export function NavBadgesProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [badges, setBadges] = useState<NavBadges>(defaultBadges)

  const refresh = useCallback(async () => {
    try {
      const [groups, incoming] = await Promise.all([
        apiJson<GroupDto[]>('/groups'),
        apiJson<FriendRequestDto[]>('/friends/requests/incoming'),
      ])

      const groupId = resolveActiveGroupId(groups)
      if (groupId) {
        const stored = localStorage.getItem(ACTIVE_GROUP_STORAGE_KEY)
        if (stored !== groupId) {
          localStorage.setItem(ACTIVE_GROUP_STORAGE_KEY, groupId)
        }
      }

      const [polls, tab, vaultItems] = await Promise.all([
        groupId ? apiJson<PollDto[]>(`/groups/${groupId}/polls`) : Promise.resolve([]),
        groupId ? apiJson<TabOverviewDto>(`/groups/${groupId}/tab`) : Promise.resolve(null),
        groupId ? apiJson<VaultItemDto[]>(`/groups/${groupId}/vault`) : Promise.resolve([]),
      ])

      const pollsNeedingVote = countPollsNeedingVote(polls)
      const unsettledCount = tab?.expenses.filter((e) => !e.settled).length ?? 0
      const vaultLastSeen = getVaultLastSeenMs()
      const vaultHasNew = vaultItems.some(
        (item) => new Date(item.updated_at).getTime() > vaultLastSeen,
      )
      const incomingCount = incoming.length

      const onPulse = routeIsActive('/', pathname)
      const onDecide = routeIsActive('/decision', pathname)
      const onTab = routeIsActive('/tab', pathname)
      const onVault = routeIsActive('/vault', pathname)
      const onFriends = routeIsActive('/friends', pathname)
      const onMore = moreMenuIsActive(pathname)

      setBadges({
        '/': !onPulse && (pollsNeedingVote > 0 || unsettledCount > 0),
        '/decision': !onDecide && pollsNeedingVote > 0,
        '/tab': !onTab && unsettledCount > 0,
        '/vault': !onVault && vaultHasNew,
        '/friends': !onFriends && incomingCount > 0,
        '/groups': false,
        more: !onMore && incomingCount > 0,
      })
    } catch {
      setBadges(defaultBadges)
    }
  }, [pathname])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const id = window.setInterval(() => void refresh(), 60_000)
    return () => window.clearInterval(id)
  }, [refresh])

  useEffect(() => {
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  useEffect(() => {
    const onRefresh = () => void refresh()
    window.addEventListener(NAV_BADGES_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(NAV_BADGES_REFRESH_EVENT, onRefresh)
  }, [refresh])

  useEffect(() => {
    if (pathname === '/vault') {
      markVaultSeen()
      setBadges((prev) => ({ ...prev, '/vault': false }))
    }
  }, [pathname])

  const value = useMemo(() => badges, [badges])

  return <NavBadgesContext.Provider value={value}>{children}</NavBadgesContext.Provider>
}

export function useNavBadges(): NavBadges {
  return useContext(NavBadgesContext)
}

export const NAV_BADGES_REFRESH_EVENT = 'huddle:nav-badges-refresh'

export function refreshNavBadges(): void {
  window.dispatchEvent(new Event(NAV_BADGES_REFRESH_EVENT))
}
