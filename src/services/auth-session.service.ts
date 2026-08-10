import {
  clearOrganizationScopeCache,
  fetchAuthoritativeOrganizationScope,
} from '@/services/organization-scope.service'
import type { AuthUser } from '@/types/auth'

export async function refreshAuthenticatedSessionAccess(user: AuthUser) {
  await clearOrganizationScopeCache(user)
  const { user: resolvedUser } = await fetchAuthoritativeOrganizationScope()
  return resolvedUser
}
