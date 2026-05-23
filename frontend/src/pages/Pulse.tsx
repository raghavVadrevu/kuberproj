import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAuthSession } from 'aws-amplify/auth'
import {
  Sparkles,
  Clock,
  ChevronRight,
  Pizza,
  Beer,
  Car,
  Home,
  ShoppingBag,
  Utensils,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

import { PageLoader } from '@/components/ui/page-loader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ACTIVE_GROUP_STORAGE_KEY,
  apiJson,
  type ExpenseOutDto,
  type GroupDto,
  type PollDto,
  type TabMemberLiteDto,
  type PulseTldrDto,
  type TabOverviewDto,
} from '@/lib/api'
import { getUserErrorMessage } from '@/lib/user-errors'

const categoryIcons: Record<string, React.ElementType> = {
  food: Pizza,
  drinks: Beer,
  transport: Car,
  lodging: Home,
  shopping: ShoppingBag,
  dining: Utensils,
  other: Utensils,
}

const POLL_BAR_COLORS = [
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-sky-500',
  'bg-orange-500',
]

function subMonogram(sub: string): string {
  const alnum = sub.replace(/[^a-zA-Z0-9]/g, '')
  if (alnum.length >= 2) return alnum.slice(0, 2).toUpperCase()
  return sub.slice(0, 2).toUpperCase()
}

