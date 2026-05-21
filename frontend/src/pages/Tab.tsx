import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Pizza,
  Beer,
  Car,
  Home,
  ShoppingBag,
  Utensils,
  Check,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { refreshNavBadges } from '@/contexts/NavBadgesContext'
import { formatRupees, RUPEE_SYMBOL } from '@/lib/currency'
import {
  ACTIVE_GROUP_STORAGE_KEY,
  apiJson,
  type GroupDto,
  type TabOverviewDto,
} from '@/lib/api'

const categoryIcons: Record<string, React.ElementType> = {
  food: Pizza,
  drinks: Beer,
  transport: Car,
  lodging: Home,
  shopping: ShoppingBag,
  dining: Utensils,
  other: Utensils,
}

const CATEGORY_OPTIONS = [
  { value: 'food', label: 'Food' },
  { value: 'drinks', label: 'Drinks' },
  { value: 'transport', label: 'Transport' },
  { value: 'lodging', label: 'Lodging' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'dining', label: 'Dining' },
  { value: 'other', label: 'Other' },
] as const

function subMonogram(sub: string): string {
  const alnum = sub.replace(/[^a-zA-Z0-9]/g, '')
  if (alnum.length >= 2) return alnum.slice(0, 2).toUpperCase()
  return sub.slice(0, 2).toUpperCase()
}

