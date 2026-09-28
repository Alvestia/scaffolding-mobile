import { canUseOfflineFallback } from '@/utils/offline-fallback'
import { useQuery } from '@tanstack/react-query'
import { fetchScaffoldTypes, getCachedScaffoldTypes } from '@/services/scaffold-types.service'
import { useAuthStore } from '@/store/auth-store'
import { useConnectivityStore } from '@/store/connectivity-store'

export function useScaffoldTypes() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const isConnected = useConnectivityStore((state) => state.isConnected)

  return useQuery({
    queryKey: ['scaffold-types', isConnected],
    enabled: isHydrated && Boolean(accessToken),
    queryFn: async () => {
      if (!isConnected) {
        return getCachedScaffoldTypes()
      }

      try {
        return await fetchScaffoldTypes()
      } catch (error) {
        if (!canUseOfflineFallback(error)) throw error
        const cached = await getCachedScaffoldTypes()
        if (cached.length > 0) {
          return cached
        }

        throw error
      }
    },
  })
}
