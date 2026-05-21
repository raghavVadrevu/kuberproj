/** Maps common Cognito error codes to short UI copy. */
export function formatCognitoError(err: unknown): string {
  if (!err || typeof err !== 'object' || !('name' in err)) {
    return 'Something went wrong. Try again.'
  }
  const name = String((err as { name: unknown }).name)
  const message =
    typeof (err as { message?: unknown }).message === 'string'
      ? (err as { message: string }).message
      : ''

  const known: Record<string, string> = {
    UsernameExistsException: 'An account with this email already exists.',
    UserNotConfirmedException:
      'This email is not verified yet. Finish signup with the code we sent (check spam), or resend from signup.',
    NotAuthorizedException: 'Incorrect email or password.',
    InvalidPasswordException: 'Password does not meet your pool policy.',
    InvalidParameterException: message || 'Check your email format and user pool attributes.',
    LimitExceededException: 'Too many attempts. Wait and try again.',
    CodeMismatchException: 'That code is wrong or expired.',
    PasswordResetRequiredException: 'You must reset your password in Cognito before signing in.',
    TooManyRequestsException: 'Too many requests. Wait a moment and try again.',
    UserNotFoundException: 'No user found for that email.',
    InvalidPreferredChallenge: message || 'This sign-in option is not allowed for your app client.',
  }

  return known[name] || message || 'Something went wrong. Try again.'
}
