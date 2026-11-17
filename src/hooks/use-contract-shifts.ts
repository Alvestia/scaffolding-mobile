import { useQuery } from '@tanstack/react-query'
import { fetchContractShifts, getCachedContractShifts } from '@/services/contract-shifts.service'
import { canUseOfflineFallback } from '@/utils/offline-fallback'

export function useContractShifts(
  contractId: string | null,
  unitId: string | null,
  isConnected: boolean,
) {
  return useQuery({
    queryKey: ['contract-shifts', contractId, unitId, isConnected],
    enabled: Boolean(contractId && unitId),
    queryFn: async () => {
      if (!contractId || !unitId) return []
      const scope = { contractId, unitId }
      if (!isConnected) return getCachedContractShifts(scope)
      try {
        return await fetchContractShifts(scope)
      } catch (error) {
        if (!canUseOfflineFallback(error)) throw error
        const cached = await getCachedContractShifts(scope)
        if (cached.length) return cached
        throw error
      }
    },
  })
}
