import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus,
  ChevronDown,
  ChevronUp,
  Clock,
  Users,
  Calendar,
  Check,
  ArrowUp,
  ArrowDown,
  Trash2,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

import { PageLoader } from '@/components/ui/page-loader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UserAvatar } from '@/components/UserAvatar'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { refreshNavBadges } from '@/contexts/NavBadgesContext'
import {
  ACTIVE_GROUP_STORAGE_KEY,
  apiJson,
  type AvailabilityDto,
  type GroupDto,
  type GroupMemberDto,
  type GroupDetailDto,
  type PollDto,
  type UserProfileDto,
} from '@/lib/api'
import {
  AVAILABILITY_SLOTS,
  availabilityQuery,
  makeSlotKey,
  parseSlotKey,
} from '@/lib/availability-week'
import { toastUserError } from '@/lib/user-errors'

function subMonogram(sub: string): string {
  const alnum = sub.replace(/[^a-zA-Z0-9]/g, '')
  if (alnum.length >= 2) return alnum.slice(0, 2).toUpperCase()
  return sub.slice(0, 2).toUpperCase()
}

function defaultOptionOrder(poll: PollDto): string[] {
  return [...poll.options]
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
    .map((o) => o.id)
}

function getIntensityClass(count: number) {
  if (count === 0) return 'bg-secondary'
  if (count <= 2) return 'bg-indigo-900/50'
  if (count <= 4) return 'bg-indigo-800/60'
  if (count <= 6) return 'bg-indigo-700/70'
  if (count <= 8) return 'bg-indigo-600/80'
  return 'bg-indigo-500/90'
}

