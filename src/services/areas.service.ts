import { getAllPages } from '@/api/pagination'
import { getReferenceCache, setReferenceCache } from '@/services/reference-cache.service'
import type { Area } from '@/types/area'

type Filters = {
  companyId?: string | null
  unitId?: string | null
  contractId?: string | null
  projectId?: string | null
}

function cacheKey(filters: Filters) {
  return `areas:${filters.companyId ?? 'all'}:${filters.unitId ?? 'all'}:${filters.contractId ?? 'all'}:${filters.projectId ?? 'all'}`
}

function scopedCacheKey(filters: Filters) {
  return cacheKey({
    companyId: filters.companyId,
    unitId: filters.unitId,
    contractId: filters.contractId,
  })
}

function filterByProject(items: Area[], projectId?: string | null) {
  return projectId ? items.filter((item) => item.projectId === projectId) : items
}

export async function fetchAreas(filters: Filters) {
  const data = await getAllPages<Area>('/areas', {
    params: {
      companyId: filters.companyId ?? undefined,
      unitId: filters.unitId ?? undefined,
      contractId: filters.contractId ?? undefined,
      projectId: filters.projectId ?? undefined,
    },
    headers: {
      'X-Selected-Unit-Id': filters.unitId,
      'X-Selected-Contract-Id': filters.contractId,
    },
  })

  const areas = data
  await setReferenceCache(cacheKey(filters), areas)
  return areas
}

export async function getCachedAreas(filters: Filters) {
  const exact = await getReferenceCache<Area[]>(cacheKey(filters))
  if (exact) return exact

  const scoped = (await getReferenceCache<Area[]>(scopedCacheKey(filters))) ?? []
  return filterByProject(scoped, filters.projectId)
}
