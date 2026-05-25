import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const VERIFICATION_SPAM_HINT =
  "If you don't see the email, check your spam or junk folder."

type ConfirmEmailCardProps = {
  email: string
  confirmCode: string
  onConfirmCodeChange: (value: string) => void
  busy: boolean
  error: string | null
  resendMessage: string | null
  onConfirm: () => void
  onResend: () => void
  onBack: () => void
  backLabel?: string
  intro?: string
}

export default function ConfirmEmailCard({
  email,
  confirmCode,
  onConfirmCodeChange,
  busy,
  error,
  resendMessage,
  onConfirm,
  onResend,
  onBack,
  backLabel = 'Back',
  intro,
}: ConfirmEmailCardProps) {
  return (
    <Card className="w-full glass border-primary/20 shadow-xl">
      <CardHeader>
        <CardTitle className="text-base">Confirm your email</CardTitle>
        <p className="text-sm text-muted-foreground">
          {intro ? (
            <>
              {intro}{' '}
              <span className="font-medium text-foreground">{email}</span>.
            </>
          ) : (
            <>
              Enter the verification code sent to{' '}
              <span className="font-medium text-foreground">{email}</span>.
            </>
          )}
        </p>
        <p className="text-xs text-muted-foreground">{VERIFICATION_SPAM_HINT}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {resendMessage ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">{resendMessage}</p>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={confirmCode}
            onChange={(e) => onConfirmCodeChange(e.target.value)}
            className="font-mono"
          />
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button className="w-full" disabled={busy} onClick={onConfirm}>
          {busy ? 'Checking…' : 'Confirm and continue'}
        </Button>
        <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={onResend}>
          Resend code
        </Button>
        <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={onBack}>
          {backLabel}
        </Button>
      </CardContent>
    </Card>
  )
}
