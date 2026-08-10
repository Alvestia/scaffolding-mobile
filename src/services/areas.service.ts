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

export async function fetchAreas(filters: Filters) {
  const data = await getAllPages<Area>('/areas', {
    params: {
      companyId: filters.companyId ?? undefined,
      unitId: filters.unitId ?? undefined,
      contractId: filters.contractId ?? undefined,
      projectId: filters.projectId ?? undefined,
    },
  })

  const areas = data
  await setReferenceCache(cacheKey(filters), areas)
  return areas
}

export async function getCachedAreas(filters: Filters) {
  return (await getReferenceCache<Area[]>(cacheKey(filters))) ?? []
}
