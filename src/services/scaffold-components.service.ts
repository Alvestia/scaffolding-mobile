import { api } from '@/api/client'
import { getReferenceCache, setReferenceCache } from '@/services/reference-cache.service'
import type { ExecutionOperationType } from '@/types/execution'
import type { ScaffoldComponent } from '@/types/scaffold-component'

type Filters = {
  scaffoldId: string
  operationType: ExecutionOperationType
  executionEntryId?: string
}

function cacheKey(filters: Filters) {
  return `scaffold-components:${filters.scaffoldId}:${filters.operationType}:${filters.executionEntryId ?? 'new'}`
}

export async function fetchScaffoldComponents(filters: Filters) {
  const { data } = await api.get(`/scaffolds/${filters.scaffoldId}/components`)

  const components = (data as ScaffoldComponent[]).map((component) => ({
    ...component,
    category: component.lineCode,
    description: component.notes,
    plannedQuantity: component.quantity,
    isAvailableForOperation:
      (component.executionProgress?.[filters.operationType]?.remainingQuantity ?? component.quantity ?? 0) > 0,
  }))
  await setReferenceCache(cacheKey(filters), components)
  return components
}

export async function getCachedScaffoldComponents(filters: Filters) {
  return (await getReferenceCache<ScaffoldComponent[]>(cacheKey(filters))) ?? []
}
