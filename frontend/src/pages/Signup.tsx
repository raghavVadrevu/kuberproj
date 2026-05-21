import { useState } from 'react'
import { Link } from 'react-router-dom'
import { confirmSignUp, resendSignUpCode, signUp } from 'aws-amplify/auth'
import { ImageIcon, KeyRound, Mail, Sparkles, User } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import AuthHeroLayout from '@/components/auth/AuthHeroLayout'
import { isCognitoConfigured } from '@/lib/cognito-config'
import { formatCognitoError } from '@/lib/cognito-errors'

type Step = 'form' | 'confirm' | 'done'

function isValidOptionalPictureUrl(raw: string): boolean {
  const t = raw.trim()
  if (!t) return true
  try {
    const u = new URL(t)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

const VERIFICATION_SPAM_HINT =
  "If you don't see the email, check your spam or junk folder."

export default function SignupPage() {
  const [step, setStep] = useState<Step>('form')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [pictureUrl, setPictureUrl] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [confirmUsername, setConfirmUsername] = useState('')
  const [confirmCode, setConfirmCode] = useState('')
  const [resendMessage, setResendMessage] = useState<string | null>(null)

  const handleSubmitForm = async () => {
    setError(null)

    if (!firstName.trim() || !lastName.trim()) {
      setError('Enter your first and last name.')
      return
    }
    const emailNorm = email.trim().toLowerCase()
    if (!emailNorm || !emailNorm.includes('@')) {
      setError('Enter a valid email.')
      return
    }
    if (!password || password !== confirmPassword) {
      setError('Passwords must match.')
      return
    }
    if (password.length < 8) {
      setError('Use at least 8 characters for your password.')
      return
    }
    if (!isValidOptionalPictureUrl(pictureUrl)) {
      setError('Profile picture must be a valid http(s) URL, or leave it empty.')
      return
    }

    setBusy(true)
    try {
      const displayName = `${firstName.trim()} ${lastName.trim()}`.trim()
      const attrs: Record<string, string> = {
        email: emailNorm,
        given_name: firstName.trim(),
        family_name: lastName.trim(),
        name: displayName,
      }
      const pic = pictureUrl.trim()
      if (pic) attrs.picture = pic

      const result = await signUp({
        username: emailNorm,
        password,
        options: { userAttributes: attrs },
      })

      if (result.nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
        setConfirmUsername(emailNorm)
        setConfirmCode('')
        setResendMessage(null)
        setStep('confirm')
        return
      }

      if (result.isSignUpComplete && result.nextStep.signUpStep === 'DONE') {
        setConfirmUsername(emailNorm)
        setStep('done')
        return
      }

      setError('Unexpected response from Cognito. Check required attributes in the user pool.')
    } catch (e) {
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
    setBusy(true)
    try {
      await confirmSignUp({
        username: confirmUsername,
        confirmationCode: code,
      })
      setStep('done')
    } catch (e) {
      setError(formatCognitoError(e))
    } finally {
      setBusy(false)
    }
  }

  const handleResend = async () => {
    setError(null)
    setResendMessage(null)
    setBusy(true)
    try {
      await resendSignUpCode({ username: confirmUsername })
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
            <p>Create <code className="text-foreground">frontend/.env</code> and set:</p>
            <ul className="list-disc pl-5 space-y-1 font-mono text-xs text-foreground">
              <li>VITE_COGNITO_ISSUER</li>
              <li>VITE_COGNITO_CLIENT_ID (or VITE_COGNITO_AUDIENCE)</li>
            </ul>
            <p className="text-xs">
              Issuer looks like{' '}
              <code className="text-foreground">
                https://cognito-idp.REGION.amazonaws.com/REGION_poolId
              </code>
              . Restart <code className="text-foreground">npm run dev</code> after saving.
            </p>
            <Button variant="outline" asChild className="mt-2">
              <Link to="/">Back home</Link>
            </Button>
          </CardContent>
        </Card>
      </AuthHeroLayout>
    )
  }

  if (step === 'done') {
    return (
      <AuthHeroLayout>
        <Card className="w-full glass border-primary/20 shadow-xl">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-base">You are signed up</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center text-sm text-muted-foreground">
            <p>
              Your profile (name, email, optional picture URL) is stored in Cognito. We emailed a verification code during
              sign-up; password stays with Cognito only.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button asChild className="flex-1 sm:flex-none">
                <Link to="/login">Log in</Link>
              </Button>
              <Button variant="outline" asChild className="flex-1 sm:flex-none">
                <Link to="/">Continue to app</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </AuthHeroLayout>
    )
  }

  if (step === 'confirm') {
    return (
      <AuthHeroLayout>
        <Card className="w-full glass border-primary/20 shadow-xl">
          <CardHeader>
            <CardTitle className="text-base">Confirm your email</CardTitle>
            <p className="text-sm text-muted-foreground">
              Enter the verification code sent to{' '}
              <span className="font-medium text-foreground">{confirmUsername}</span>.
            </p>
            <p className="text-xs text-muted-foreground">{VERIFICATION_SPAM_HINT}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {resendMessage ? <p className="text-xs text-emerald-600 dark:text-emerald-400">{resendMessage}</p> : null}
            <div className="space-y-2">
              <Label htmlFor="code">Verification code</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                className="font-mono"
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button className="w-full" disabled={busy} onClick={() => void handleConfirm()}>
              {busy ? 'Checking…' : 'Confirm account'}
            </Button>
            <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void handleResend()}>
              Resend code
            </Button>
            <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => setStep('form')}>
              Back to form
            </Button>
          </CardContent>
        </Card>
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
          <CardTitle className="text-lg">Create your account</CardTitle>
          <p className="text-sm text-muted-foreground">
            Email, password, then a verification code in your inbox. Data is saved in Amazon Cognito.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="firstName"
                  className="pl-9"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                className="pl-9"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="picture">Profile picture URL (optional)</Label>
            <div className="relative">
              <ImageIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="picture"
                className="pl-9"
                placeholder="https://…"
                value={pictureUrl}
                onChange={(e) => setPictureUrl(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">Host the image in S3 or elsewhere; Cognito only stores the URL.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                className="pl-9"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Button className="w-full" disabled={busy} onClick={() => void handleSubmitForm()}>
            {busy ? 'Creating account…' : 'Sign up'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-primary underline-offset-4 hover:underline">
              Log in
            </Link>
          </p>

          <Button variant="ghost" className="w-full" asChild>
            <Link to="/">Cancel</Link>
          </Button>
        </CardContent>
      </Card>
    </AuthHeroLayout>
  )
}