export default function DecisionPage() {
  const [polls, setPolls] = useState<PollDto[]>([])
  const [availability, setAvailability] = useState<AvailabilityDto | null>(null)
  const [loadingPolls, setLoadingPolls] = useState(true)
  const [loadingAvail, setLoadingAvail] = useState(true)
  const [expandedPollId, setExpandedPollId] = useState<string | null>(null)
  const [rankOverride, setRankOverride] = useState<Record<string, string[]>>({})
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newOptions, setNewOptions] = useState<string[]>(['', ''])
  const [savingAvail, setSavingAvail] = useState(false)
  const [votingId, setVotingId] = useState<string | null>(null)
  const [groupsList, setGroupsList] = useState<GroupDto[]>([])
  const [groupMembers, setGroupMembers] = useState<GroupMemberDto[]>([])
  const [groupId, setGroupId] = useState<string | null>(null)
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [activeTab, setActiveTab] = useState<'polls' | 'heatmap'>('polls')
  const [meSub, setMeSub] = useState<string | null>(null)

  const loadGroups = useCallback(async () => {
    setLoadingGroups(true)
    try {
      const [data, me] = await Promise.all([
        apiJson<GroupDto[]>('/groups'),
        apiJson<UserProfileDto>('/me'),
      ])
      setMeSub(me.sub)
      setGroupsList(data)
      const stored = localStorage.getItem(ACTIVE_GROUP_STORAGE_KEY)
      const pick =
        (stored && data.some((g) => g.id === stored) && stored) ||
        (data[0]?.id ?? null)
      setGroupId(pick)
      if (pick && pick !== stored) {
        localStorage.setItem(ACTIVE_GROUP_STORAGE_KEY, pick)
      }
    } catch (e) {
      toastUserError(e, "Couldn't load your groups. Try again.")
      setGroupId(null)
    } finally {
      setLoadingGroups(false)
    }
  }, [])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  useEffect(() => {
    setActiveTab('polls')
  }, [groupId])

  const loadPolls = useCallback(async () => {
    if (!groupId) {
      setPolls([])
      setLoadingPolls(false)
      return
    }
    setLoadingPolls(true)
    try {
      const data = await apiJson<PollDto[]>(`/groups/${groupId}/polls`)
      setPolls(data)
    } catch (e) {
      toastUserError(e, "Couldn't load polls. Try again.")
    } finally {
      setLoadingPolls(false)
    }
  }, [groupId])

  const loadGroupMembers = useCallback(async () => {
    if (!groupId) {
      setGroupMembers([])
      return
    }
    try {
      const detail = await apiJson<GroupDetailDto>(`/groups/${groupId}`)
      setGroupMembers(detail.members)
    } catch {
      setGroupMembers([])
    }
  }, [groupId])

  const memberPictureBySub = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const m of groupMembers) {
      map.set(m.user_sub, m.picture_url ?? null)
    }
    return map
  }, [groupMembers])

  const loadAvailability = useCallback(async () => {
    if (!groupId) {
      setAvailability(null)
      setLoadingAvail(false)
      return
    }
    setLoadingAvail(true)
    setAvailability(null)
    try {
      const data = await apiJson<AvailabilityDto>(
        `/groups/${groupId}/availability?${availabilityQuery()}`,
      )
      setAvailability(data)
      setSelectedSlots(new Set(data.mine))
    } catch (e) {
      toastUserError(e, "Couldn't load everyone's availability. Try again.")
    } finally {
      setLoadingAvail(false)
    }
  }, [groupId])

  useEffect(() => {
    void loadGroupMembers()
  }, [loadGroupMembers])

  useEffect(() => {
    void loadPolls()
  }, [loadPolls])

  useEffect(() => {
    if (!groupId || activeTab !== 'heatmap') return
    void loadAvailability()
  }, [groupId, activeTab, loadAvailability])

  const toggleSlot = (day: string, slot: string) => {
    const key = makeSlotKey(day, slot)
    setSelectedSlots((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const rankingFor = (poll: PollDto): string[] => {
    const o = rankOverride[poll.id]
    if (o?.length) return o
    if (poll.my_ranking?.length) return poll.my_ranking
    return defaultOptionOrder(poll)
  }

  const moveRank = (poll: PollDto, index: number, dir: -1 | 1) => {
    const order = [...rankingFor(poll)]
    const j = index + dir
    if (j < 0 || j >= order.length) return
    ;[order[index], order[j]] = [order[j], order[index]]
    setRankOverride((prev) => ({ ...prev, [poll.id]: order }))
  }

  const submitVote = async (poll: PollDto) => {
    if (!groupId) return
    setVotingId(poll.id)
    try {
      const updated = await apiJson<PollDto>(`/groups/${groupId}/polls/${poll.id}/vote`, {
        method: 'POST',
        body: JSON.stringify({ ranked_option_ids: rankingFor(poll) }),
      })
      setPolls((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      setRankOverride((prev) => {
        const next = { ...prev }
        delete next[poll.id]
        return next
      })
      toast.success('Vote saved')
      refreshNavBadges()
    } catch (e) {
      toastUserError(e, "Couldn't save your vote. Try again.")
    } finally {
      setVotingId(null)
    }
  }

  const deletePoll = async (pollId: string) => {
    if (!groupId) return
    try {
      await apiJson(`/groups/${groupId}/polls/${pollId}`, { method: 'DELETE' })
      setPolls((prev) => prev.filter((p) => p.id !== pollId))
      if (expandedPollId === pollId) setExpandedPollId(null)
      toast.success('Poll deleted')
      refreshNavBadges()
    } catch (e) {
      toastUserError(e, "Couldn't delete that poll. Try again.")
    }
  }

  const saveAvailability = async () => {
    if (!groupId) return
    setSavingAvail(true)
    try {
      const slots = [...selectedSlots].map((key) => parseSlotKey(key))
      const data = await apiJson<AvailabilityDto>(
        `/groups/${groupId}/availability?${availabilityQuery()}`,
        {
          method: 'PUT',
          body: JSON.stringify({ slots }),
        },
      )
      setAvailability(data)
      setSelectedSlots(new Set(data.mine))
      toast.success('Availability saved')
    } catch (e) {
      toastUserError(e, "Couldn't save your availability. Try again.")
    } finally {
      setSavingAvail(false)
    }
  }

  const addCreateOption = () => {
    setNewOptions((o) => [...o, ''])
  }

  const removeCreateOption = (i: number) => {
    setNewOptions((o) => (o.length <= 2 ? o : o.filter((_, idx) => idx !== i)))
  }

  const createPoll = async () => {
    if (!groupId) return
    const opts = newOptions.map((s) => s.trim()).filter(Boolean)
    if (!newTitle.trim()) {
      toast.error('Enter a title')
      return
    }
    if (opts.length < 2) {
      toast.error('Add at least two options')
      return
    }
    try {
      const created = await apiJson<PollDto>(`/groups/${groupId}/polls`, {
        method: 'POST',
        body: JSON.stringify({ title: newTitle.trim(), options: opts }),
      })
      setPolls((prev) => [created, ...prev])
      setCreateOpen(false)
      setNewTitle('')
      setNewOptions(['', ''])
      setExpandedPollId(created.id)
      toast.success('Poll created')
    } catch (e) {
      toastUserError(e, "Couldn't create that poll. Try again.")
    }
  }

  const weekDays = availability?.days ?? []

  const dayLabelByDate = useMemo(() => {
    const map = new Map<string, string>()
    for (const d of weekDays) {
      map.set(d.date, d.label)
    }
    return map
  }, [weekDays])

  const bestSlot = useMemo(() => {
    if (!availability) return null
    let best: {
      day: string
      dayLabel: string
      slot: string
      count: number
      members: string[]
    } | null = null
    for (const { date } of weekDays) {
      for (const slot of AVAILABILITY_SLOTS) {
        const cell = availability.heatmap[date]?.[slot]
        const c = cell?.count ?? 0
        if (!best || c > best.count) {
          best = {
            day: date,
            dayLabel: dayLabelByDate.get(date) ?? date,
            slot,
            count: c,
            members: cell?.members ?? [],
          }
        }
      }
    }
    return best
  }, [availability, weekDays, dayLabelByDate])

  return (
    <div className="py-4 space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Group</CardTitle>
          <CardDescription>
            Polls and availability are scoped to the group you select.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loadingGroups ? (
            <PageLoader label="Loading groups…" variant="inline" />
          ) : groupsList.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You are not in any group yet.{' '}
              <Link to="/groups" className="text-primary underline-offset-4 hover:underline">
                Create or open a group
              </Link>
              , then pick it here.
            </p>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Label className="shrink-0 text-muted-foreground sm:w-24">Active group</Label>
              <Select
                value={groupId ?? undefined}
                onValueChange={(v) => {
                  setGroupId(v)
                  localStorage.setItem(ACTIVE_GROUP_STORAGE_KEY, v)
                  setExpandedPollId(null)
                }}
              >
                <SelectTrigger className="w-full sm:max-w-md">
                  <SelectValue placeholder="Choose a group" />
                </SelectTrigger>
                <SelectContent>
                  {groupsList.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name} ({g.member_count} members)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {groupId ? (
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'polls' | 'heatmap')}
        className="flex flex-1 flex-col"
      >
        <TabsList className="grid max-w-xs w-full grid-cols-2">
          <TabsTrigger value="polls">Polls</TabsTrigger>
          <TabsTrigger value="heatmap">Availability</TabsTrigger>
        </TabsList>

        <TabsContent value="polls" className="mt-0 flex-1">
          <div className="space-y-4 py-4">
            {loadingPolls ? (
              <PageLoader label="Loading polls…" variant="inline" />
            ) : polls.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No polls yet. Tap + to create one.
              </p>
            ) : null}

            {polls.map((proposal) => {
              const isExpanded = expandedPollId === proposal.id
              const orderIds = rankingFor(proposal)
              return (
                <Card
                  key={proposal.id}
                  className={cn(
                    'transition-all duration-200',
                    proposal.status === 'closed' && 'opacity-60',
                  )}
                >
                  <CardHeader
                    className="cursor-pointer p-4"
                    onClick={() =>
                      setExpandedPollId(isExpanded ? null : proposal.id)
                    }
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <Badge
                            variant={
                              proposal.status === 'active' ? 'default' : 'secondary'
                            }
                            className="text-[11px]"
                          >
                            {proposal.status === 'active' ? 'Active' : 'Closed'}
                          </Badge>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(proposal.created_at), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                        <CardTitle className="text-base">{proposal.title}</CardTitle>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" />
                          {proposal.vote_count} voted
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {meSub === proposal.created_by ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this poll?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This removes the poll and all votes permanently.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => void deletePoll(proposal.id)}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : null}
                        <Button variant="ghost" size="icon" className="h-8 w-8" type="button">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  {isExpanded ? (
                    <CardContent className="px-4 pb-4 pt-0">
                      <div className="border-t border-border pt-4">
                        <p className="mb-3 text-sm text-muted-foreground">
                          Rank options (best at top). First-choice tallies update as people vote.
                        </p>
                        <div className="space-y-2">
                          {orderIds.map((oid, index) => {
                            const opt = proposal.options.find((o) => o.id === oid)
                            if (!opt) return null
                            return (
                              <div
                                key={oid}
                                className={cn(
                                  'flex items-center gap-2 rounded-lg border p-3 transition-colors',
                                  index === 0
                                    ? 'border-primary/50 bg-primary/5'
                                    : 'border-border bg-secondary/30',
                                )}
                              >
                                <div className="flex flex-col gap-0.5">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={index === 0}
                                    onClick={() => moveRank(proposal, index, -1)}
                                  >
                                    <ArrowUp className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={index === orderIds.length - 1}
                                    onClick={() => moveRank(proposal, index, 1)}
                                  >
                                    <ArrowDown className="h-4 w-4" />
                                  </Button>
                                </div>
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                                  {index + 1}
                                </span>
                                <span className="flex-1 text-sm">{opt.label}</span>
                                <Badge variant="outline" className="text-[11px] tabular-nums">
                                  {opt.first_choice_votes} 1st
                                </Badge>
                                {index === 0 ? (
                                  <Badge
                                    variant="outline"
                                    className="border-primary/50 text-[11px] text-primary"
                                  >
                                    Top choice
                                  </Badge>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                        {proposal.status === 'active' ? (
                          <Button
                            className="mt-4 w-full"
                            size="sm"
                            type="button"
                            disabled={votingId === proposal.id}
                            onClick={() => void submitVote(proposal)}
                          >
                            <Check className="mr-2 h-4 w-4" />
                            {votingId === proposal.id ? 'Saving…' : 'Submit vote'}
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  ) : null}
                </Card>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="heatmap" className="mt-0 flex-1">
          <div className="py-4">
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Calendar className="h-4 w-4" />
                      This week&apos;s availability
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Tap cells for when you&apos;re free. Darker cells mean more people are free.
                      Resets every Sunday at midnight.
                    </p>
                  </div>
                  <Badge variant="secondary">{selectedSlots.size} selected</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {loadingAvail || !availability ? (
                  <PageLoader label="Loading availability…" variant="inline" />
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <div className="min-w-[400px]">
                        <div className="mb-1 grid grid-cols-8 gap-1">
                          <div className="h-8" />
                          {weekDays.map((day) => (
                            <div
                              key={day.date}
                              className="flex h-8 items-center justify-center text-center text-[10px] font-medium leading-tight text-muted-foreground sm:text-xs"
                            >
                              {day.label}
                            </div>
                          ))}
                        </div>

                        {AVAILABILITY_SLOTS.map((slot) => (
                          <div key={slot} className="mb-1 grid grid-cols-8 gap-1">
                            <div className="flex h-12 items-center justify-end pr-2 text-xs text-muted-foreground">
                              {slot}
                            </div>
                            {weekDays.map((day) => {
                              const cell = availability.heatmap[day.date]?.[slot]
                              const count = cell?.count ?? 0
                              const isSelected = selectedSlots.has(makeSlotKey(day.date, slot))
                              return (
                                <button
                                  key={`${day.date}-${slot}`}
                                  type="button"
                                  onClick={() => toggleSlot(day.date, slot)}
                                  className={cn(
                                    'relative h-12 rounded-lg transition-all duration-200 group',
                                    getIntensityClass(count),
                                    isSelected &&
                                      'ring-2 ring-primary ring-offset-2 ring-offset-background',
                                  )}
                                >
                                  <span className="absolute inset-0 flex items-center justify-center text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100">
                                    {count}
                                  </span>
                                  {isSelected ? (
                                    <Check className="absolute right-1 top-1 h-4 w-4 text-primary" />
                                  ) : null}
                                </button>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <span>Less</span>
                      <div className="flex gap-1">
                        {[0, 2, 4, 6, 8, 10].map((i) => (
                          <div
                            key={i}
                            className={cn('h-4 w-4 rounded', getIntensityClass(i))}
                          />
                        ))}
                      </div>
                      <span>More</span>
                    </div>

                    {bestSlot && bestSlot.count > 0 ? (
                      <div className="mt-6 rounded-lg bg-secondary/30 p-3">
                        <p className="mb-2 text-xs text-muted-foreground">
                          Best overlap: {bestSlot.dayLabel} {bestSlot.slot} ({bestSlot.count}{' '}
                          available)
                        </p>
                        <div className="flex -space-x-2">
                          {bestSlot.members.slice(0, 12).map((sub) => (
                            <UserAvatar
                              key={sub}
                              className="h-7 w-7 border-2 border-card"
                              fallbackClassName="bg-indigo-500/50 text-[11px]"
                              pictureUrl={memberPictureBySub.get(sub)}
                              userSub={sub}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>

            <Button
              className="w-full"
              variant="outline"
              type="button"
              disabled={savingAvail}
              onClick={() => void saveAvailability()}
            >
              {savingAvail ? 'Saving…' : 'Save my availability'}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
      ) : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New poll</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="poll-title">Question</Label>
              <Input
                id="poll-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Where should we go?"
              />
            </div>
            <div className="space-y-2">
              <Label>Options</Label>
              <div className="space-y-2">
                {newOptions.map((val, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={val}
                      onChange={(e) =>
                        setNewOptions((opts) =>
                          opts.map((v, j) => (j === i ? e.target.value : v)),
                        )
                      }
                      placeholder={`Option ${i + 1}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={newOptions.length <= 2}
                      onClick={() => removeCreateOption(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addCreateOption}>
                Add option
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void createPoll()}>
              Create poll
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button
        type="button"
        className="glow-primary fixed bottom-20 right-4 h-14 w-14 rounded-full shadow-lg lg:bottom-6 lg:right-6"
        size="icon"
        disabled={!groupId}
        onClick={() => setCreateOpen(true)}
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  )
}
