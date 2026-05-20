import type { JWT } from '@aws-amplify/core'

/** Fields we show on Profile from the Cognito ID token (after login). */
export type CognitoProfileSummary = {
  sub: string
  email: string | null
  displayName: string
}

export function summaryFromIdToken(payload: JWT['payload']): CognitoProfileSummary {
  const sub = typeof payload.sub === 'string' ? payload.sub : ''
  const email = typeof payload.email === 'string' ? payload.email : null

  let displayName = 'Member'
  if (typeof payload.name === 'string' && payload.name.trim()) {
    displayName = payload.name.trim()
  } else {
    const given = typeof payload.given_name === 'string' ? payload.given_name : ''
    const family = typeof payload.family_name === 'string' ? payload.family_name : ''
    const combined = `${given} ${family}`.trim()
    if (combined) displayName = combined
  }

  return { sub, email, displayName }
}
