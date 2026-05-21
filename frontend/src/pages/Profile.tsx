import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchAuthSession, getCurrentUser, signOut } from 'aws-amplify/auth'
import {
  Archive,
  Bell,
  KeyRound,
  LogOut,
  MessageSquare,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { isCognitoConfigured } from '@/lib/cognito-config'
import { summaryFromIdToken, type CognitoProfileSummary } from '@/lib/cognito-user'
import { apiJson } from '@/lib/api'

function profileInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0] + parts[1]![0]).toUpperCase()
  return name.slice(0, 2).toUpperCase() || 'HU'
}

function ProfileSignInPrompt() {
  return (
    <div className="py-4 lg:py-6 space-y-6">
      <Card className="glass border-primary/20 overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Your profile</CardTitle>
          <CardDescription>
            Sign in to see your name, email, notification preferences, and account shortcuts.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" asChild>
            <Link to="/login">Log in</Link>
          </Button>
          <Button variant="outline" className="flex-1" asChild>
            <Link to="/signup">Create account</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const [weeklySummary, setWeeklySummary] = useState(true)
  const [expenseAlerts, setExpenseAlerts] = useState(true)

  const [session, setSession] = useState<CognitoProfileSummary | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)

  const loadSession = useCallback(async () => {
    if (!isCognitoConfigured()) {
      setSession(null)
      setSessionLoading(false)
      return
    }
    setSessionLoading(true)
    try {
      await getCurrentUser()
      const authSession = await fetchAuthSession()
      const payload = authSession.tokens?.idToken?.payload
      if (payload) {
        setSession(summaryFromIdToken(payload))
      } else {
        setSession(null)
      }
    } catch {
      setSession(null)
    } finally {
      setSessionLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSession()
  }, [loadSession])

  useEffect(() => {
    if (!session) return
    void (async () => {
      try {
        await apiJson('/me', { method: 'PUT', body: '{}' })
      } catch {
        /* sync optional */
      }
    })()
  }, [session])

  const handleLogout = async () => {
    try {
      await signOut({ global: true })
    } catch {
      /* still clear local view */
    }
    setSession(null)
    navigate('/login', { replace: true })
  }

  if (sessionLoading) {
    return (
      <div className="py-4 lg:py-6">
        <p className="text-sm text-muted-foreground">Loading your profile…</p>
      </div>
    )
  }

  if (!isCognitoConfigured() || !session) {
    return <ProfileSignInPrompt />
  }

  return (
    <div className="py-4 lg:py-6 space-y-6">
      <Card className="glass border-primary/20 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
        <CardContent className="relative pt-6 pb-6 space-y-5">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 rounded-2xl border border-border/80">
              {session.pictureUrl ? (
                <AvatarImage src={session.pictureUrl} alt="" className="object-cover" />
              ) : null}
              <AvatarFallback className="rounded-2xl bg-primary/20 text-lg font-semibold text-primary">
                {profileInitials(session.displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold tracking-tight truncate">{session.displayName}</h2>
              {session.email ? (
                <p className="text-sm text-muted-foreground truncate">{session.email}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Signed in</p>
              )}
            </div>
          </div>

          <Separator />

          <div className="space-y-1">
            <p className="text-sm font-medium">Notifications</p>
            <p className="text-xs text-muted-foreground mb-3">
              Choose what you want to hear about from your groups.
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Bell className="w-4 h-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Expense alerts</p>
                    <p className="text-xs text-muted-foreground">When someone adds or settles a tab item.</p>
                  </div>
                </div>
                <Switch checked={expenseAlerts} onCheckedChange={setExpenseAlerts} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Sparkles className="w-4 h-4 shrink-0 text-accent" />
                  <div>
                    <p className="text-sm font-medium">Weekly recap</p>
                    <p className="text-xs text-muted-foreground">Polls, plans, and tab highlights from your crew.</p>
                  </div>
                </div>
                <Switch checked={weeklySummary} onCheckedChange={setWeeklySummary} />
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-medium">Account</p>
            <Button variant="outline" className="w-full justify-start gap-3 h-11" asChild>
              <Link to="/forgot-password">
                <KeyRound className="w-4 h-4 opacity-80" />
                Change password
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground px-1">
              We&apos;ll email you a code to set a new password.
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-sm font-medium">Shortcuts</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-11 justify-start gap-2" asChild>
                <Link to="/friends">
                  <UserPlus className="w-4 h-4 opacity-80" />
                  Friends
                </Link>
              </Button>
              <Button variant="outline" className="h-11 justify-start gap-2" asChild>
                <Link to="/groups">
                  <Users className="w-4 h-4 opacity-80" />
                  Groups
                </Link>
              </Button>
              <Button variant="outline" className="h-11 justify-start gap-2" onClick={() => navigate('/vault')}>
                <Archive className="w-4 h-4 opacity-80" />
                Vault
              </Button>
              <Button variant="outline" className="h-11 justify-start gap-2" onClick={() => navigate('/ai')}>
                <MessageSquare className="w-4 h-4 opacity-80" />
                AI Concierge
              </Button>
            </div>
          </div>

          <Button variant="destructive" className="w-full mt-2" onClick={() => void handleLogout()}>
            <LogOut className="w-4 h-4 mr-2" />
            Log out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
