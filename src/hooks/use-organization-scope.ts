import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth-store'
import { useConnectivityStore } from '@/store/connectivity-store'
import {
  fetchAuthoritativeOrganizationScope,
  getCachedOrganizationScope,
  hasFullTenantAccess,
} from '@/services/organization-scope.service'
import type { OrganizationScopeData } from '@/types/organization-scope'

export function useOrganizationScope() {
  const user = useAuthStore((state) => state.user)
  const setUserProfile = useAuthStore((state) => state.setUserProfile)
  const isConnected = useConnectivityStore((state) => state.isConnected)

  const scopeQuery = useQuery<OrganizationScopeData>({
    queryKey: [
      'organization-scope',
      user?.tenantId,
      user?.id,
      isConnected,
    ],
    enabled: Boolean(user),
    staleTime: 0,
    queryFn: async () => {
      if (!user) {
        return {
          units: [],
          contracts: [],
          hasFullTenantAccess: false,
        }
      }

      if (!isConnected) {
        return getCachedOrganizationScope(user)
      }

      const { user: resolvedUser, scope } = await fetchAuthoritativeOrganizationScope()
      await setUserProfile(resolvedUser)

      return scope
    },
  })

  const fallbackUnits = useMemo(() => user?.accessScope.units ?? [], [user])
  const fallbackContracts = useMemo(() => user?.accessScope.contracts ?? [], [user])

  return {
    ...scopeQuery,
    availableUnits: scopeQuery.error ? [] : scopeQuery.data?.units ?? fallbackUnits,
    availableContracts: scopeQuery.error ? [] : scopeQuery.data?.contracts ?? fallbackContracts,
    hasFullTenantAccess: scopeQuery.data?.hasFullTenantAccess ?? hasFullTenantAccess(user),
  }
}
