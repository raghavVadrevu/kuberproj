export const VAULT_LAST_SEEN_KEY = 'huddle:vaultLastSeenAt'

export function getVaultLastSeenMs(): number {
  const raw = localStorage.getItem(VAULT_LAST_SEEN_KEY)
  if (!raw) return Date.now()
  const n = Number(raw)
  return Number.isFinite(n) ? n : Date.now()
}

export function markVaultSeen(): void {
  localStorage.setItem(VAULT_LAST_SEEN_KEY, String(Date.now()))
}
