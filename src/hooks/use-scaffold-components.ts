import { useQuery } from '@tanstack/react-query'
import { useConnectivityStore } from '@/store/connectivity-store'
import { fetchScaffoldComponents, getCachedScaffoldComponents } from '@/services/scaffold-components.service'
import type { ExecutionOperationType } from '@/types/execution'
import { isLocalId } from '@/utils/id'

type Filters = {
  scaffoldId?: string | null
  operationType?: ExecutionOperationType | null
  executionEntryId?: string
}

export function useScaffoldComponents(filters: Filters) {
  const isConnected = useConnectivityStore((state) => state.isConnected)

  return useQuery({
    queryKey: [
      'scaffold-components',
      filters.scaffoldId,
      filters.operationType,
      filters.executionEntryId,
      isConnected,
    ],
    // Andaimes locais (offline) ainda não existem no servidor, portanto
    // não há componentes remotos para buscar. Retorna lista vazia automaticamente.
    enabled: Boolean(
      filters.scaffoldId &&
        filters.operationType &&
        !isLocalId(filters.scaffoldId),
    ),
    queryFn: async () => {
      if (!filters.scaffoldId || !filters.operationType) {
        return []
      }

      if (isLocalId(filters.scaffoldId)) {
        return []
      }

      const query = {
        scaffoldId: filters.scaffoldId,
        operationType: filters.operationType,
        executionEntryId: filters.executionEntryId,
      }

      if (!isConnected) {
        return getCachedScaffoldComponents(query)
      }

      try {
        return await fetchScaffoldComponents(query)
      } catch (error) {
        const cached = await getCachedScaffoldComponents(query)
        if (cached.length > 0) {
          return cached
        }

        throw error
      }
    },
  })
}
