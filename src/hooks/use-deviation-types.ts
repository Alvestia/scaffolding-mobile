import { useQuery } from '@tanstack/react-query'
import { fetchDeviationTypes, getCachedDeviationTypes } from '@/services/deviation-types.service'
import { useAuthStore } from '@/store/auth-store'
import { useConnectivityStore } from '@/store/connectivity-store'

export function useDeviationTypes() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const isConnected = useConnectivityStore((state) => state.isConnected)

  return useQuery({
    queryKey: ['deviation-types', isConnected],
    enabled: isHydrated && Boolean(accessToken),
    queryFn: async () => {
      if (!isConnected) {
        return getCachedDeviationTypes()
      }

      try {
        return await fetchDeviationTypes()
      } catch (error) {
        const cached = await getCachedDeviationTypes()
        if (cached.length > 0) {
          return cached
        }

        throw error
      }
    },
  })
}
