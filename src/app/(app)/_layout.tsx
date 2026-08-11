import { useEffect } from 'react'
import { Redirect, Stack } from 'expo-router'
import { prefetchScopedReferenceData } from '@/services/catalog-preload.service'
import { useAuthStore } from '@/store/auth-store'
import { useConnectivityStore } from '@/store/connectivity-store'
import { useOperationalContextStore } from '@/store/operational-context-store'

export default function AppLayout() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const user = useAuthStore((state) => state.user)
  const isConnected = useConnectivityStore((state) => state.isConnected)
  const contractId = useOperationalContextStore((state) => state.contractId)
  const unitId = useOperationalContextStore((state) => state.unitId)
  const companyId = useOperationalContextStore((state) => state.companyId)

  useEffect(() => {
    if (!accessToken || !user || !isConnected || !contractId || !unitId) {
      return
    }

    void prefetchScopedReferenceData({ contractId, unitId, companyId }).catch(() => {
      // A atualização em segundo plano não deve bloquear a navegação nem apagar o cache anterior.
    })
  }, [accessToken, companyId, contractId, isConnected, unitId, user])

  if (!accessToken || !user) {
    return <Redirect href="/(auth)/login" />
  }

  return <Stack screenOptions={{ headerShown: false }} />
}
