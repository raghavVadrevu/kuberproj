import { fetchAuthSession, updateUserAttributes } from 'aws-amplify/auth'

export async function updateCognitoProfile(attrs: {
  givenName: string
  familyName: string
  pictureUrl?: string | null
}): Promise<void> {
  const given = attrs.givenName.trim()
  const family = attrs.familyName.trim()
  const display = `${given} ${family}`.trim()

  const userAttributes: Record<string, string> = {
    given_name: given,
    family_name: family,
    name: display,
  }
  if (attrs.pictureUrl?.trim()) {
    userAttributes.picture = attrs.pictureUrl.trim()
  }

  await updateUserAttributes({ userAttributes })
  await fetchAuthSession({ forceRefresh: true })
}
