import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchLatestScaffold,
  getCachedLatestScaffold,
  type LatestScaffoldSnapshot,
} from '@/services/scaffolds.service'
import { useAuthStore } from '@/store/auth-store'
import { useConnectivityStore } from '@/store/connectivity-store'

type Scope = {
  contractId: string | null
  unitId: string | null
}

export type LatestScaffoldData = {
  snapshot: LatestScaffoldSnapshot
  source: 'remote' | 'cache'
}

export function useLatestScaffold(scope: Scope) {
  const queryClient = useQueryClient()
  const accessToken = useAuthStore((state) => state.accessToken)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const isConnected = useConnectivityStore((state) => state.isConnected)
  const enabled = isHydrated && Boolean(accessToken && scope.contractId && scope.unitId)
  const cacheQueryKey = ['latest-scaffold', 'cache', scope.contractId, scope.unitId] as const

  const cacheQuery = useQuery<LatestScaffoldSnapshot | null>({
    queryKey: cacheQueryKey,
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      if (!scope.contractId || !scope.unitId) {
        return null
      }

      return getCachedLatestScaffold({
        contractId: scope.contractId,
        unitId: scope.unitId,
      })
    },
  })

  const remoteQuery = useQuery<LatestScaffoldSnapshot>({
    queryKey: ['latest-scaffold', 'remote', scope.contractId, scope.unitId],
    enabled: enabled && isConnected,
    staleTime: 0,
    queryFn: async () => {
      if (!scope.contractId || !scope.unitId) {
        throw new Error('Contexto do contrato não definido.')
      }

      const snapshot = await fetchLatestScaffold({
        contractId: scope.contractId,
        unitId: scope.unitId,
      })
      queryClient.setQueryData(cacheQueryKey, snapshot)
      return snapshot
    },
  })
  const refetchCache = cacheQuery.refetch
  const refetchRemote = remoteQuery.refetch

  const refetch = useCallback(async () => {
    if (isConnected) {
      return refetchRemote()
    }

    return refetchCache()
  }, [isConnected, refetchCache, refetchRemote])

  const snapshot = remoteQuery.data ?? cacheQuery.data ?? null
  const data: LatestScaffoldData | null = snapshot
    ? {
        snapshot,
        source: isConnected && remoteQuery.data ? 'remote' : 'cache',
      }
    : null

  return {
    data,
    error: data ? null : (remoteQuery.error ?? cacheQuery.error),
    isLoading: !data && (cacheQuery.isLoading || (isConnected && remoteQuery.isLoading)),
    isFetching: cacheQuery.isFetching || remoteQuery.isFetching,
    refetch,
  }
}
