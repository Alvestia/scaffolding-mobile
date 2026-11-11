import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchAvailabilityMap,
  fetchInspectionPack,
  getCachedAvailabilityMap,
  getCachedInspectionPack,
} from '@/services/inspections.service'
import { useAuthStore } from '@/store/auth-store'
import { useConnectivityStore } from '@/store/connectivity-store'
import { useSyncStore } from '@/store/sync-store'
import type {
  AvailabilityMapItem,
  InspectionSubmissionPayload,
  ManualInspectionPayload,
  ScaffoldInterdictionPayload,
} from '@/types/inspection'
import { OutboxEntityType, type OutboxItem } from '@/types/sync'
import { hasPermission } from '@/utils/inspection-rules'

type Scope = {
  contractId: string | null
  unitId: string | null
}

/**
 * Cached copy first (works offline), replaced by the server copy when online.
 * The cached copy is read again after every sync.
 */
function useCachedRemote<T extends { generatedAt: string }>(options: {
  name: string
  scope: Scope
  permission: string
  readCache: (scope: { contractId: string; unitId: string }) => Promise<T | null>
  fetchRemote: (scope: { contractId: string; unitId: string }) => Promise<T>
}) {
  const { name, scope, permission, readCache, fetchRemote } = options
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const accessToken = useAuthStore((state) => state.accessToken)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const isConnected = useConnectivityStore((state) => state.isConnected)
  const lastSyncAt = useSyncStore((state) => state.lastSyncAt)
  const allowed = hasPermission(user, permission)
  const enabled =
    isHydrated && allowed && Boolean(accessToken && scope.contractId && scope.unitId)
  const cacheKey = [name, 'cache', scope.contractId, scope.unitId] as const

  const cacheQuery = useQuery<T | null>({
    queryKey: [...cacheKey, lastSyncAt],
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () =>
      scope.contractId && scope.unitId
        ? readCache({ contractId: scope.contractId, unitId: scope.unitId })
        : Promise.resolve(null),
  })

  const remoteQuery = useQuery<T>({
    queryKey: [name, 'remote', scope.contractId, scope.unitId],
    enabled: enabled && isConnected,
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      if (!scope.contractId || !scope.unitId) throw new Error('Contexto do contrato não definido.')
      const data = await fetchRemote({ contractId: scope.contractId, unitId: scope.unitId })
      queryClient.setQueryData([...cacheKey, lastSyncAt], data)
      return data
    },
  })

  const refetchRemote = remoteQuery.refetch
  const refetchCache = cacheQuery.refetch
  const refetch = useCallback(
    () => (isConnected ? refetchRemote() : refetchCache()),
    [isConnected, refetchCache, refetchRemote],
  )

  // The sync refreshes the cached copy: after it, the cache can be newer than this screen's request.
  const remote = remoteQuery.data ?? null
  const cached = cacheQuery.data ?? null
  const data =
    remote && cached
      ? Date.parse(cached.generatedAt) > Date.parse(remote.generatedAt)
        ? cached
        : remote
      : (remote ?? cached)
  return {
    allowed,
    data,
    source: data && data === remote ? ('remote' as const) : data ? ('cache' as const) : null,
    error: data ? null : (remoteQuery.error ?? cacheQuery.error),
    remoteError: remoteQuery.error,
    isLoading: !data && (cacheQuery.isLoading || (isConnected && remoteQuery.isLoading)),
    isFetching: cacheQuery.isFetching || remoteQuery.isFetching,
    refetch,
  }
}

export function useInspectionPack(scope: Scope) {
  return useCachedRemote({
    name: 'inspection-pack',
    scope,
    permission: 'inspection:view',
    readCache: getCachedInspectionPack,
    fetchRemote: fetchInspectionPack,
  })
}

/** Availability per scaffold, for warnings outside the inspections tab. */
export function useAvailabilityMap(scope: Scope) {
  const query = useCachedRemote({
    name: 'availability-map',
    scope,
    permission: 'scaffold:view',
    readCache: getCachedAvailabilityMap,
    fetchRemote: fetchAvailabilityMap,
  })
  const byScaffold = useMemo(() => {
    const map = new Map<string, AvailabilityMapItem>()
    if (query.data?.enabled) {
      for (const item of query.data.items) map.set(item.scaffoldId, item)
    }
    return map
  }, [query.data])
  return { ...query, byScaffold }
}

export type PendingInspectionWork = {
  submissions: Map<string, OutboxItem<InspectionSubmissionPayload>>
  interdictions: Map<string, OutboxItem<ScaffoldInterdictionPayload>>
  manual: OutboxItem<ManualInspectionPayload>[]
}

/** What was done on the device and still waits for the server. */
export function usePendingInspectionWork(): PendingInspectionWork {
  const outboxItems = useSyncStore((state) => state.outboxItems)
  return useMemo(() => {
    const submissions = new Map<string, OutboxItem<InspectionSubmissionPayload>>()
    const interdictions = new Map<string, OutboxItem<ScaffoldInterdictionPayload>>()
    const manual: OutboxItem<ManualInspectionPayload>[] = []
    for (const item of outboxItems) {
      if (item.entityType === OutboxEntityType.INSPECTION_SUBMISSION) {
        const typed = item as OutboxItem<InspectionSubmissionPayload>
        submissions.set(typed.payload.inspectionId, typed)
      } else if (item.entityType === OutboxEntityType.SCAFFOLD_INTERDICTION) {
        const typed = item as OutboxItem<ScaffoldInterdictionPayload>
        interdictions.set(typed.payload.scaffoldId, typed)
      } else if (item.entityType === OutboxEntityType.INSPECTION_MANUAL) {
        manual.push(item as OutboxItem<ManualInspectionPayload>)
      }
    }
    return { submissions, interdictions, manual }
  }, [outboxItems])
}
