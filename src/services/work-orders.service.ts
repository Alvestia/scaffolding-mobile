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

export async function fetchWorkOrders(filters: Filters) {
  const data = await getAllPages<WorkOrder>('/work-orders', {
    params: {
      contractId: filters.contractId ?? undefined,
      unitId: filters.unitId ?? undefined,
      projectId: filters.projectId ?? undefined,
    },
  })

  const workOrders = data.filter((item) =>
    ['OPEN', 'IN_PROGRESS'].includes(item.status ?? ''),
  )
  await setReferenceCache(cacheKey(filters), workOrders)
  return workOrders
}

export async function getCachedWorkOrders(filters: Filters) {
  return (await getReferenceCache<WorkOrder[]>(cacheKey(filters))) ?? []
}
