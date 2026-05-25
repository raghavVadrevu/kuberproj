import { useState } from 'react'
import { Link } from 'react-router-dom'
import { confirmResetPassword, resetPassword } from 'aws-amplify/auth'
import { KeyRound, Mail, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isCognitoConfigured } from '@/lib/cognito-config'
import {
  formatCognitoError,
  getPasswordValidationError,
  PASSWORD_REQUIREMENTS_HELP,
} from '@/lib/cognito-errors'

type Step = 'request' | 'confirm'

const VERIFICATION_SPAM_HINT =
  "If you don't see the email, check your spam or junk folder."

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('request')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)

  const handleRequestCode = async () => {
    setError(null)
    const emailNorm = email.trim().toLowerCase()
    if (!emailNorm || !emailNorm.includes('@')) {
      setError('Enter the email you used to sign up (email-only accounts).')
      return
    }

    setBusy(true)
    try {
      await resetPassword({ username: emailNorm })
      setStep('confirm')
      setCode('')
    } catch (e) {
      setError(formatCognitoError(e))
    } finally {
      setBusy(false)
    }
  }

  const handleConfirmReset = async () => {
    setError(null)
    const emailNorm = email.trim().toLowerCase()
    if (!code.trim()) {
      setError('Enter the code from your email.')
      return
    }
    if (!newPassword || newPassword !== confirmPassword) {
      setError('New passwords must match.')
      return
    }
    const passwordError = getPasswordValidationError(newPassword)
    if (passwordError) {
      setError(passwordError)
      return
    }

    setBusy(true)
    try {
      await confirmResetPassword({
        username: emailNorm,
        confirmationCode: code.trim(),
        newPassword,
      })
      setFinished(true)
      setError(null)
    } catch (e) {
      setError(formatCognitoError(e))
    } finally {
      setBusy(false)
    }
  }

  if (!isCognitoConfigured()) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md glass border-primary/20">
          <CardHeader>
            <CardTitle className="text-base">Cognito is not configured</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link to="/login">Back to log in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md glass border-primary/20">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-lg">Reset password</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter the email for your account. We&apos;ll send a reset code so you can choose a new password.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {finished ? (
            <>
              <p className="text-sm text-center text-muted-foreground">
                Your password was updated. Log in with your email and new password.
              </p>
              <Button className="w-full" asChild>
                <Link to="/login">Go to log in</Link>
              </Button>
            </>
          ) : step === 'request' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="fp-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="fp-email"
                    type="email"
                    className="pl-9"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
              </div>
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              <Button className="w-full" disabled={busy} onClick={() => void handleRequestCode()}>
                {busy ? 'Sending…' : 'Send reset code'}
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{VERIFICATION_SPAM_HINT}</p>
              <div className="space-y-2">
                <Label htmlFor="fp-code">Verification code</Label>
                <Input
                  id="fp-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="font-mono"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fp-new">New password</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="fp-new"
                    type="password"
                    className="pl-9"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <p className="text-xs text-muted-foreground">{PASSWORD_REQUIREMENTS_HELP}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fp-confirm">Confirm new password</Label>
                <Input
                  id="fp-confirm"
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
              <Button className="w-full" disabled={busy} onClick={() => void handleConfirmReset()}>
                {busy ? 'Updating…' : 'Set new password'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={busy}
                onClick={() => {
                  setStep('request')
                  setError(null)
                }}
              >
                Back
              </Button>
            </>
          )}

          {!finished ? (
            <Button variant="outline" className="w-full" asChild>
              <Link to="/login">Back to log in</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
