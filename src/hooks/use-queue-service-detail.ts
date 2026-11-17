import { useQuery } from '@tanstack/react-query'
import { queueCacheRepository } from '@/database/repositories/queue-cache-repository'
import { localScaffoldServiceRepository } from '@/database/repositories/local-scaffold-service-repository'
import { outboxRepository } from '@/database/repositories/outbox-repository'
import { OutboxEntityType } from '@/types/sync'
import type { EmergencyScaffoldDraft } from '@/types/execution'
import { fetchQueueService } from '@/services/scaffold-services.service'
import { assertOfflineOwnerContext, captureOfflineOwnerContext } from '@/security/offline-owner'
import type { QueueServiceItem } from '@/types/scaffold-service'
import { isLocalId } from '@/utils/id'
import { localServiceToQueueItem } from '@/utils/local-scaffold'
import { canUseOfflineFallback } from '@/utils/offline-fallback'

type Scope = {
  contractId: string | null
  unitId: string | null
}

export function useQueueServiceDetail(
  serviceId: string | null,
  scope: Scope,
  isConnected: boolean,
) {
  return useQuery<QueueServiceItem | null>({
    queryKey: ['queue-service-detail', serviceId, scope.contractId, scope.unitId, isConnected],
    enabled: Boolean(serviceId && scope.contractId && scope.unitId),
    staleTime: 0,
    queryFn: async ({ signal }) => {
      if (!serviceId || !scope.contractId || !scope.unitId) return null
      const ownerContext = captureOfflineOwnerContext()
      const selectedScope = { contractId: scope.contractId, unitId: scope.unitId }
      let remoteId = serviceId

      if (isLocalId(serviceId)) {
        const localService = await localScaffoldServiceRepository.getByLocalId(serviceId)
        assertOfflineOwnerContext(ownerContext)
        if (
          !localService ||
          localService.contractId !== scope.contractId ||
          localService.unitId !== scope.unitId
        ) {
          return null
        }
        if (!localService.remoteId) {
          // An offline scaffold already has its captured GPS in the creation draft.
          // Reuse it when opening its assembly, without another capture or a schema change.
          const creation = await outboxRepository.getByLocalId(localService.localScaffoldId)
          assertOfflineOwnerContext(ownerContext)
          const draft =
            creation?.entityType === OutboxEntityType.EMERGENCY_SCAFFOLD &&
            creation.contractId === scope.contractId &&
            creation.unitId === scope.unitId
              ? (creation.payload as EmergencyScaffoldDraft)
              : undefined
          return localServiceToQueueItem(localService, draft?.geolocation)
        }
        remoteId = localService.remoteId
      }

      const cached = await queueCacheRepository.getByServiceId(remoteId, selectedScope)
      assertOfflineOwnerContext(ownerContext)
      if (!isConnected) return cached

      let service: QueueServiceItem
      try {
        service = await fetchQueueService(remoteId, selectedScope, signal)
      } catch (error) {
        assertOfflineOwnerContext(ownerContext)
        if (cached && canUseOfflineFallback(error)) return cached
        throw error
      }

      assertOfflineOwnerContext(ownerContext)
      await queueCacheRepository.upsert(service, selectedScope)
      assertOfflineOwnerContext(ownerContext)
      return service
    },
  })
}
