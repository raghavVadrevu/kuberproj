import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  resendSignUpCode,
  signIn,
} from 'aws-amplify/auth'
import { KeyRound, Mail, Sparkles } from 'lucide-react'

import ConfirmEmailCard from '@/components/auth/ConfirmEmailCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import AuthHeroLayout from '@/components/auth/AuthHeroLayout'
import { isCognitoConfigured } from '@/lib/cognito-config'
import {
  formatCognitoError,
  isUserNotConfirmedError,
} from '@/lib/cognito-errors'

type LoginStep = 'credentials' | 'confirm'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [step, setStep] = useState<LoginStep>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmCode, setConfirmCode] = useState('')
  const [resendMessage, setResendMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const emailNorm = email.trim().toLowerCase()

  useEffect(() => {
    if (!isCognitoConfigured()) return
    let cancelled = false
    void (async () => {
      try {
        await getCurrentUser()
        const session = await fetchAuthSession()
        if (session.tokens?.idToken && !cancelled) {
          const from = (location.state as { from?: string } | null)?.from
          const target =
            from && from.startsWith('/') && from !== '/login' ? from : '/profile'
          navigate(target, { replace: true })
        }
      } catch {
        /* not signed in */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate, location.state])

  const navigateAfterSignIn = async () => {
    const session = await fetchAuthSession()
    if (session.tokens?.idToken) {
      const from = (location.state as { from?: string } | null)?.from
      const target =
        from && from.startsWith('/') && from !== '/login' ? from : '/profile'
      navigate(target, { replace: true })
    }
  }

  const beginEmailConfirmation = async (username: string) => {
    setStep('confirm')
    setConfirmCode('')
    setResendMessage(null)
    setError(null)
    try {
      await resendSignUpCode({ username })
      setResendMessage('Your account is not verified yet. We sent a new code — check your inbox.')
    } catch {
      setResendMessage(
        'Your account is not verified yet. Enter the code from your email, or resend one below.',
      )
    }
  }

  const handleLogin = async () => {
    setError(null)
    if (!emailNorm || !emailNorm.includes('@')) {
      setError('Enter a valid email.')
      return
    }
    if (!password) {
      setError('Enter your password.')
      return
    }

    setBusy(true)
    try {
      const result = await signIn({ username: emailNorm, password })
      if (
        !result.isSignedIn &&
        result.nextStep?.signInStep === 'CONFIRM_SIGN_UP'
      ) {
        await beginEmailConfirmation(emailNorm)
        return
      }
      if (result.isSignedIn) {
        await navigateAfterSignIn()
        return
      }
      setError(
        `Your account needs another sign-in step (${result.nextStep?.signInStep ?? 'unknown'}). ` +
          'Adjust MFA in Cognito if needed.',
      )
    } catch (e) {
      if (isUserNotConfirmedError(e)) {
        await beginEmailConfirmation(emailNorm)
        return
      }
      setError(formatCognitoError(e))
    } finally {
      setBusy(false)
    }
  }

  const handleConfirm = async () => {
    setError(null)
    const code = confirmCode.trim()
    if (!code) {
      setError('Enter the verification code.')
      return
    }
    if (!emailNorm) {
      setError('Enter your email on the login form first.')
      setStep('credentials')
      return
    }
    if (!password) {
      setError('Enter your password on the login form first.')
      setStep('credentials')
      return
    }

    setBusy(true)
    try {
      await confirmSignUp({
        username: emailNorm,
        confirmationCode: code,
      })
      const result = await signIn({ username: emailNorm, password })
      if (result.isSignedIn) {
        await navigateAfterSignIn()
        return
      }
      if (result.nextStep?.signInStep === 'CONFIRM_SIGN_UP') {
        setError('Verification succeeded but sign-in still needs confirmation. Try logging in again.')
        return
      }
      setError('Account verified. Try logging in again.')
      setStep('credentials')
    } catch (e) {
      setError(formatCognitoError(e))
    } finally {
      setBusy(false)
    }
  }

  const handleResend = async () => {
    setError(null)
    setResendMessage(null)
    if (!emailNorm) {
      setError('Enter your email on the login form first.')
      setStep('credentials')
      return
    }
    setBusy(true)
    try {
      await resendSignUpCode({ username: emailNorm })
      setResendMessage('We sent a new code. Check your inbox and spam folder.')
    } catch (e) {
      setError(formatCognitoError(e))
    } finally {
      setBusy(false)
    }
  }

  if (!isCognitoConfigured()) {
    return (
      <AuthHeroLayout>
        <Card className="w-full glass border-primary/20 shadow-xl">
          <CardHeader>
            <CardTitle className="text-base">Cognito is not configured</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Add the same variables as signup uses in <code className="text-foreground">frontend/.env</code>, then restart the dev server.</p>
            <Button variant="outline" asChild>
              <Link to="/signup">Go to sign up</Link>
            </Button>
          </CardContent>
        </Card>
      </AuthHeroLayout>
    )
  }

  if (step === 'confirm') {
    return (
      <AuthHeroLayout>
        <ConfirmEmailCard
          email={emailNorm}
          confirmCode={confirmCode}
          onConfirmCodeChange={setConfirmCode}
          busy={busy}
          error={error}
          resendMessage={resendMessage}
          onConfirm={() => void handleConfirm()}
          onResend={() => void handleResend()}
          onBack={() => {
            setStep('credentials')
            setError(null)
            setResendMessage(null)
          }}
          backLabel="Back to login"
          intro="Your account exists but is not verified yet. Enter the code sent to"
        />
      </AuthHeroLayout>
    )
  }

  return (
    <AuthHeroLayout>
      <Card className="w-full glass border-primary/20 shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-lg">Log in</CardTitle>
          <p className="text-sm text-muted-foreground">Email and password.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="login-email"
                type="email"
                className="pl-9"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="login-password">Password</Label>
              <Link to="/forgot-password" className="text-xs text-primary underline-offset-4 hover:underline">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="login-password"
                type="password"
                className="pl-9"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleLogin()
                }}
              />
            </div>
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Button className="w-full" disabled={busy} onClick={() => void handleLogin()}>
            {busy ? 'Signing in…' : 'Log in'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            No account?{' '}
            <Link to="/signup" className="text-primary underline-offset-4 hover:underline">
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthHeroLayout>
  )
}
