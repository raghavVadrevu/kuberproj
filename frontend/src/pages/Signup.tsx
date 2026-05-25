import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { confirmSignUp, resendSignUpCode, signUp } from 'aws-amplify/auth'
import { ImageIcon, KeyRound, Mail, Sparkles, User, X } from 'lucide-react'

import { UserAvatar } from '@/components/UserAvatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import ConfirmEmailCard from '@/components/auth/ConfirmEmailCard'
import AuthHeroLayout from '@/components/auth/AuthHeroLayout'
import { isCognitoConfigured } from '@/lib/cognito-config'
import {
  formatCognitoError,
  getPasswordValidationError,
  isUsernameExistsError,
  PASSWORD_REQUIREMENTS_HELP,
} from '@/lib/cognito-errors'
import { prepareAvatarFile, uploadAvatarFile, validateAvatarFile } from '@/lib/uploads'

type Step = 'form' | 'confirm' | 'done'

export default function SignupPage() {
  const [step, setStep] = useState<Step>('form')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [pictureFile, setPictureFile] = useState<File | null>(null)
  const [picturePreviewUrl, setPicturePreviewUrl] = useState<string | null>(null)
  const [picturePreparing, setPicturePreparing] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [confirmUsername, setConfirmUsername] = useState('')
  const [confirmCode, setConfirmCode] = useState('')
  const [resendMessage, setResendMessage] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!pictureFile) {
      setPicturePreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(pictureFile)
    setPicturePreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pictureFile])

  const clearPicture = () => {
    setPictureFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handlePictureChange = (file: File | null) => {
    setError(null)
    if (!file) {
      clearPicture()
      return
    }
    const validationError = validateAvatarFile(file)
    if (validationError) {
      setError(validationError)
      clearPicture()
      return
    }
    setPicturePreparing(true)
    void prepareAvatarFile(file)
      .then((prepared) => {
        setPictureFile(prepared)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Could not process this image.')
        clearPicture()
      })
      .finally(() => setPicturePreparing(false))
  }

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
    const passwordError = getPasswordValidationError(password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    setBusy(true)
    try {
      let uploadedPictureUrl: string | null = null
      if (pictureFile) {
        uploadedPictureUrl = await uploadAvatarFile(pictureFile)
      }

      const displayName = `${firstName.trim()} ${lastName.trim()}`.trim()
      const attrs: Record<string, string> = {
        email: emailNorm,
        given_name: firstName.trim(),
        family_name: lastName.trim(),
        name: displayName,
      }
      if (uploadedPictureUrl) attrs.picture = uploadedPictureUrl

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
      if (isUsernameExistsError(e)) {
        setConfirmUsername(emailNorm)
        setConfirmCode('')
        setResendMessage(null)
        setStep('confirm')
        setError(null)
        try {
          await resendSignUpCode({ username: emailNorm })
          setResendMessage(
            'An account with this email already exists. If you have not verified yet, we sent a new code.',
          )
        } catch {
          setResendMessage(
            'An account with this email already exists. Enter your verification code, or resend one below.',
          )
        }
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
              Your profile (name, email, optional picture) is stored in Cognito. We emailed a verification code during
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
        <ConfirmEmailCard
          email={confirmUsername}
          confirmCode={confirmCode}
          onConfirmCodeChange={setConfirmCode}
          busy={busy}
          error={error}
          resendMessage={resendMessage}
          onConfirm={() => void handleConfirm()}
          onResend={() => void handleResend()}
          onBack={() => {
            setStep('form')
            setError(null)
            setResendMessage(null)
          }}
          backLabel="Back to form"
        />
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already verified?{' '}
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            Log in
          </Link>
        </p>
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
            <Label htmlFor="picture">Profile picture (optional)</Label>
            <div className="flex items-center gap-4">
              <UserAvatar
                className="h-16 w-16 rounded-2xl border border-border/80 shrink-0"
                fallbackClassName="rounded-2xl bg-primary/15 text-sm font-semibold text-primary"
                pictureUrl={picturePreviewUrl}
                displayName={`${firstName} ${lastName}`.trim()}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <input
                  ref={fileInputRef}
                  id="picture"
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
                    disabled={busy || picturePreparing}
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
                      disabled={busy}
                      onClick={clearPicture}
                    >
                      <X className="h-4 w-4" />
                      Remove
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  JPEG, PNG, WebP, or GIF. Large photos are compressed to 2 MB before upload.
                </p>
              </div>
            </div>
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
            <p className="text-xs text-muted-foreground">{PASSWORD_REQUIREMENTS_HELP}</p>
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
            {busy ? (pictureFile ? 'Uploading & creating account…' : 'Creating account…') : 'Sign up'}
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
