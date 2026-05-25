import { AVATAR_INPUT_MAX_BYTES, AVATAR_TARGET_BYTES, compressAvatarToMaxBytes } from '@/lib/avatar-image'
import { getApiBase } from '@/lib/api'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

export const AVATAR_MAX_BYTES = AVATAR_TARGET_BYTES

export type AvatarPresignResponse = {
  upload_url: string
  public_url: string
  key: string
  content_type: string
  max_bytes: number
}

export function validateAvatarFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    return 'Choose a JPEG, PNG, WebP, or GIF image.'
  }
  if (file.size > AVATAR_INPUT_MAX_BYTES) {
    return 'Image must be 30 MB or smaller.'
  }
  return null
}

/** Validate type and compress to at most 2 MB when needed. */
export async function prepareAvatarFile(file: File): Promise<File> {
  const validationError = validateAvatarFile(file)
  if (validationError) throw new Error(validationError)
  return compressAvatarToMaxBytes(file, AVATAR_TARGET_BYTES)
}

async function presignAvatar(
  body: { content_type: string; content_length: number },
  authenticated: boolean,
): Promise<AvatarPresignResponse> {
  const path = authenticated ? '/uploads/presign-avatar/me' : '/uploads/presign-avatar'
  const url = `${getApiBase()}${path}`
  const headers = new Headers({ 'Content-Type': 'application/json' })

  if (authenticated) {
    const { fetchAuthSession } = await import('aws-amplify/auth')
    const session = await fetchAuthSession()
    const token = session.tokens?.idToken?.toString()
    if (!token) throw new Error('Not signed in')
    headers.set('Authorization', `Bearer ${token}`)
  }

  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.")
  }

  const text = await res.text()
  if (!res.ok) {
    let msg = text
    try {
      const j = JSON.parse(text) as { detail?: unknown }
      if (typeof j.detail === 'string') msg = j.detail
    } catch {
      /* keep text */
    }
    throw new Error(msg || 'Could not prepare upload.')
  }

  return JSON.parse(text) as AvatarPresignResponse
}

export async function uploadAvatarFile(
  file: File,
  options?: { authenticated?: boolean },
): Promise<string> {
  const prepared = await prepareAvatarFile(file)

  const presign = await presignAvatar(
    { content_type: prepared.type, content_length: prepared.size },
    options?.authenticated ?? false,
  )

  let uploadRes: Response
  try {
    uploadRes = await fetch(presign.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': presign.content_type },
      body: prepared,
    })
  } catch {
    throw new Error('Upload failed. Check your connection and try again.')
  }

  if (!uploadRes.ok) {
    throw new Error('Upload failed. Try a different image.')
  }

  return presign.public_url
}
