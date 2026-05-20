import { Amplify } from 'aws-amplify'
import type { CognitoUserPoolConfig } from '@aws-amplify/core'

/** Accept issuer URL or JWKS URL (strip `/.well-known/jwks.json` if pasted by mistake). */
export function normalizeCognitoIssuerOrJwksUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\/\.well-known\/jwks\.json\/?$/i, '')
    .replace(/\/+$/, '')
}

export function parseCognitoIssuer(issuer: string): { region: string; userPoolId: string } | null {
  try {
    const u = new URL(normalizeCognitoIssuerOrJwksUrl(issuer))
    const segments = u.pathname.replace(/^\//, '').split('/').filter(Boolean)
    if (segments.length !== 1) return null
    const userPoolId = segments[0]
    const host = u.hostname.match(/^cognito-idp\.([^.]+)\.amazonaws\.com$/)
    if (!host) return null
    return { region: host[1], userPoolId }
  } catch {
    return null
  }
}

export type CognitoEnv = {
  userPoolId: string
  userPoolClientId: string
}

export function getCognitoEnv(): CognitoEnv | null {
  const issuerRaw = import.meta.env.VITE_COGNITO_ISSUER
  const issuer = issuerRaw ? normalizeCognitoIssuerOrJwksUrl(issuerRaw) : undefined
  const explicitPool = import.meta.env.VITE_COGNITO_USER_POOL_ID?.trim()
  const clientId =
    import.meta.env.VITE_COGNITO_CLIENT_ID?.trim() ||
    import.meta.env.VITE_COGNITO_AUDIENCE?.trim()

  let userPoolId: string | undefined
  if (issuer) {
    const parsed = parseCognitoIssuer(issuer)
    if (parsed) userPoolId = parsed.userPoolId
  }
  if (!userPoolId && explicitPool) userPoolId = explicitPool

  if (!userPoolId || !clientId) return null
  return { userPoolId, userPoolClientId: clientId }
}

export function isCognitoConfigured(): boolean {
  return getCognitoEnv() !== null
}

export function configureAmplify(): void {
  const env = getCognitoEnv()
  if (!env) return

  const cognito: CognitoUserPoolConfig = {
    userPoolId: env.userPoolId,
    userPoolClientId: env.userPoolClientId,
    loginWith: {
      email: true,
      username: true,
    },
  }

  Amplify.configure({
    Auth: {
      Cognito: cognito,
    },
  })
}
