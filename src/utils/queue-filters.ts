import type { QueueServiceFilters } from '@/services/scaffold-services.service'
import type { QueueServiceItem } from '@/types/scaffold-service'
import { getBusinessDateKey } from './date'

/** Matches the API's forecast overlap and organization-independent filters. */
export function matchesQueueFilters(item: QueueServiceItem, filters?: QueueServiceFilters) {
  const statuses = filters?.statuses?.length ? filters.statuses : ['NAO_INICIADO', 'EM_EXECUCAO']
  if (!statuses.includes(item.status)) return false
  if (filters?.type && item.type !== filters.type) return false
  if (filters?.scaffoldId && item.scaffoldId !== filters.scaffoldId) return false
  if (filters?.workOrderId && (item.workOrderId ?? item.workOrder?.id) !== filters.workOrderId) {
    return false
  }

  const from = getBusinessDateKey(filters?.startForecast)
  const to = getBusinessDateKey(filters?.endForecast)
  const itemFrom = getBusinessDateKey(item.startForecast)
  const itemTo = getBusinessDateKey(item.endForecast)
  if (from && (!itemTo || itemTo < from)) return false
  if (to && (!itemFrom || itemFrom > to)) return false
  return true
}