export default function TabPage() {
  const [groupsList, setGroupsList] = useState<GroupDto[]>([])
  const [groupId, setGroupId] = useState<string | null>(null)
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [overview, setOverview] = useState<TabOverviewDto | null>(null)
  const [loadingTab, setLoadingTab] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [description, setDescription] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [category, setCategory] = useState<string>('food')
  const [splitEveryone, setSplitEveryone] = useState(true)
  const [participantPick, setParticipantPick] = useState<Set<string>>(new Set())
  const [paidBySub, setPaidBySub] = useState<string | null>(null)

  const loadGroups = useCallback(async () => {
    setLoadingGroups(true)
    try {
      const data = await apiJson<GroupDto[]>('/groups')
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
      toast.error(e instanceof Error ? e.message : 'Could not load groups')
      setGroupId(null)
    } finally {
      setLoadingGroups(false)
    }
  }, [])

  const loadTab = useCallback(async () => {
    if (!groupId) {
      setOverview(null)
      setLoadingTab(false)
      return
    }
    setLoadingTab(true)
    try {
      const data = await apiJson<TabOverviewDto>(`/groups/${groupId}/tab`)
      setOverview(data)
      setPaidBySub((prev) => {
        if (prev && data.members.some((m) => m.user_sub === prev)) return prev
        return data.viewer_sub
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load tab')
      setOverview(null)
    } finally {
      setLoadingTab(false)
    }
  }, [groupId])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  useEffect(() => {
    void loadTab()
  }, [loadTab])

  const resetDrawer = () => {
    setDescription('')
    setAmountStr('')
    setCategory('food')
    setSplitEveryone(true)
    setParticipantPick(new Set())
  }

  const toggleParticipant = (sub: string) => {
    if (splitEveryone) return
    const payer = paidBySub ?? overview?.viewer_sub ?? ''
    setParticipantPick((prev) => {
      const next = new Set(prev)
      if (next.has(sub)) {
        if (next.size <= 2) return prev
        if (sub === payer) return prev
        next.delete(sub)
      } else {
        next.add(sub)
      }
      return next
    })
  }

  const addExpense = async () => {
    if (!groupId || !overview) return
    const amt = Number.parseFloat(amountStr)
    if (!description.trim()) {
      toast.error('Add a description')
      return
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    const payer = paidBySub ?? overview.viewer_sub
    const parts = splitEveryone
      ? overview.members.map((m) => m.user_sub)
      : [...participantPick]
    if (!splitEveryone && parts.length < 2) {
      toast.error('Select at least two people')
      return
    }
    if (!parts.includes(payer)) {
      toast.error('Payer must be included in the split')
      return
    }

    setSaving(true)
    try {
      const data = await apiJson<TabOverviewDto>(`/groups/${groupId}/tab/expenses`, {
        method: 'POST',
        body: JSON.stringify({
          description: description.trim(),
          amount: amt,
          category,
          split_all: splitEveryone,
          participant_subs: splitEveryone ? [] : parts,
          paid_by_sub: payer,
        }),
      })
      setOverview(data)
      setDrawerOpen(false)
      resetDrawer()
      toast.success('Expense added')
      refreshNavBadges()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add expense')
    } finally {
      setSaving(false)
    }
  }

  const settleExpense = async (expenseId: string) => {
    if (!groupId) return
    try {
      const data = await apiJson<TabOverviewDto>(
        `/groups/${groupId}/tab/expenses/${expenseId}/settle`,
        { method: 'POST' },
      )
      setOverview(data)
      toast.success('Marked settled')
      refreshNavBadges()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not settle')
    }
  }

  const myNet = overview?.my_net ?? 0
  const isOwed = myNet > 0.005
  const isOwe = myNet < -0.005

  const pendingCount = useMemo(
    () => overview?.expenses.filter((e) => !e.settled).length ?? 0,
    [overview],
  )

  return (
    <>
      <div className="space-y-6 py-4 lg:py-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Group</CardTitle>
            <CardDescription>Expenses and balances are shared per group.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadingGroups ? (
              <p className="text-sm text-muted-foreground">Loading groups…</p>
            ) : groupsList.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Join a group first —{' '}
                <Link to="/groups" className="text-primary underline-offset-4 hover:underline">
                  open Groups
                </Link>
                .
              </p>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Label className="w-24 shrink-0 text-muted-foreground">Active group</Label>
                <Select
                  value={groupId ?? undefined}
                  onValueChange={(v) => {
                    setGroupId(v)
                    localStorage.setItem(ACTIVE_GROUP_STORAGE_KEY, v)
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

        {!groupId ? null : loadingTab && !overview ? (
          <p className="text-sm text-muted-foreground">Loading tab…</p>
        ) : overview ? (
          <>
            <Card
              className={cn(
                'relative overflow-hidden',
                isOwed && 'border-emerald-500/30',
                isOwe && 'border-rose-500/30',
                !isOwed && !isOwe && 'border-border',
              )}
            >
              <div
                className={cn(
                  'absolute inset-0',
                  isOwed && 'bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent',
                  isOwe && 'bg-gradient-to-br from-rose-500/10 via-transparent to-transparent',
                )}
              />
              <CardContent className="relative pb-4 pt-6">
                <div className="text-center">
                  <p className="mb-1 text-sm text-muted-foreground">Your net (unsettled)</p>
                  <div className="flex items-center justify-center gap-2">
                    <div
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-full',
                        isOwed && 'bg-emerald-500/20',
                        isOwe && 'bg-rose-500/20',
                        !isOwed && !isOwe && 'bg-secondary',
                      )}
                    >
                      {isOwed ? (
                        <ArrowDownLeft className="h-5 w-5 text-emerald-500" />
                      ) : isOwe ? (
                        <ArrowUpRight className="h-5 w-5 text-rose-500" />
                      ) : (
                        <Check className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p
                        className={cn(
                          'text-3xl font-bold',
                          isOwed && 'text-emerald-500',
                          isOwe && 'text-rose-500',
                          !isOwed && !isOwe && 'text-muted-foreground',
                        )}
                      >
                        {formatRupees(Math.abs(myNet))}
                      </p>
                      <p
                        className={cn(
                          'text-sm font-medium',
                          isOwed && 'text-emerald-500/80',
                          isOwe && 'text-rose-500/80',
                          !isOwed && !isOwe && 'text-muted-foreground',
                        )}
                      >
                        {isOwed ? 'You are owed' : isOwe ? 'You owe' : 'All settled up'}
                      </p>
                    </div>
                  </div>
                </div>

                {overview.balances.length > 0 ? (
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {overview.balances.slice(0, 6).map((person) => (
                      <div
                        key={person.user_sub}
                        className={cn(
                          'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs',
                          person.net > 0
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : 'bg-rose-500/10 text-rose-500',
                        )}
                      >
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[9px]">
                            {(person.display_name ?? person.user_sub).slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span>
                          {person.display_name ?? subMonogram(person.user_sub)}:{' '}
                          {person.net > 0 ? '+' : person.net < 0 ? '−' : ''}
                          {formatRupees(Math.abs(person.net), {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                size="sm"
                type="button"
                disabled={!overview.balances.length}
                onClick={() => toast.info('Settle up is coming soon — mark individual expenses settled for now.')}
              >
                Settle up
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                size="sm"
                type="button"
                onClick={() => toast.info('Requests coming soon.')}
              >
                Request
              </Button>
            </div>

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Expenses</h2>
                <Badge variant="secondary" className="text-xs">
                  {pendingCount} pending
                </Badge>
              </div>
              <div className="space-y-2">
                {overview.expenses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No expenses yet. Tap + to add one.</p>
                ) : (
                  overview.expenses.map((transaction) => {
                    const Icon = categoryIcons[transaction.category] ?? Utensils
                    return (
                      <Card
                        key={transaction.id}
                        className={cn('transition-all', transaction.settled && 'opacity-60')}
                      >
                        <CardContent className="flex items-center gap-3 p-3">
                          <div
                            className={cn(
                              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                              transaction.settled ? 'bg-secondary' : 'bg-primary/10',
                            )}
                          >
                            <Icon
                              className={cn(
                                'h-5 w-5',
                                transaction.settled ? 'text-muted-foreground' : 'text-primary',
                              )}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium">{transaction.description}</p>
                              {transaction.settled ? (
                                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {transaction.paid_by_display_name ?? subMonogram(transaction.paid_by_sub)}{' '}
                              paid · {formatDistanceToNow(new Date(transaction.created_at), { addSuffix: true })}{' '}
                              · split {transaction.participant_count} way
                              {transaction.participant_count === 1 ? '' : 's'}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold">{formatRupees(transaction.amount)}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {formatRupees(transaction.share_amount)}/person
                            </p>
                          </div>
                          {!transaction.settled ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 shrink-0 px-3 text-xs"
                              type="button"
                              onClick={() => void settleExpense(transaction.id)}
                            >
                              Settle
                            </Button>
                          ) : null}
                        </CardContent>
                      </Card>
                    )
                  })
                )}
              </div>
            </section>
          </>
        ) : null}
      </div>

      <Drawer
        open={drawerOpen}
        onOpenChange={(o) => {
          setDrawerOpen(o)
          if (o && overview) {
            resetDrawer()
            setParticipantPick(new Set(overview.members.map((m) => m.user_sub)))
            setSplitEveryone(true)
            setPaidBySub(overview.viewer_sub)
          }
        }}
      >
        <Button
          type="button"
          className="glow-primary fixed bottom-20 right-4 h-14 w-14 rounded-full shadow-lg lg:bottom-6 lg:right-6"
          size="icon"
          disabled={!groupId}
          onClick={() => setDrawerOpen(true)}
        >
          <Plus className="h-6 w-6" />
        </Button>
        <DrawerContent>
          <div className="mx-auto w-full max-w-sm">
            <DrawerHeader>
              <DrawerTitle>Add expense</DrawerTitle>
            </DrawerHeader>
            <div className="space-y-4 p-4">
              <div className="space-y-2">
                <Label htmlFor="tab-desc">Description</Label>
                <Input
                  id="tab-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What was this for?"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tab-amt">Amount</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {RUPEE_SYMBOL}
                  </span>
                  <Input
                    id="tab-amt"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="pl-7"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {overview && overview.members.length > 0 ? (
                <div className="space-y-2">
                  <Label>Paid by</Label>
                  <Select value={paidBySub ?? overview.viewer_sub} onValueChange={setPaidBySub}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {overview.members.map((m) => (
                        <SelectItem key={m.user_sub} value={m.user_sub}>
                          {m.display_name ?? subMonogram(m.user_sub)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
                <div>
                  <Label htmlFor="split-all" className="text-sm font-medium">
                    Split with everyone in group
                  </Label>
                  <p className="text-xs text-muted-foreground">Equal shares between all members</p>
                </div>
                <Switch id="split-all" checked={splitEveryone} onCheckedChange={setSplitEveryone} />
              </div>
              {!splitEveryone && overview ? (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Tap members to include (min 2)</Label>
                  <div className="flex flex-wrap gap-2">
                    {overview.members.map((m) => {
                      const on = participantPick.has(m.user_sub)
                      return (
                        <Badge
                          key={m.user_sub}
                          variant={on ? 'default' : 'outline'}
                          className="cursor-pointer"
                          onClick={() => toggleParticipant(m.user_sub)}
                        >
                          {m.display_name ?? subMonogram(m.user_sub)}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            <DrawerFooter>
              <Button className="w-full" type="button" disabled={saving} onClick={() => void addExpense()}>
                {saving ? 'Saving…' : 'Add expense'}
              </Button>
              <DrawerClose asChild>
                <Button variant="outline" className="w-full" type="button">
                  Cancel
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
