import { useQuery } from '@tanstack/react-query'
import { outboxRepository } from '@/database/repositories/outbox-repository'
import { queueCacheRepository } from '@/database/repositories/queue-cache-repository'
import { localScaffoldServiceRepository } from '@/database/repositories/local-scaffold-service-repository'
import { fetchQueueServices, type QueueServiceFilters } from '@/services/scaffold-services.service'
import { useAuthStore } from '@/store/auth-store'
import { useConnectivityStore } from '@/store/connectivity-store'
import type { QueueServiceItem } from '@/types/scaffold-service'
import { localServiceToQueueItem } from '@/utils/local-scaffold'
import { matchesExecutionBasis } from '@/utils/execution-basis'
import { canUseOfflineFallback } from '@/utils/offline-fallback'
import { matchesQueueFilters } from '@/utils/queue-filters'

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
    filters?.endForecast ||
    filters?.type ||
    filters?.scaffoldId ||
    filters?.workOrderId,
  )

  return useQuery({
    queryKey: [
      'execution-queue',
      scope.contractId,
      scope.unitId,
      filters?.statuses?.join(',') ?? null,
      filters?.startForecast ?? null,
      filters?.endForecast ?? null,
      filters?.type ?? null,
      filters?.scaffoldId ?? null,
      filters?.workOrderId ?? null,
      isConnected,
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
      // Pending advances can move an unstarted remote service into "in progress".
      // Apply the requested status after overlaying those local advances.
      const sourceFilters =
        pendingExecutions.size > 0
          ? {
              ...filters,
              statuses: [...new Set(['NAO_INICIADO', 'EM_EXECUCAO', ...(filters?.statuses ?? [])])],
            }
          : filters
      const localItems = localServices.map(localServiceToQueueItem)

      const applyPendingExecutions = (items: QueueServiceItem[]): QueueServiceItem[] =>
        items.reduce<QueueServiceItem[]>((acc, item) => {
          const executions = pendingExecutions.get(item.id)?.filter((entry) =>
            matchesExecutionBasis(item, {
              version: entry.expectedBasisVersion ?? 0,
              quantity: entry.basisSnapshot?.quantity ?? null,
              unit: entry.basisSnapshot?.unit ?? '',
            }),
          )
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
          const newProgress =
            item.plannedQuantity > 0 ? (newExecuted / item.plannedQuantity) * 100 : 0

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

      const mergeItems = (remoteItems: QueueServiceItem[]) =>
        applyPendingExecutions([...localItems, ...remoteItems]).filter((item) =>
          matchesQueueFilters(item, filters),
        )

      if (!isConnected) {
        const cachedItems = await queueCacheRepository.listByScope(
          {
            contractId: scope.contractId,
            unitId: scope.unitId,
          },
          sourceFilters,
        )
        return mergeItems(cachedItems)
      }

      try {
        const remoteItems = await fetchQueueServices(
          {
            contractId: scope.contractId,
            unitId: scope.unitId,
          },
          sourceFilters,
        )

        if (!hasFilters) {
          await queueCacheRepository.replaceForScope(remoteItems, {
            contractId: scope.contractId,
            unitId: scope.unitId,
          })
        }

        return mergeItems(remoteItems)
      } catch (error) {
        if (!canUseOfflineFallback(error)) throw error
        const cachedItems = await queueCacheRepository.listByScope(
          {
            contractId: scope.contractId,
            unitId: scope.unitId,
          },
          sourceFilters,
        )

        if (cachedItems.length > 0 || localItems.length > 0) {
          return mergeItems(cachedItems)
        }

        throw error
      }
    },
  })
}
