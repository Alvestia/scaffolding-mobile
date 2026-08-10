import { useQuery } from '@tanstack/react-query'
import { queueCacheRepository } from '@/database/repositories/queue-cache-repository'
import { localScaffoldServiceRepository } from '@/database/repositories/local-scaffold-service-repository'
import { fetchQueueServices } from '@/services/scaffold-services.service'
import type { QueueServiceItem } from '@/types/scaffold-service'
import { isLocalId } from '@/utils/id'
import { localServiceToQueueItem } from '@/utils/local-scaffold'

type Scope = {
  contractId: string | null
  unitId: string | null
}

export function useQueueServiceDetail(serviceId: string | null, scope: Scope, isConnected: boolean) {
  return useQuery<QueueServiceItem | null>({
    queryKey: ['queue-service-detail', serviceId, scope.contractId, scope.unitId, isConnected],
    enabled: Boolean(serviceId),
    queryFn: async () => {
      if (!serviceId) {
        return null
      }

      // Serviços locais (criados offline) são resolvidos direto do repositório local.
      // Não tentamos buscar no servidor — o ID ainda não existe lá.
      if (isLocalId(serviceId)) {
        const localService = await localScaffoldServiceRepository.getByLocalId(serviceId)
        return localService ? localServiceToQueueItem(localService) : null
      }

      const cached = await queueCacheRepository.getByServiceId(serviceId)

      if (!scope.contractId || !scope.unitId || !isConnected) {
        return cached
      }

      try {
        const remoteItems = await fetchQueueServices({
          contractId: scope.contractId,
          unitId: scope.unitId,
        })

        await queueCacheRepository.replaceForScope(remoteItems, {
          contractId: scope.contractId,
          unitId: scope.unitId,
        })

        return remoteItems.find((item) => item.id === serviceId) ?? cached
      } catch {
        return cached
      }
    },
  })
}
