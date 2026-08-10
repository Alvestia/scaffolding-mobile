import type { PropsWithChildren } from 'react'
import { useEffect } from 'react'
import { AppState } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { useConnectivityStore } from '@/store/connectivity-store'
import { useSyncStore } from '@/store/sync-store'
import { useAuthStore } from '@/store/auth-store'
import { useOperationalContextStore } from '@/store/operational-context-store'

function triggerAutomaticSync() {
  const { user } = useAuthStore.getState()
  const { isConnected } = useConnectivityStore.getState()
  const { unitId, contractId } = useOperationalContextStore.getState()
  if (!user || !isConnected) return
  void useSyncStore
    .getState()
    .runSyncNow(unitId && contractId ? { unitId, contractId } : undefined)
}

export function NetworkSyncProvider({ children }: PropsWithChildren) {
  const setConnected = useConnectivityStore((state) => state.setConnected)
  const refreshState = useSyncStore((state) => state.refreshState)
  const resetState = useSyncStore((state) => state.resetState)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const user = useAuthStore((state) => state.user)

  useEffect(() => {
    async function bootstrapNetworkState() {
      const state = await NetInfo.fetch()
      setConnected(Boolean(state.isConnected && state.isInternetReachable !== false))
    }

    void bootstrapNetworkState()

    const unsubscribe = NetInfo.addEventListener((state) => {
      const wasConnected = useConnectivityStore.getState().isConnected
      const connected = Boolean(state.isConnected && state.isInternetReachable !== false)
      setConnected(connected)
      if (connected && !wasConnected) triggerAutomaticSync()
    })

    return () => {
      unsubscribe()
    }
  }, [setConnected])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') triggerAutomaticSync()
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (!isHydrated || !user) {
      resetState()
      return
    }

    void refreshState().catch(() => {
      resetState()
    })
  }, [isHydrated, refreshState, resetState, user])

  return children
}
