import { useEffect } from 'react'
import { Redirect } from 'expo-router'
import { LoadingScreen } from '@/components/ui/loading-screen'
import { useOrganizationScope } from '@/hooks/use-organization-scope'
import { isOrganizationContextAllowed } from '@/services/organization-scope.service'
import { useAuthStore } from '@/store/auth-store'
import { useConnectivityStore } from '@/store/connectivity-store'
import { useOperationalContextStore } from '@/store/operational-context-store'

export default function IndexPage() {
  const user = useAuthStore((state) => state.user)
  const accessToken = useAuthStore((state) => state.accessToken)
  const isConnected = useConnectivityStore((state) => state.isConnected)
  const { contractId, unitId } = useOperationalContextStore()
  const resetContext = useOperationalContextStore((state) => state.reset)
  const scopeQuery = useOrganizationScope()

  const hasPersistedContext = Boolean(unitId && contractId)
  const allowOfflineFullAccessContext =
    !isConnected &&
    Boolean(scopeQuery.data?.hasFullTenantAccess) &&
    !scopeQuery.data?.units.length &&
    !scopeQuery.data?.contracts.length
  const contextAllowed =
    allowOfflineFullAccessContext ||
    isOrganizationContextAllowed(scopeQuery.data, { unitId, contractId })

  useEffect(() => {
    if (!accessToken || !user || !hasPersistedContext) {
      return
    }

    if (scopeQuery.isLoading || scopeQuery.isFetching) {
      return
    }

    if (scopeQuery.error || !contextAllowed) {
      resetContext()
    }
  }, [
    accessToken,
    contextAllowed,
    hasPersistedContext,
    resetContext,
    scopeQuery.error,
    scopeQuery.isFetching,
    scopeQuery.isLoading,
    user,
  ])

  if (!accessToken || !user) {
    return <Redirect href="/(auth)/login" />
  }

  if (!unitId) {
    return <Redirect href={'/(app)/context/unit' as never} />
  }

  if (!contractId) {
    return (
      <Redirect
        href={{
          pathname: '/(app)/context/contract',
          params: { unitId },
        } as never}
      />
    )
  }

  if (scopeQuery.isLoading || scopeQuery.isFetching) {
    return <LoadingScreen />
  }

  if (scopeQuery.error || !contextAllowed) {
    return <Redirect href={'/(app)/context/unit' as never} />
  }

  return <Redirect href="/(app)/(tabs)" />
}
