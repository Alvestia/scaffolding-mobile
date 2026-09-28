import { canUseOfflineFallback } from '@/utils/offline-fallback'
import { useQuery } from '@tanstack/react-query'
import { useConnectivityStore } from '@/store/connectivity-store'
import { fetchAreas, getCachedAreas } from '@/services/areas.service'

type Filters = {
  companyId?: string | null
  unitId?: string | null
  contractId?: string | null
  projectId?: string | null
}

export function useAreas(filters: Filters) {
  const isConnected = useConnectivityStore((state) => state.isConnected)

  return useQuery({
    queryKey: [
      'areas',
      filters.companyId,
      filters.unitId,
      filters.contractId,
      filters.projectId,
      isConnected,
    ],
    enabled: Boolean(filters.unitId && filters.contractId),
    queryFn: async () => {
      if (!filters.unitId || !filters.contractId) {
        return []
      }

      if (!isConnected) {
        return getCachedAreas(filters)
      }

      try {
        return await fetchAreas(filters)
      } catch (error) {
        if (!canUseOfflineFallback(error)) throw error
        const cached = await getCachedAreas(filters)
        if (cached.length > 0) {
          return cached
        }

        throw error
      }
    },
  })
}
