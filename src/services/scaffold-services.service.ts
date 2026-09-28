import { api } from '@/api/client'
import { getAllPages } from '@/api/pagination'
import type { QueueServiceItem } from '@/types/scaffold-service'

type Scope = {
  contractId: string
  unitId: string
}

export type QueueServiceFilters = {
  statuses?: string[]
  startForecast?: string
  endForecast?: string
  type?: string
  scaffoldId?: string
  workOrderId?: string
}

export async function fetchQueueServices(scope: Scope, filters?: QueueServiceFilters) {
  const statuses = filters?.statuses && filters.statuses.length > 0
    ? filters.statuses.join(',')
    : 'NAO_INICIADO,EM_EXECUCAO'

  const params: Record<string, string> = { statuses }
  if (filters?.startForecast) {
    params.startForecast = filters.startForecast
  }
  if (filters?.endForecast) {
    params.endForecast = filters.endForecast
  }
  if (filters?.type) {
    params.type = filters.type
  }
  if (filters?.scaffoldId) {
    params.scaffoldId = filters.scaffoldId
  }
  if (filters?.workOrderId) {
    params.workOrderId = filters.workOrderId
  }

  const data = await getAllPages<QueueServiceItem>('/scaffold-services', {
    params,
    headers: {
      'X-Selected-Unit-Id': scope.unitId,
      'X-Selected-Contract-Id': scope.contractId,
    },
    skipOrgScope: true,
  } as never)

  return data
}

// A service can leave the active queue after a revision. Read it directly so a
// pending draft can still compare its original basis with the current one.
export async function fetchQueueService(serviceId: string, scope: Scope, signal?: AbortSignal) {
  const { data } = await api.get<QueueServiceItem>(`/scaffold-services/${encodeURIComponent(serviceId)}`, {
    signal,
    headers: {
      'X-Selected-Unit-Id': scope.unitId,
      'X-Selected-Contract-Id': scope.contractId,
    },
    skipOrgScope: true,
  } as never)

  // Do not persist the execution/audit history returned by the detail endpoint.
  return {
    id: data.id,
    scaffoldId: data.scaffoldId,
    workOrderId: data.workOrderId,
    type: data.type,
    plannedUnit: data.plannedUnit,
    quantityVersion: data.quantityVersion,
    plannedQuantity: data.plannedQuantity,
    executedQuantity: data.executedQuantity,
    progress: data.progress,
    status: data.status,
    description: data.description,
    startForecast: data.startForecast,
    endForecast: data.endForecast,
    scaffold: data.scaffold,
    workOrder: data.workOrder,
    scaffoldComponent: data.scaffoldComponent,
  } satisfies QueueServiceItem
}
