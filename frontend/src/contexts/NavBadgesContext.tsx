import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import { GroupSyncClient } from '@/lib/group-sync'
import {
  friendsFingerprint,
  getFriendsAck,
  isUnseenSinceAck,
  loadGroupAck,
  markFriendsSeen,
  markNavTabsSeen,
  pollsFingerprint,
  pulseFingerprint,
  tabFingerprint,
  vaultFingerprint,
} from '@/lib/nav-ack'

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

function tabHasUnsettled(tab: TabOverviewDto | null): boolean {
  return (tab?.expenses.some((e) => !e.settled) ?? false)
}

function hasActivePolls(polls: PollDto[]): boolean {
  return polls.some((p) => p.status === 'active')
}

export function NavBadgesProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [badges, setBadges] = useState<NavBadges>(defaultBadges)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const syncClientRef = useRef<GroupSyncClient | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [groups, incoming] = await Promise.all([
        apiJson<GroupDto[]>('/groups'),
        apiJson<FriendRequestDto[]>('/friends/requests/incoming'),
      ])

      const groupId = resolveActiveGroupId(groups)
      setActiveGroupId(groupId)

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

      const fpPolls = pollsFingerprint(polls)
      const fpTab = tabFingerprint(tab)
      const fpPulse = pulseFingerprint(polls, tab)
      const fpVault = vaultFingerprint(vaultItems)
      const fpFriends = friendsFingerprint(incoming)

      const onPulse = routeIsActive('/', pathname)
      const onDecide = routeIsActive('/decision', pathname)
      const onTab = routeIsActive('/tab', pathname)
      const onVault = routeIsActive('/vault', pathname)
      const onFriends = routeIsActive('/friends', pathname)
      const onMore = moreMenuIsActive(pathname)

      if (groupId) {
        const seen: {
          pulse?: string
          decision?: string
          tab?: string
          vault?: string
        } = {}
        if (onPulse) seen.pulse = fpPulse
        if (onDecide) seen.decision = fpPolls
        if (onTab) seen.tab = fpTab
        if (onVault) seen.vault = fpVault
        if (Object.keys(seen).length > 0) {
          markNavTabsSeen(groupId, seen)
        }
      }
      if (onFriends) {
        markFriendsSeen(fpFriends)
      }

      const ack = groupId ? loadGroupAck(groupId) : {}
      const ackFriends = getFriendsAck()

      const pollActivity = hasActivePolls(polls)
      const tabActivity = tabHasUnsettled(tab)
      const pulseActivity = pollActivity || tabActivity

      setBadges({
        '/':
          !!groupId &&
          !onPulse &&
          isUnseenSinceAck(ack.pulse, fpPulse, pulseActivity),
        '/decision':
          !!groupId &&
          !onDecide &&
          isUnseenSinceAck(ack.decision, fpPolls, pollActivity),
        '/tab':
          !!groupId && !onTab && isUnseenSinceAck(ack.tab, fpTab, tabActivity),
        '/vault':
          !!groupId &&
          !onVault &&
          isUnseenSinceAck(ack.vault, fpVault, vaultItems.length > 0),
        '/friends':
          !onFriends &&
          isUnseenSinceAck(ackFriends || undefined, fpFriends, incoming.length > 0),
        '/groups': false,
        more:
          !onMore &&
          isUnseenSinceAck(ackFriends || undefined, fpFriends, incoming.length > 0),
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
    if (!activeGroupId) {
      syncClientRef.current?.disconnect()
      syncClientRef.current = null
      return
    }

    const client = new GroupSyncClient()
    syncClientRef.current = client

    client
      .connect(activeGroupId, {
        onActivity: () => {
          void refresh()
        },
      })
      .catch(() => {
        /* focus/interval still refresh */
      })

    return () => {
      client.disconnect()
      if (syncClientRef.current === client) {
        syncClientRef.current = null
      }
    }
  }, [activeGroupId, refresh])

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
