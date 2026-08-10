import { useQuery } from '@tanstack/react-query'
import { useConnectivityStore } from '@/store/connectivity-store'
import { fetchProjects, getCachedProjects } from '@/services/projects.service'

export function useProjects() {
  const isConnected = useConnectivityStore((state) => state.isConnected)

  return useQuery({
    queryKey: ['projects', isConnected],
    queryFn: async () => {
      if (!isConnected) {
        return getCachedProjects()
      }

      try {
        return await fetchProjects()
      } catch (error) {
        const cached = await getCachedProjects()
        if (cached.length > 0) {
          return cached
        }

        throw error
      }
    },
  })
}
