/** Maps common Cognito error codes to short UI copy. */

/** Shown under password fields and when Cognito rejects a weak password. */
export const PASSWORD_REQUIREMENTS_HELP =
  'Use at least 8 characters with uppercase and lowercase letters, a number, and a symbol (e.g. ! @ # $). Avoid common words and your email.'

export function cognitoErrorName(err: unknown): string | null {
  if (!err || typeof err !== 'object' || !('name' in err)) return null
  return String((err as { name: unknown }).name)
}

function cognitoErrorMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return ''
  return typeof (err as { message?: unknown }).message === 'string'
    ? (err as { message: string }).message
    : ''
}

export function isUsernameExistsError(err: unknown): boolean {
  return cognitoErrorName(err) === 'UsernameExistsException'
}

export function isUserNotConfirmedError(err: unknown): boolean {
  if (cognitoErrorName(err) === 'UserNotConfirmedException') return true
  const message = cognitoErrorMessage(err).toLowerCase()
  return message.includes('not confirmed') || message.includes('not verified')
}

export function isPasswordPolicyError(err: unknown): boolean {
  const name = cognitoErrorName(err)
  if (name === 'InvalidPasswordException') return true
  const message = cognitoErrorMessage(err).toLowerCase()
  if (!message) return false
  return (
    message.includes('password did not conform') ||
    message.includes('password policy') ||
    message.includes('invalid password') ||
    (name === 'InvalidParameterException' && message.includes('password'))
  )
}

/** Client-side check aligned with typical Cognito password rules. */
export function getPasswordValidationError(password: string): string | null {
  const missing: string[] = []
  if (password.length < 8) missing.push('at least 8 characters')
  if (!/[a-z]/.test(password)) missing.push('a lowercase letter')
  if (!/[A-Z]/.test(password)) missing.push('an uppercase letter')
  if (!/[0-9]/.test(password)) missing.push('a number')
  if (!/[^A-Za-z0-9]/.test(password)) missing.push('a symbol (e.g. ! @ # $)')

  if (missing.length === 0) return null

  const list =
    missing.length === 1
      ? missing[0]!
      : missing.length === 2
        ? `${missing[0]} and ${missing[1]}`
        : `${missing.slice(0, -1).join(', ')}, and ${missing[missing.length - 1]}`

  return `Your password needs ${list}. Pick something hard to guess—avoid your name or email.`
}

function parseCognitoPasswordHint(message: string): string | null {
  const lower = message.toLowerCase()
  if (lower.includes('symbol')) return 'Include a symbol (e.g. ! @ # $).'
  if (lower.includes('uppercase')) return 'Include an uppercase letter (A–Z).'
  if (lower.includes('lowercase')) return 'Include a lowercase letter (a–z).'
  if (lower.includes('numeric') || lower.includes('number')) return 'Include a number (0–9).'
  if (lower.includes('length') || lower.includes('minimum')) return 'Use at least 8 characters.'
  return null
}

export function formatPasswordPolicyError(err: unknown): string {
  const hint = parseCognitoPasswordHint(cognitoErrorMessage(err))
  if (hint) return `${hint} ${PASSWORD_REQUIREMENTS_HELP}`
  return PASSWORD_REQUIREMENTS_HELP
}

function sanitizeCognitoMessage(message: string): string {
  const lower = message.toLowerCase()
  if (
    lower.includes('user pool') ||
    lower.includes('userpool') ||
    lower.includes('pool policy') ||
    lower.includes('cognito')
  ) {
    return 'Check your email and the details you entered, then try again.'
  }
  return message
}

export function formatCognitoError(err: unknown): string {
  if (isPasswordPolicyError(err)) {
    return formatPasswordPolicyError(err)
  }

  const name = cognitoErrorName(err)
  const message = cognitoErrorMessage(err)

  if (!name) {
    if (message) return sanitizeCognitoMessage(message)
    return 'Something went wrong. Try again.'
  }

  const known: Record<string, string> = {
    UsernameExistsException:
      'An account with this email already exists. If you have not verified yet, enter the code we sent or resend one.',
    UserNotConfirmedException:
      'This email is not verified yet. Enter the verification code we sent (check spam), or resend a new code.',
    NotAuthorizedException: 'Incorrect email or password.',
    LimitExceededException: 'Too many attempts. Wait and try again.',
    CodeMismatchException: 'That code is wrong or expired.',
    PasswordResetRequiredException:
      'You need to reset your password before signing in. Use “Forgot password?” on the login page.',
    TooManyRequestsException: 'Too many requests. Wait a moment and try again.',
    UserNotFoundException: 'No user found for that email.',
    InvalidPreferredChallenge:
      message && !message.toLowerCase().includes('user pool')
        ? message
        : 'This sign-in option is not available. Try email and password instead.',
    InvalidParameterException: message
      ? sanitizeCognitoMessage(message)
      : 'Check your email and the details you entered, then try again.',
  }

  if (known[name]) return known[name]

  if (message) return sanitizeCognitoMessage(message)
  return 'Something went wrong. Try again.'
}
