import { toast } from 'sonner'

import { ApiError, NetworkError } from '@/lib/api'

const DETAIL_PHRASES: Array<{ test: RegExp; message: string }> = [
  { test: /not signed in/i, message: 'Please sign in again to continue.' },
  { test: /not a member/i, message: "You're not in this group." },
  { test: /group not found/i, message: "That group doesn't exist or was removed." },
  { test: /group owner only/i, message: 'Only the group owner can do that.' },
  { test: /friendship required|must be friends/i, message: 'You need to be friends with them first.' },
  { test: /already friends/i, message: "You're already friends." },
  { test: /request not found/i, message: 'That friend request is no longer available.' },
  { test: /poll not found/i, message: 'That poll is no longer available.' },
  { test: /expense not found/i, message: 'That expense is no longer available.' },
  { test: /already settled/i, message: 'That expense is already marked settled.' },
  { test: /at least two non-empty options/i, message: 'Add at least two options for the poll.' },
  { test: /option labels must be unique/i, message: 'Each poll option needs a different name.' },
  { test: /invalid category/i, message: 'Pick a valid expense category.' },
  { test: /payer must be a member/i, message: 'The person who paid must be in the group.' },
  { test: /payer must be included/i, message: 'Include whoever paid in the split.' },
  { test: /participant not in group/i, message: 'Everyone in the split must be in the group.' },
  { test: /pick at least two people/i, message: 'Choose at least two people for the split.' },
  { test: /username exists/i, message: 'An account with this email already exists.' },
]

function looksLikeDevMessage(msg: string): boolean {
  const t = msg.trim()
  if (!t) return true
  if (t.startsWith('{') || t.startsWith('[')) return true
  if (t.length > 140) return true
  return /traceback|exception|sql|psycopg|undefined is not|internal server|stack/i.test(t)
}

function mapDetailPhrase(raw: string): string | null {
  for (const { test, message } of DETAIL_PHRASES) {
    if (test.test(raw)) return message
  }
  return null
}

function mapHttpStatus(status: number, raw: string): string {
  const fromPhrase = mapDetailPhrase(raw)
  if (fromPhrase) return fromPhrase

  switch (status) {
    case 400:
      return looksLikeDevMessage(raw)
        ? "Something wasn't right with that request. Check your info and try again."
        : raw
    case 401:
      return 'Your session expired. Please sign in again.'
    case 403:
      return "You don't have permission to do that."
    case 404:
      return "We couldn't find what you're looking for."
    case 409:
      return 'That conflicts with something that already exists.'
    case 422:
      return "Some of that info wasn't valid. Double-check and try again."
    case 429:
      return 'Too many tries. Wait a minute and try again.'
    default:
      if (status >= 500) {
        return 'Something went wrong on our side. Try again in a moment.'
      }
      if (raw && !looksLikeDevMessage(raw)) return raw
      return "That didn't work. Try again."
  }
}

/** Turn API/network errors into short, user-friendly copy. */
export function getUserErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof NetworkError) {
    return error.message
  }
  if (error instanceof ApiError) {
    return mapHttpStatus(error.status, error.message)
  }
  if (error instanceof Error && error.message) {
    if (looksLikeDevMessage(error.message)) return fallback
    const mapped = mapDetailPhrase(error.message)
    if (mapped) return mapped
    return error.message
  }
  return fallback
}

export function toastUserError(error: unknown, fallback: string): void {
  toast.error(getUserErrorMessage(error, fallback))
}

/** WebSocket / chat server error strings. */
export function formatChatError(detail: string): string {
  if (!detail || looksLikeDevMessage(detail)) {
    return "Can't connect to chat right now. Try again in a moment."
  }
  if (/message type/i.test(detail)) {
    return "Can't connect to chat right now. Try again in a moment."
  }
  const mapped = mapDetailPhrase(detail)
  return mapped ?? detail
}
