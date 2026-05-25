import type { JWT } from '@aws-amplify/core'

/** Fields we show on Profile from the signed-in account. */
export type CognitoProfileSummary = {
  sub: string
  email: string | null
  displayName: string
  givenName: string
  familyName: string
  pictureUrl: string | null
}

export function summaryFromIdToken(payload: JWT['payload']): CognitoProfileSummary {
  const sub = typeof payload.sub === 'string' ? payload.sub : ''
  const email = typeof payload.email === 'string' ? payload.email : null

  const given =
    typeof payload.given_name === 'string' ? payload.given_name.trim() : ''
  const family =
    typeof payload.family_name === 'string' ? payload.family_name.trim() : ''

  let displayName = 'Member'
  if (typeof payload.name === 'string' && payload.name.trim()) {
    displayName = payload.name.trim()
  } else {
    const combined = `${given} ${family}`.trim()
    if (combined) displayName = combined
  }

  const pictureUrl =
    typeof payload.picture === 'string' && payload.picture.trim() ? payload.picture.trim() : null

  return { sub, email, displayName, givenName: given, familyName: family, pictureUrl }
}
