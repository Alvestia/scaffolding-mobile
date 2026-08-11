import { useQuery } from '@tanstack/react-query'
import {
  fetchScaffoldComponentTypes,
  getCachedScaffoldComponentTypes,
} from '@/services/scaffold-component-types.service'
import { useConnectivityStore } from '@/store/connectivity-store'

export function useScaffoldComponentTypes() {
  const isConnected = useConnectivityStore((state) => state.isConnected)

  return useQuery({
    queryKey: ['scaffold-component-types', isConnected],
    queryFn: async () => {
      if (!isConnected) return getCachedScaffoldComponentTypes()

      try {
        return await fetchScaffoldComponentTypes()
      } catch (error) {
        const cached = await getCachedScaffoldComponentTypes()
        if (cached.length > 0) return cached
        throw error
      }
    },
  })
}
