import { deleteUser, signOut } from 'aws-amplify/auth'

import { apiJson } from '@/lib/api'

/** Remove app data, delete Cognito user, and sign out locally. */
export async function deleteAccount(): Promise<void> {
  await apiJson('/me', { method: 'DELETE' })
  try {
    await deleteUser()
  } catch {
    /* Cognito user may already be gone */
  }
  try {
    await signOut({ global: true })
  } catch {
    /* session may already be cleared */
  }
}
