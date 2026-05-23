/** @deprecated Vault badges use per-group nav ack (`nav-ack.ts`). */
export function getVaultLastSeenMs(): number {
  return Date.now()
}

/** @deprecated */
export function markVaultSeen(): void {
  /* handled by NavBadgesContext when visiting /vault */
}
