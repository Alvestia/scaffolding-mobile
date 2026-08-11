import { getAllPages } from '@/api/pagination'
import { getReferenceCache, setReferenceCache } from '@/services/reference-cache.service'
import type { WorkOrder } from '@/types/work-order'

type Filters = {
  contractId?: string | null
  unitId?: string | null
  projectId?: string | null
}

function cacheKey(filters: Filters) {
  return `work-orders:${filters.unitId ?? 'all'}:${filters.contractId ?? 'all'}:${filters.projectId ?? 'all'}`
}

function scopedCacheKey(filters: Filters) {
  return cacheKey({
    unitId: filters.unitId,
    contractId: filters.contractId,
  })
}

function filterByProject(items: WorkOrder[], projectId?: string | null) {
  return projectId ? items.filter((item) => item.projectId === projectId) : items
}

export async function fetchWorkOrders(filters: Filters) {
  const data = await getAllPages<WorkOrder>('/work-orders', {
    params: {
      contractId: filters.contractId ?? undefined,
      unitId: filters.unitId ?? undefined,
      projectId: filters.projectId ?? undefined,
    },
    headers: {
      'X-Selected-Unit-Id': filters.unitId,
      'X-Selected-Contract-Id': filters.contractId,
    },
  })

  const workOrders = data.filter((item) => ['OPEN', 'IN_PROGRESS'].includes(item.status ?? ''))
  await setReferenceCache(cacheKey(filters), workOrders)
  return workOrders
}

export async function getCachedWorkOrders(filters: Filters) {
  const exact = await getReferenceCache<WorkOrder[]>(cacheKey(filters))
  if (exact) return exact

  const scoped = (await getReferenceCache<WorkOrder[]>(scopedCacheKey(filters))) ?? []
  return filterByProject(scoped, filters.projectId)
}
