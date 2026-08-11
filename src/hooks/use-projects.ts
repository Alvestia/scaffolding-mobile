import { useQuery } from '@tanstack/react-query'
import { useConnectivityStore } from '@/store/connectivity-store'
import { fetchProjects, getCachedProjects } from '@/services/projects.service'

type Scope = {
  contractId?: string | null
  unitId?: string | null
}

export function useProjects(scope: Scope) {
  const isConnected = useConnectivityStore((state) => state.isConnected)

  return useQuery({
    queryKey: ['projects', scope.contractId, scope.unitId, isConnected],
    enabled: Boolean(scope.contractId && scope.unitId),
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      if (!scope.contractId || !scope.unitId) return []

      const resolvedScope = { contractId: scope.contractId, unitId: scope.unitId }

      if (!isConnected) {
        return getCachedProjects(resolvedScope)
      }

      try {
        return await fetchProjects(resolvedScope)
      } catch (error) {
        const cached = await getCachedProjects(resolvedScope)
        if (cached.length > 0) {
          return cached
        }

        throw error
      }
    },
  })
}
