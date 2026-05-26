import { apiJson } from '@/lib/api'

/** Must match backend ADMIN_EMAILS default. */
export const ADMIN_EMAIL = 'praneeth2004.raghava@gmail.com'

export function isAdminEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase()
}

export async function wipeDatabase(): Promise<void> {
  await apiJson<void>('/admin/wipe-database', {
    method: 'POST',
    body: JSON.stringify({ confirm: 'WIPE_ALL_DATA' }),
  })
}
