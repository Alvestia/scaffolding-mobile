import { useQuery } from '@tanstack/react-query'
import { outboxRepository } from '@/database/repositories/outbox-repository'
import { queueCacheRepository } from '@/database/repositories/queue-cache-repository'
import { localScaffoldServiceRepository } from '@/database/repositories/local-scaffold-service-repository'
import {
  fetchQueueServices,
  type QueueServiceFilters,
} from '@/services/scaffold-services.service'
import { useAuthStore } from '@/store/auth-store'
import { useConnectivityStore } from '@/store/connectivity-store'
import type { QueueServiceItem } from '@/types/scaffold-service'
import { localServiceToQueueItem } from '@/utils/local-scaffold'

type Scope = {
  contractId: string | null
  unitId: string | null
}

export function useExecutionQueue(scope: Scope, filters?: QueueServiceFilters) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const isConnected = useConnectivityStore((state) => state.isConnected)

  const hasFilters = Boolean(
    (filters?.statuses && filters.statuses.length > 0) ||
      filters?.startForecast ||
      filters?.endForecast,
  )

  return useQuery({
    queryKey: [
      'execution-queue',
      scope.contractId,
      scope.unitId,
      filters?.statuses?.join(',') ?? null,
      filters?.startForecast ?? null,
      filters?.endForecast ?? null,
    ],
    enabled: isHydrated && Boolean(accessToken && scope.contractId && scope.unitId),
    queryFn: async () => {
      if (!scope.contractId || !scope.unitId) {
        return []
      }

      // Serviços locais (andaimes criados offline) são sempre incluídos na fila,
      // independente de conectividade. Apenas os PENDING aparecem (os SYNCED somem
      // automaticamente após a sincronização do andaime pai).
      const localServices = await localScaffoldServiceRepository.listPendingByScope({
        contractId: scope.contractId,
        unitId: scope.unitId,
      })

      const pendingExecutions = await outboxRepository.listPendingExecutionsByServiceId({
        contractId: scope.contractId,
        unitId: scope.unitId,
      })
      const localItems = localServices.map(localServiceToQueueItem)

      const applyPendingExecutions = (items: QueueServiceItem[]): QueueServiceItem[] =>
        items.reduce<QueueServiceItem[]>((acc, item) => {
          const executions = pendingExecutions.get(item.id)
          if (!executions || executions.length === 0) {
            acc.push(item)
            return acc
          }

          let addedQty = 0
          for (const exec of executions) {
            if (exec.inputType === 'PERCENTUAL') {
              addedQty += (item.plannedQuantity * exec.inputValue) / 100
            } else {
              addedQty += exec.inputValue
            }
          }

          const newExecuted = item.executedQuantity + addedQty
          const newProgress = item.plannedQuantity > 0
            ? (newExecuted / item.plannedQuantity) * 100
            : 0

          if (newProgress >= 100) {
            return acc
          }

          acc.push({
            ...item,
            executedQuantity: Number(newExecuted.toFixed(3)),
            progress: Math.min(Math.round(newProgress), 99),
            status: 'EM_EXECUCAO',
          })
          return acc
        }, [])

      if (!isConnected) {
        const cachedItems = await queueCacheRepository.listByScope(
          {
            contractId: scope.contractId,
            unitId: scope.unitId,
          },
          filters,
        )
        return [...applyPendingExecutions(localItems), ...applyPendingExecutions(cachedItems)]
      }

      try {
        const remoteItems = await fetchQueueServices(
          {
            contractId: scope.contractId,
            unitId: scope.unitId,
          },
          filters,
        )

        if (!hasFilters) {
          await queueCacheRepository.replaceForScope(remoteItems, {
            contractId: scope.contractId,
            unitId: scope.unitId,
          })
        }

        return [...localItems, ...applyPendingExecutions(remoteItems)]
      } catch (error) {
        const cachedItems = await queueCacheRepository.listByScope(
          {
            contractId: scope.contractId,
            unitId: scope.unitId,
          },
          filters,
        )

        if (cachedItems.length > 0 || localItems.length > 0) {
          return [...applyPendingExecutions(localItems), ...applyPendingExecutions(cachedItems)]
        }

        throw error
      }
    },
  })
}
