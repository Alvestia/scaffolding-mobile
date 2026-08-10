import { useQuery } from '@tanstack/react-query'
import { useConnectivityStore } from '@/store/connectivity-store'
import { fetchCrews, getCachedCrews } from '@/services/crews.service'

type Scope = {
  contractId: string | null
  unitId: string | null
}

export function useCrews(scope: Scope) {
  const isConnected = useConnectivityStore((state) => state.isConnected)

  return useQuery({
    queryKey: ['crews', scope.contractId, scope.unitId, isConnected],
    enabled: Boolean(scope.contractId && scope.unitId),
    queryFn: async () => {
      if (!scope.contractId || !scope.unitId) {
        return []
      }

      if (!isConnected) {
        return getCachedCrews(scope.contractId)
      }

      try {
        return await fetchCrews({
          contractId: scope.contractId,
          unitId: scope.unitId,
        })
      } catch (error) {
        const cached = await getCachedCrews(scope.contractId)
        if (cached.length > 0) {
          return cached
        }

        throw error
      }
    },
  })
}
