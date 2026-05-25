import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchAuthSession, getCurrentUser, signOut } from 'aws-amplify/auth'
import {
  Archive,
  Bell,
  ImageIcon,
  KeyRound,
  LogOut,
  MessageSquare,
  Sparkles,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { UserAvatar } from '@/components/UserAvatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { isCognitoConfigured } from '@/lib/cognito-config'
import { updateCognitoProfile } from '@/lib/cognito-profile'
import { summaryFromIdToken, type CognitoProfileSummary } from '@/lib/cognito-user'
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
import { PageLoader } from '@/components/ui/page-loader'
import { apiJson, type MeUpdateDto, type UserProfileDto } from '@/lib/api'
import { deleteAccount } from '@/lib/account'
import { prepareAvatarFile, uploadAvatarFile, validateAvatarFile } from '@/lib/uploads'
import { toastUserError } from '@/lib/user-errors'

function splitDisplayName(displayName: string): { first: string; last: string } {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: '', last: '' }
  if (parts.length === 1) return { first: parts[0]!, last: '' }
  return { first: parts[0]!, last: parts.slice(1).join(' ') }
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
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [saving, setSaving] = useState(false)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [pictureFile, setPictureFile] = useState<File | null>(null)
  const [picturePreviewUrl, setPicturePreviewUrl] = useState<string | null>(null)
  const [picturePreparing, setPicturePreparing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const applyProfile = useCallback((me: UserProfileDto, summary: CognitoProfileSummary) => {
    const first =
      me.given_name?.trim() ||
      summary.givenName ||
      splitDisplayName(me.display_name).first
    const last =
      me.family_name?.trim() ||
      summary.familyName ||
      splitDisplayName(me.display_name).last
    setFirstName(first)
    setLastName(last)
    setPicturePreviewUrl(me.picture_url ?? summary.pictureUrl)
    setPictureFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const loadProfile = useCallback(async () => {
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
      if (!payload) {
        setSession(null)
        return
      }
      const summary = summaryFromIdToken(payload)
      const me = await apiJson<UserProfileDto>('/me')
      setSession(summary)
      applyProfile(me, summary)
    } catch {
      setSession(null)
    } finally {
      setSessionLoading(false)
    }
  }, [applyProfile])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  useEffect(() => {
    if (!pictureFile) return
    const url = URL.createObjectURL(pictureFile)
    setPicturePreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pictureFile])

  const clearPictureSelection = () => {
    setPictureFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setPicturePreviewUrl(session?.pictureUrl ?? null)
  }

  const handlePictureChange = (file: File | null) => {
    if (!file) {
      clearPictureSelection()
      return
    }
    const validationError = validateAvatarFile(file)
    if (validationError) {
      toast.error(validationError)
      clearPictureSelection()
      return
    }
    setPicturePreparing(true)
    void prepareAvatarFile(file)
      .then((prepared) => setPictureFile(prepared))
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : 'Could not process this image.')
        clearPictureSelection()
      })
      .finally(() => setPicturePreparing(false))
  }

  const handleSaveProfile = async () => {
    const given = firstName.trim()
    const family = lastName.trim()
    if (!given || !family) {
      toast.error('Enter your first and last name.')
      return
    }

    setSaving(true)
    try {
      let pictureUrl: string | undefined
      if (pictureFile) {
        pictureUrl = await uploadAvatarFile(pictureFile, { authenticated: true })
      }

      await updateCognitoProfile({
        givenName: given,
        familyName: family,
        pictureUrl: pictureUrl ?? session?.pictureUrl ?? null,
      })

      const body: MeUpdateDto = {
        given_name: given,
        family_name: family,
      }
      if (pictureUrl !== undefined) {
        body.picture_url = pictureUrl
      }

      const me = await apiJson<UserProfileDto>('/me', {
        method: 'PUT',
        body: JSON.stringify(body),
      })

      const authSession = await fetchAuthSession({ forceRefresh: true })
      const payload = authSession.tokens?.idToken?.payload
      if (payload) {
        const summary = summaryFromIdToken(payload)
        setSession(summary)
        applyProfile(me, summary)
      }

      toast.success('Profile updated')
    } catch (e) {
      toastUserError(e, "Couldn't save your profile. Try again.")
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAccount = async () => {
    setDeletingAccount(true)
    try {
      await deleteAccount()
      toast.success('Your account was deleted')
      navigate('/signup', { replace: true })
    } catch (e) {
      toastUserError(e, "Couldn't delete your account. Try again.")
    } finally {
      setDeletingAccount(false)
    }
  }

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
    return <PageLoader label="Loading your profile…" />
  }

  if (!isCognitoConfigured() || !session) {
    return <ProfileSignInPrompt />
  }

  const avatarPreview =
    picturePreviewUrl ??
    (pictureFile ? null : session.pictureUrl)

  return (
    <div className="py-4 lg:py-6 space-y-6">
      <Card className="glass border-primary/20 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
        <CardContent className="relative pt-6 pb-6 space-y-5">
          <div className="space-y-1">
            <p className="text-sm font-medium">Your profile</p>
            <p className="text-xs text-muted-foreground">
              Name and photo sync to your account and appear across the app.
            </p>
          </div>

          <div className="flex items-start gap-4">
            <UserAvatar
              className="h-16 w-16 rounded-2xl border border-border/80 shrink-0"
              fallbackClassName="rounded-2xl bg-primary/20 text-lg font-semibold text-primary"
              pictureUrl={avatarPreview}
              displayName={`${firstName} ${lastName}`.trim()}
              userSub={session.sub}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                capture="user"
                className="sr-only"
                onChange={(e) => handlePictureChange(e.target.files?.[0] ?? null)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={saving || picturePreparing}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageIcon className="h-4 w-4" />
                  {pictureFile ? 'Change photo' : 'Upload photo'}
                </Button>
                {pictureFile ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-muted-foreground"
                    disabled={saving}
                    onClick={clearPictureSelection}
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Large images are compressed to 2 MB before upload.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-first">First name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="profile-first"
                  className="pl-9"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-last">Last name</Label>
              <Input
                id="profile-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
              />
            </div>
          </div>

          {session.email ? (
            <p className="text-sm text-muted-foreground">
              Email: <span className="text-foreground">{session.email}</span> (cannot be changed here)
            </p>
          ) : null}

          <Button className="w-full" disabled={saving || picturePreparing} onClick={() => void handleSaveProfile()}>
            {saving ? 'Saving…' : 'Save profile'}
          </Button>

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

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes your profile, friendships, and group memberships from Huddle and deletes
                  your Cognito login. Group expenses and messages you created may still appear for
                  others. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deletingAccount}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deletingAccount}
                  onClick={() => void handleDeleteAccount()}
                >
                  {deletingAccount ? 'Deleting…' : 'Delete my account'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button variant="destructive" className="w-full" onClick={() => void handleLogout()}>
            <LogOut className="w-4 h-4 mr-2" />
            Log out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
