import { getAllPages } from '@/api/pagination'
import { getReferenceCache, setReferenceCache } from '@/services/reference-cache.service'
import type { DeviationTypeCatalog } from '@/types/operational-deviation'

const CACHE_KEY = 'deviation-types'

export async function fetchDeviationTypes() {
  const data = await getAllPages<DeviationTypeCatalog>('/deviation-types')
  await setReferenceCache(CACHE_KEY, data)
  return data
}

export async function getCachedDeviationTypes() {
  return (await getReferenceCache<DeviationTypeCatalog[]>(CACHE_KEY)) ?? []
}
