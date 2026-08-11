import { getAllPages } from '@/api/pagination'
import { getReferenceCache, setReferenceCache } from '@/services/reference-cache.service'
import type { WorkFunction } from '@/types/work-function'

type Scope = {
  contractId: string
  unitId: string
}

function cacheKey(scope: Scope) {
  return `work-functions:active:${scope.unitId}:${scope.contractId}`
}

export async function fetchWorkFunctions(scope: Scope) {
  const functions = await getAllPages<WorkFunction>('/work-functions', {
    params: { active: 'true' },
    headers: {
      'X-Selected-Unit-Id': scope.unitId,
      'X-Selected-Contract-Id': scope.contractId,
    },
  })
  await setReferenceCache(cacheKey(scope), functions)
  return functions
}

export async function getCachedWorkFunctions(scope: Scope) {
  return (await getReferenceCache<WorkFunction[]>(cacheKey(scope))) ?? []
}
