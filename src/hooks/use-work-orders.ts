import { useQuery } from '@tanstack/react-query'
import { useConnectivityStore } from '@/store/connectivity-store'
import { fetchWorkOrders, getCachedWorkOrders } from '@/services/work-orders.service'

type Filters = {
  contractId?: string | null
  unitId?: string | null
  projectId?: string | null
}

export function useWorkOrders(filters: Filters) {
  const isConnected = useConnectivityStore((state) => state.isConnected)

  return useQuery({
    queryKey: ['work-orders', filters.contractId, filters.unitId, filters.projectId, isConnected],
    enabled: Boolean(filters.unitId && filters.contractId),
    queryFn: async () => {
      if (!filters.unitId || !filters.contractId) {
        return []
      }

      if (!isConnected) {
        return getCachedWorkOrders(filters)
      }

      try {
        return await fetchWorkOrders(filters)
      } catch (error) {
        const cached = await getCachedWorkOrders(filters)
        if (cached.length > 0) {
          return cached
        }

        throw error
      }
    },
  })
}
