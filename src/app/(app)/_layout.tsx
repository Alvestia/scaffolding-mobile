import { useEffect } from 'react'
import { AppState } from 'react-native'
import { Redirect, Stack } from 'expo-router'
import { queryClient } from '@/providers/app-providers'
import { prefetchScopedReferenceData } from '@/services/catalog-preload.service'
import { useAuthStore } from '@/store/auth-store'
import { useConnectivityStore } from '@/store/connectivity-store'
import { useOperationalContextStore } from '@/store/operational-context-store'

export default function AppLayout() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const user = useAuthStore((state) => state.user)
  const enforceSessionExpiry = useAuthStore((state) => state.enforceSessionExpiry)
  const isConnected = useConnectivityStore((state) => state.isConnected)
  const contractId = useOperationalContextStore((state) => state.contractId)
  const unitId = useOperationalContextStore((state) => state.unitId)
  const companyId = useOperationalContextStore((state) => state.companyId)

  useEffect(() => {
    // A sessão de turno vence só quando o app volta ao primeiro plano, sem interromper um registro em andamento.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      void enforceSessionExpiry()
        .then((expired) => {
          if (expired) queryClient.clear()
        })
        .catch(() => {
          // Falha ao ler o prazo mantém a sessão; a próxima abertura do app verifica novamente.
        })
    })
    return () => subscription.remove()
  }, [enforceSessionExpiry])

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
