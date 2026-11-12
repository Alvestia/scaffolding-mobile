import { useQuery } from '@tanstack/react-query'
import {
  cacheMyActivities,
  fetchMyExecutionEntries,
  getCachedMyActivities,
  listDeviceActivities,
  rowToActivity,
} from '@/services/my-day.service'
import { useAuthStore } from '@/store/auth-store'
import { useConnectivityStore } from '@/store/connectivity-store'
import { mergeActivities, type MyDayActivity } from '@/utils/my-day'
import { canUseOfflineFallback } from '@/utils/offline-fallback'

type Scope = { contractId: string | null; unitId: string | null }

export type MyDayData = {
  activities: MyDayActivity[]
  /** False when the sent entries come from the copy kept on the phone. */
  live: boolean
  /** When the copy on the phone was taken; null when there is none. */
  savedAt: string | null
  /** The server cut a very long list. */
  truncated: boolean
}

/** Entries of the signed-in person in the period, sent or still on the phone. */
export function useMyDay(
  scope: Scope,
  range: { from: string; to: string },
  options: { enabled?: boolean } = {},
) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const isConnected = useConnectivityStore((state) => state.isConnected)

  return useQuery({
    queryKey: ['my-day', scope.contractId, scope.unitId, range.from, range.to, isConnected],
    enabled:
      (options.enabled ?? true) &&
      isHydrated &&
      Boolean(accessToken && scope.contractId && scope.unitId),
    queryFn: async (): Promise<MyDayData> => {
      if (!scope.contractId || !scope.unitId) {
        return { activities: [], live: true, savedAt: null, truncated: false }
      }
      const current = { contractId: scope.contractId, unitId: scope.unitId }
      const onDevice = await listDeviceActivities(current)

      const fromCache = async (): Promise<MyDayData> => {
        const cached = await getCachedMyActivities(current, range)
        return {
          activities: mergeActivities(cached?.activities ?? [], onDevice),
          live: false,
          savedAt: cached?.fetchedAt ?? null,
          truncated: false,
        }
      }

      if (!isConnected) return fromCache()
      try {
        const data = await fetchMyExecutionEntries(current, range)
        const sent = data.items
          .map(rowToActivity)
          .filter((activity): activity is MyDayActivity => activity !== null)
        // A failed copy only costs the offline view of this period.
        await cacheMyActivities(current, range, sent).catch(() => undefined)
        return {
          activities: mergeActivities(sent, onDevice),
          live: true,
          savedAt: null,
          truncated: data.truncated,
        }
      } catch (error) {
        if (!canUseOfflineFallback(error)) throw error
        return fromCache()
      }
    },
  })
}