function initialsFromName(name: string | null | undefined, sub: string): string {
  if (name?.trim()) {
    const p = name.trim().split(/\s+/)
    if (p.length >= 2) return (p[0]![0] + p[1]![0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  return subMonogram(sub)
}

export default function PulsePage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [groupsList, setGroupsList] = useState<GroupDto[]>([])
  const [groupId, setGroupId] = useState<string | null>(null)
  const [polls, setPolls] = useState<PollDto[]>([])
  const [tabOverview, setTabOverview] = useState<TabOverviewDto | null>(null)
  const [tldr, setTldr] = useState<string | null>(null)
  const [tldrLoading, setTldrLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPulse = useCallback(async () => {
    setError(null)
    const session = await fetchAuthSession()
    const token = session.tokens?.idToken?.toString()
    if (!token) {
      setSignedIn(false)
      setGroupsList([])
      setGroupId(null)
      setPolls([])
      setTabOverview(null)
      setTldr(null)
      return
    }
    setSignedIn(true)
    setLoading(true)
    setTldrLoading(true)
    setTldr(null)
    try {
      const groups = await apiJson<GroupDto[]>('/groups')
      setGroupsList(groups)
      const stored = localStorage.getItem(ACTIVE_GROUP_STORAGE_KEY)
      const gid =
        (stored && groups.some((g) => g.id === stored) && stored) || groups[0]?.id || null
      setGroupId(gid ?? null)
      if (!gid) {
        setPolls([])
        setTabOverview(null)
        setTldr(null)
        return
      }
      const [pollData, tabData, tldrData] = await Promise.all([
        apiJson<PollDto[]>(`/groups/${gid}/polls`),
        apiJson<TabOverviewDto>(`/groups/${gid}/tab`),
        apiJson<PulseTldrDto>(`/groups/${gid}/pulse/tldr`),
      ])
      setPolls(pollData.filter((p) => p.status === 'active'))
      setTabOverview(tabData)
      setTldr(tldrData.tldr)
    } catch (e) {
      setError(getUserErrorMessage(e, "Couldn't load your pulse. Try again."))
      setPolls([])
      setTabOverview(null)
      setTldr(null)
    } finally {
      setLoading(false)
      setTldrLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPulse()
  }, [loadPulse])

  const members: TabMemberLiteDto[] = tabOverview?.members ?? []

  const activePolls = polls

  const recentExpenses = useMemo(() => {
    if (!tabOverview) return []
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    return [...tabOverview.expenses]
      .filter((e) => new Date(e.created_at).getTime() >= cutoff)
      .slice(0, 6)
  }, [tabOverview])

  const synthesis = useMemo(() => {
    if (!signedIn) {
      return 'Sign in to see live polls, expenses, and balances for your active group.'
    }
    if (!groupId) {
      return 'Create or join a group to see proposals and shared tabs here.'
    }
    if (error) {
      return error
    }
    if (tldrLoading) {
      return null
    }
    return tldr
  }, [signedIn, groupId, error, tldr, tldrLoading])

  const groupLabel = useMemo(() => {
    if (!groupId) return null
    return groupsList.find((g) => g.id === groupId)?.name ?? 'Your group'
  }, [groupId, groupsList])

  if (signedIn && loading && !error) {
    return <PageLoader label="Loading your pulse…" />
  }

  return (
    <div className="space-y-6 py-4 lg:py-6">
      {/* AI Synthesis Card */}
      <Card className="glass relative overflow-hidden border-primary/20">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <CardHeader className="relative pb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium text-muted-foreground">Pulse</CardTitle>
            {groupLabel ? (
              <Badge variant="outline" className="ml-auto text-[11px]">
                {groupLabel}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="relative">
          <p className="leading-relaxed text-foreground">
            <span className="font-semibold text-primary">TL;DR:</span>{' '}
            {synthesis === null ? (
              <span className="text-muted-foreground animate-pulse">huddle is catching up…</span>
            ) : (
              synthesis
            )}
          </p>
          {members.length > 0 ? (
            <div className="mt-4 flex items-center gap-2">
              <div className="flex -space-x-2">
                {members.slice(0, 6).map((m) => (
                  <Avatar key={m.user_sub} className="h-7 w-7 border-2 border-card">
                    <AvatarFallback className="bg-secondary text-[11px]">
                      {initialsFromName(m.display_name, m.user_sub)}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                {members.length} member{members.length === 1 ? '' : 's'} in this group
              </span>
            </div>
          ) : null}
          {!signedIn ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" asChild>
                <Link to="/login">Log in</Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link to="/signup">Sign up</Link>
              </Button>
            </div>
          ) : null}
          {signedIn && !groupId ? (
            <Button className="mt-4" size="sm" asChild>
              <Link to="/groups">Create a group</Link>
            </Button>
          ) : null}
          {signedIn && groupId ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link to="/decision">Open Decide</Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link to="/tab">Open Tab</Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Active polls (ranked-choice) */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Active proposals</h2>
          <Badge variant="secondary" className="text-xs">
            {loading ? '…' : `${activePolls.length} open`}
          </Badge>
        </div>
        {!signedIn ? (
          <Card className="bg-card/50">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Log in to see polls for your group.
            </CardContent>
          </Card>
        ) : !groupId ? (
          <Card className="bg-card/50">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Join a group to see active polls.{' '}
              <Link to="/groups" className="text-primary underline-offset-4 hover:underline">
                Go to Groups
              </Link>
            </CardContent>
          </Card>
        ) : activePolls.length === 0 ? (
          <Card className="bg-card/50">
            <CardContent className="p-4 text-sm text-muted-foreground">
              No active polls.{' '}
              <Link to="/decision" className="text-primary underline-offset-4 hover:underline">
                Create one in Decide
              </Link>
              .
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {activePolls.slice(0, 5).map((proposal) => {
              const totalFirst = proposal.options.reduce((s, o) => s + o.first_choice_votes, 0)
              const voted = !!proposal.my_ranking?.length
              return (
                <Link key={proposal.id} to="/decision" className="block">
                  <Card className="group cursor-pointer bg-card/50 transition-colors hover:bg-card/80">
                    <CardContent className="p-4">
                      <div className="mb-3 flex items-start justify-between">
                        <div className="min-w-0 flex-1 pr-4">
                          <h3 className="truncate font-medium">{proposal.title}</h3>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {proposal.vote_count} vote{proposal.vote_count === 1 ? '' : 's'} ·{' '}
                            {proposal.options.length} options
                            {voted ? (
                              <span className="text-emerald-600 dark:text-emerald-400"> · You voted</span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400"> · Your vote pending</span>
                            )}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          <span className="text-xs">
                            {formatDistanceToNow(new Date(proposal.created_at), { addSuffix: true })}
                          </span>
                          <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                      </div>

                      {totalFirst === 0 ? (
                        <div className="h-2 rounded-full bg-secondary" />
                      ) : (
                        <div className="h-2 overflow-hidden rounded-full bg-secondary">
                          <div className="flex h-full w-full">
                            {proposal.options.map((opt, i) => {
                              const pct = (opt.first_choice_votes / totalFirst) * 100
                              if (pct <= 0) return null
                              return (
                                <div
                                  key={opt.id}
                                  className={cn(POLL_BAR_COLORS[i % POLL_BAR_COLORS.length], 'min-w-0')}
                                  style={{ width: `${pct}%` }}
                                  title={`${opt.label}: ${opt.first_choice_votes}`}
                                />
                              )
                            })}
                          </div>
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {proposal.options.slice(0, 4).map((opt, i) => (
                          <span key={opt.id} className="flex items-center gap-1">
                            <span
                              className={cn(
                                'h-1.5 w-1.5 shrink-0 rounded-full',
                                POLL_BAR_COLORS[i % POLL_BAR_COLORS.length],
                              )}
                            />
                            <span className="truncate">{opt.label}</span>
                            <span className="tabular-nums">({opt.first_choice_votes})</span>
                          </span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* Recent tabs (expenses) */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent tabs</h2>
          <span className="text-xs text-muted-foreground">Last 7 days</span>
        </div>
        {!signedIn ? (
          <Card className="bg-card/50">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Log in to see shared expenses.
            </CardContent>
          </Card>
        ) : !groupId ? (
          <Card className="bg-card/50">
            <CardContent className="p-4 text-sm text-muted-foreground">
              No group selected.
            </CardContent>
          </Card>
        ) : recentExpenses.length === 0 ? (
          <Card className="bg-card/50">
            <CardContent className="p-4 text-sm text-muted-foreground">
              No expenses in the last week.{' '}
              <Link to="/tab" className="text-primary underline-offset-4 hover:underline">
                Add one in Tab
              </Link>
              .
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentExpenses.map((tab: ExpenseOutDto) => {
              const Icon = categoryIcons[tab.category] ?? Utensils
              return (
                <Link key={tab.id} to="/tab" className="block">
                  <Card className="bg-card/50 transition-colors hover:bg-card/80">
                    <CardContent className="flex items-center gap-3 p-3">
                      <div
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                          tab.settled ? 'bg-secondary' : 'bg-primary/10',
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-5 w-5',
                            tab.settled ? 'text-muted-foreground' : 'text-primary',
                          )}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{tab.description}</p>
                          {!tab.settled ? (
                            <Badge variant="outline" className="shrink-0 text-[11px]">
                              Pending
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {(tab.paid_by_display_name ?? subMonogram(tab.paid_by_sub)) + ' paid'} ·{' '}
                          {formatDistanceToNow(new Date(tab.created_at), { addSuffix: true })} · split{' '}
                          {tab.participant_count} way{tab.participant_count === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold">${tab.amount.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">${tab.share_amount.toFixed(2)}/person</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-50" />
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
