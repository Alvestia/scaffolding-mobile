import { getAllPages } from '@/api/pagination'
import { getReferenceCache, setReferenceCache } from '@/services/reference-cache.service'
import type { ScaffoldComponentType } from '@/types/scaffold-component-type'

const CACHE_KEY = 'scaffold-component-types:active'

export async function fetchScaffoldComponentTypes() {
  const componentTypes = await getAllPages<ScaffoldComponentType>('/scaffold-component-types', {
    params: { active: 'true' },
  })
  await setReferenceCache(CACHE_KEY, componentTypes)
  return componentTypes
}

export async function getCachedScaffoldComponentTypes() {
  return (await getReferenceCache<ScaffoldComponentType[]>(CACHE_KEY)) ?? []
}
