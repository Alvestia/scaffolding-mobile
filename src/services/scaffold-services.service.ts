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
