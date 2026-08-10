import { getAllPages } from '@/api/pagination'
import type { ScaffoldType } from '@/types/scaffold-type'
import { getReferenceCache, setReferenceCache } from '@/services/reference-cache.service'

const CACHE_KEY = 'scaffold-types'

export async function fetchScaffoldTypes() {
  const data = await getAllPages<ScaffoldType>('/scaffold-types')
  const scaffoldTypes = data.filter((item) => item.active)
  await setReferenceCache(CACHE_KEY, scaffoldTypes)
  return scaffoldTypes
}

export async function getCachedScaffoldTypes() {
  return (await getReferenceCache<ScaffoldType[]>(CACHE_KEY)) ?? []
}
