import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'

import { UserAvatar } from '@/components/UserAvatar'
import { PageLoader } from '@/components/ui/page-loader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  apiJson,
  ACTIVE_GROUP_STORAGE_KEY,
  type GroupDetailDto,
  type GroupDto,
  type UserProfileDto,
} from '@/lib/api'
import { toastUserError } from '@/lib/user-errors'

export default function GroupsPage() {
  const [meSub, setMeSub] = useState<string | null>(null)
  const [groups, setGroups] = useState<GroupDto[]>([])
  const [detail, setDetail] = useState<GroupDetailDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    void apiJson<UserProfileDto>('/me')
      .then((m) => setMeSub(m.sub))
      .catch(() => setMeSub(null))
  }, [])

  const loadGroups = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiJson<GroupDto[]>('/groups')
      setGroups(data)
      if (expandedId) {
        const d = await apiJson<GroupDetailDto>(`/groups/${expandedId}`)
        setDetail(d)
      } else {
        setDetail(null)
      }
    } catch (e) {
      toastUserError(e, "Couldn't load your groups. Try again.")
    } finally {
      setLoading(false)
    }
  }, [expandedId])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  const openGroup = async (id: string) => {
    setExpandedId(id)
    try {
      const d = await apiJson<GroupDetailDto>(`/groups/${id}`)
      setDetail(d)
    } catch (e) {
      toastUserError(e, "Couldn't open that group. Try again.")
    }
  }

  const createGroup = async () => {
    const n = newName.trim()
    if (!n) {
      toast.error('Enter a group name')
      return
    }
    try {
      const g = await apiJson<GroupDetailDto>('/groups', {
        method: 'POST',
        body: JSON.stringify({ name: n }),
      })
      localStorage.setItem(ACTIVE_GROUP_STORAGE_KEY, g.id)
      setCreateOpen(false)
      setNewName('')
      toast.success('Group created')
      setExpandedId(g.id)
      setDetail(g)
      void loadGroups()
    } catch (e) {
      toastUserError(e, "Couldn't create that group. Try again.")
    }
  }

  const deleteGroup = async (id: string) => {
    if (!confirm('Delete this group and all polls & availability for it?')) return
    try {
      await apiJson(`/groups/${id}`, { method: 'DELETE' })
      if (localStorage.getItem(ACTIVE_GROUP_STORAGE_KEY) === id) {
        localStorage.removeItem(ACTIVE_GROUP_STORAGE_KEY)
      }
      toast.success('Group deleted')
      setExpandedId(null)
      setDetail(null)
      void loadGroups()
    } catch (e) {
      toastUserError(e, "Couldn't delete that group. Try again.")
    }
  }

  const addMember = async () => {
    if (!detail) return
    const em = addEmail.trim().toLowerCase()
    if (!em || !em.includes('@')) {
      toast.error('Enter a valid email')
      return
    }
    try {
      const d = await apiJson<GroupDetailDto>(`/groups/${detail.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: em }),
      })
      setDetail(d)
      setAddEmail('')
      toast.success('Member added')
      void loadGroups()
    } catch (e) {
      toastUserError(e, "Couldn't add that member. Try again.")
    }
  }

  const removeMember = async (memberSub: string) => {
    if (!detail) return
    try {
      await apiJson(`/groups/${detail.id}/members/${encodeURIComponent(memberSub)}`, {
        method: 'DELETE',
      })
      toast.success('Updated')
      void openGroup(detail.id)
      void loadGroups()
    } catch (e) {
      toastUserError(e, "Couldn't remove that member. Try again.")
    }
  }

  const setActiveForDecide = (id: string) => {
    localStorage.setItem(ACTIVE_GROUP_STORAGE_KEY, id)
    toast.success('Active group set for Decide tab')
  }

  return (
    <div className="space-y-6 py-4 lg:py-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Groups</h1>
          <p className="text-sm text-muted-foreground">
            Polls and availability are per group. Add friends as members.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" />
          New group
        </Button>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create group</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="g-name">Name</Label>
            <Input
              id="g-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Friday crew"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void createGroup()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? <PageLoader label="Loading groups…" variant="inline" /> : null}

      <div className="space-y-3">
        {groups.length === 0 && !loading ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No groups yet. Create one to use the Decide tab.
            </CardContent>
          </Card>
        ) : null}

        {groups.map((g) => (
          <Card key={g.id}>
            <CardHeader
              className="cursor-pointer p-4"
              onClick={() => void openGroup(g.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <Users className="mt-0.5 size-4 text-primary" />
                  <div>
                    <CardTitle className="text-base">{g.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {g.member_count} members ·{' '}
                      <button
                        type="button"
                        className="text-primary underline-offset-2 hover:underline"
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveForDecide(g.id)
                        }}
                      >
                        Use in Decide
                      </button>
                    </p>
                  </div>
                </div>
                {meSub && g.created_by === meSub ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      void deleteGroup(g.id)
                    }}
                    aria-label="Delete group"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            {detail?.id === g.id ? (
              <CardContent className="space-y-4 border-t border-border px-4 pb-4 pt-4">
                <div className="space-y-2">
                  <Label>Add member (must be friends with you)</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={addEmail}
                      onChange={(e) => setAddEmail(e.target.value)}
                      placeholder="email@example.com"
                    />
                    <Button type="button" variant="secondary" onClick={() => void addMember()}>
                      <UserPlus className="mr-2 size-4" />
                      Add
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Members</p>
                  <ul className="space-y-2">
                    {detail.members.map((m) => (
                      <li
                        key={m.user_sub}
                        className="flex items-center justify-between rounded-md bg-secondary/40 px-3 py-2 text-sm"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <UserAvatar
                            className="h-8 w-8 shrink-0"
                            pictureUrl={m.picture_url}
                            displayName={m.display_name}
                            userSub={m.user_sub}
                          />
                          <span className="truncate">
                          {m.display_name ?? m.user_sub.slice(0, 8)}
                          {m.role === 'owner' ? (
                            <span className="ml-2 text-xs text-muted-foreground">(owner)</span>
                          ) : null}
                          </span>
                        </span>
                        {meSub &&
                        m.user_sub === meSub &&
                        m.role !== 'owner' ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void removeMember(m.user_sub)}
                          >
                            Leave
                          </Button>
                        ) : null}
                        {meSub &&
                        detail.created_by === meSub &&
                        m.user_sub !== meSub &&
                        m.role !== 'owner' ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void removeMember(m.user_sub)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/decision">Open Decide for this group</Link>
                </Button>
              </CardContent>
            ) : null}
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Only the owner can delete the group or add members. Members can leave unless they are the
        owner.
      </p>
    </div>
  )
}
