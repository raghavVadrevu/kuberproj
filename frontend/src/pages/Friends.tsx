import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Mail, Send, UserMinus, X } from 'lucide-react'
import { toast } from 'sonner'

import { UserAvatar } from '@/components/UserAvatar'
import { PageLoader } from '@/components/ui/page-loader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { refreshNavBadges } from '@/contexts/NavBadgesContext'
import {
  apiJson,
  type FriendRequestDto,
  type FriendRequestCreateResultDto,
  type UserProfileDto,
} from '@/lib/api'
import { toastUserError } from '@/lib/user-errors'

export default function FriendsPage() {
  const [friends, setFriends] = useState<UserProfileDto[]>([])
  const [incoming, setIncoming] = useState<FriendRequestDto[]>([])
  const [outgoing, setOutgoing] = useState<FriendRequestDto[]>([])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [f, inc, out] = await Promise.all([
        apiJson<UserProfileDto[]>('/friends'),
        apiJson<FriendRequestDto[]>('/friends/requests/incoming'),
        apiJson<FriendRequestDto[]>('/friends/requests/outgoing'),
      ])
      setFriends(f)
      setIncoming(inc)
      setOutgoing(out)
      refreshNavBadges()
    } catch (e) {
      toastUserError(e, "Couldn't load your friends. Pull to refresh or try again.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const sendRequest = async () => {
    const em = email.trim().toLowerCase()
    if (!em || !em.includes('@')) {
      toast.error('Enter a valid email')
      return
    }
    setBusy(true)
    try {
      const res = await apiJson<FriendRequestCreateResultDto>('/friends/requests', {
        method: 'POST',
        body: JSON.stringify({ email: em }),
      })
      if (res.became_friends) {
        toast.success('You are now friends')
      } else {
        toast.success('Friend request sent')
      }
      setEmail('')
      void refresh()
    } catch (e) {
      toastUserError(e, "Couldn't send that friend request. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const accept = async (id: string) => {
    try {
      await apiJson(`/friends/requests/${id}/accept`, { method: 'POST' })
      toast.success('Request accepted')
      void refresh()
    } catch (e) {
      toastUserError(e, "That didn't work. Try again.")
    }
  }

  const decline = async (id: string) => {
    try {
      await apiJson(`/friends/requests/${id}/decline`, { method: 'POST' })
      toast.success('Request declined')
      void refresh()
    } catch (e) {
      toastUserError(e, "That didn't work. Try again.")
    }
  }

  const cancelOutgoing = async (id: string) => {
    try {
      await apiJson(`/friends/requests/${id}`, { method: 'DELETE' })
      toast.success('Request cancelled')
      void refresh()
    } catch (e) {
      toastUserError(e, "That didn't work. Try again.")
    }
  }

  const unfriend = async (sub: string) => {
    try {
      await apiJson(`/friends/${encodeURIComponent(sub)}`, { method: 'DELETE' })
      toast.success('Removed from friends')
      void refresh()
    } catch (e) {
      toastUserError(e, "That didn't work. Try again.")
    }
  }

  return (
    <div className="space-y-6 py-4 lg:py-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Friends</h1>
        <p className="text-sm text-muted-foreground">
          Send requests by email (they must have opened the app once so we know their account).
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Send friend request</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="friend-email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="friend-email"
                className="pl-9"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="friend@example.com"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void sendRequest()
                }}
              />
            </div>
          </div>
          <Button disabled={busy} onClick={() => void sendRequest()}>
            <Send className="mr-2 size-4" />
            Send
          </Button>
        </CardContent>
      </Card>

      {loading ? <PageLoader label="Loading friends…" variant="inline" /> : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Incoming requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {incoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">None right now.</p>
          ) : (
            incoming.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar
                    className="h-10 w-10 shrink-0"
                    pictureUrl={r.from_picture_url}
                    displayName={r.from_display_name}
                    userSub={r.from_sub}
                  />
                  <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {r.from_display_name ?? 'Someone'}
                  </p>
                  {r.from_email ? (
                    <p className="text-xs text-muted-foreground">{r.from_email}</p>
                  ) : null}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="default" onClick={() => void accept(r.id)}>
                    <Check className="mr-1 size-4" />
                    Accept
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void decline(r.id)}>
                    <X className="mr-1 size-4" />
                    Decline
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Outgoing requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {outgoing.length === 0 ? (
            <p className="text-sm text-muted-foreground">None pending.</p>
          ) : (
            outgoing.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar
                    className="h-10 w-10 shrink-0"
                    pictureUrl={r.to_picture_url}
                    displayName={r.to_display_name}
                    userSub={r.to_sub}
                  />
                  <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {r.to_display_name ?? r.to_email ?? r.to_sub.slice(0, 8)}
                  </p>
                  {r.to_email ? (
                    <p className="text-xs text-muted-foreground">{r.to_email}</p>
                  ) : null}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void cancelOutgoing(r.id)}>
                  Cancel
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Your friends</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {friends.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No friends yet. Add people above, or{' '}
              <Link to="/groups" className="text-primary underline-offset-4 hover:underline">
                manage groups
              </Link>
              .
            </p>
          ) : (
            friends.map((f) => (
              <div
                key={f.sub}
                className="flex items-center justify-between gap-2 rounded-lg border border-border p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar
                    className="h-10 w-10 shrink-0"
                    pictureUrl={f.picture_url}
                    displayName={f.display_name}
                    userSub={f.sub}
                  />
                  <div className="min-w-0">
                  <p className="text-sm font-medium">{f.display_name}</p>
                  {f.email ? (
                    <p className="text-xs text-muted-foreground">{f.email}</p>
                  ) : null}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => void unfriend(f.sub)}
                  aria-label={`Remove ${f.display_name}`}
                >
                  <UserMinus className="size-4" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Separator />

      <p className="text-xs text-muted-foreground">
        Friend list is stored on the server. Removing someone deletes the friendship only; it does not
        remove them from groups automatically.
      </p>
    </div>
  )
}
