import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchAuthSession, getCurrentUser, signOut } from 'aws-amplify/auth'
import { Bell, LogOut, Settings, ShieldCheck, Sparkles, User } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { isCognitoConfigured } from '@/lib/cognito-config'
import { summaryFromIdToken, type CognitoProfileSummary } from '@/lib/cognito-user'
import { apiJson } from '@/lib/api'

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
        /* API optional until backend is running */
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

  if (!isCognitoConfigured()) {
    return (
      <div className="py-4 lg:py-6 space-y-6">
        <Card className="glass border-primary/20 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>Add Cognito variables in <code className="text-foreground">frontend/.env</code> to enable login and profile from tokens.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" asChild>
                <Link to="/signup">Sign up</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/login">Log in</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (sessionLoading) {
    return (
      <div className="py-4 lg:py-6">
        <p className="text-sm text-muted-foreground">Loading profile…</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="py-4 lg:py-6 space-y-6">
        <Card className="glass border-primary/20 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">You are not signed in.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1" asChild>
                <Link to="/login">Log in</Link>
              </Button>
              <Button variant="outline" className="flex-1" asChild>
                <Link to="/signup">Sign up</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="py-4 lg:py-6 space-y-6">
      <Card className="glass border-primary/20 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
        <CardHeader className="relative pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            Profile & Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="relative space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">{session.displayName}</p>
                {session.email ? (
                  <p className="text-xs text-muted-foreground break-all">{session.email}</p>
                ) : null}
              </div>
            </div>
            <Badge variant="secondary" className="text-xs">
              Signed in
            </Badge>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Bell className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-sm font-medium">Expense alerts</p>
                  <p className="text-xs text-muted-foreground">Get notified about pending settlements.</p>
                </div>
              </div>
              <Switch checked={expenseAlerts} onCheckedChange={setExpenseAlerts} />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Sparkles className="w-4 h-4 text-accent" />
                <div>
                  <p className="text-sm font-medium">Weekly huddle summary</p>
                  <p className="text-xs text-muted-foreground">A quick recap of decisions and tabs.</p>
                </div>
              </div>
              <Switch checked={weeklySummary} onCheckedChange={setWeeklySummary} />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  Security
                </p>
                <p className="text-xs text-muted-foreground">
                  Session from Amazon Cognito. Your email and name sync to the app server for
                  friends and groups.
                </p>
              </div>
              <Badge variant="outline" className="text-xs shrink-0">
                Cognito
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="flex-1 min-w-[120px]" asChild>
                <Link to="/friends">Friends</Link>
              </Button>
              <Button variant="outline" className="flex-1 min-w-[120px]" asChild>
                <Link to="/groups">Groups</Link>
              </Button>
              <Button variant="outline" className="flex-1 min-w-[120px]" onClick={() => navigate('/vault')}>
                Vault quick links
              </Button>
              <Button variant="outline" className="flex-1 min-w-[120px]" onClick={() => navigate('/ai')}>
                Ask AI Concierge
              </Button>
            </div>
          </div>

          <div className="pt-2">
            <Button variant="destructive" className="w-full" onClick={() => void handleLogout()}>
              <LogOut className="w-4 h-4 mr-2" />
              Log out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
