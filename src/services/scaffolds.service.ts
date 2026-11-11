import { api } from '@/api/client'
import { getReferenceCache, setReferenceCache } from '@/services/reference-cache.service'
import type { EmergencyScaffoldDraft } from '@/types/execution'
import { nowIso } from '@/utils/date'
import {
  assertOfflineOwnerContext,
  buildOwnedStorageKey,
  captureOfflineOwnerContext,
} from '@/security/offline-owner'

type Scope = {
  contractId: string
  unitId: string
}

export type RemoteScaffoldResponse = {
  id: string
  code: string
  contractId: string
  unitId: string
  createdAt: string
  scaffoldServices?: {
    id: string
    type: string
  }[]
}

export type RemoteScaffoldBatchResponse = {
  count: number
  items: RemoteScaffoldResponse[]
}

export type CreateEmergencyScaffoldResult = RemoteScaffoldResponse | RemoteScaffoldBatchResponse

export type LatestScaffoldSummary = Pick<
  RemoteScaffoldResponse,
  'id' | 'code' | 'contractId' | 'unitId' | 'createdAt'
>

export type LatestScaffoldSnapshot = {
  scaffold: LatestScaffoldSummary | null
  refreshedAt: string
}

type PaginatedScaffoldsResponse = {
  items: RemoteScaffoldResponse[]
}

const activeLatestScaffoldFetches = new Map<string, Promise<LatestScaffoldSnapshot>>()

function latestScaffoldCacheKey(scope: Scope) {
  return `latest-scaffold:${scope.unitId}:${scope.contractId}`
}

function toLatestScaffoldSummary(scaffold: RemoteScaffoldResponse): LatestScaffoldSummary {
  return {
    id: scaffold.id,
    code: scaffold.code,
    contractId: scaffold.contractId,
    unitId: scaffold.unitId,
    createdAt: scaffold.createdAt,
  }
}

export async function cacheLatestScaffold(scope: Scope, scaffold: RemoteScaffoldResponse | null) {
  const snapshot: LatestScaffoldSnapshot = {
    scaffold: scaffold ? toLatestScaffoldSummary(scaffold) : null,
    refreshedAt: nowIso(),
  }

  await setReferenceCache(latestScaffoldCacheKey(scope), snapshot)
  return snapshot
}

export async function getCachedLatestScaffold(scope: Scope) {
  return getReferenceCache<LatestScaffoldSnapshot>(latestScaffoldCacheKey(scope))
}

export function fetchLatestScaffold(scope: Scope) {
  const ownerContext = captureOfflineOwnerContext()
  const cacheKey = buildOwnedStorageKey(latestScaffoldCacheKey(scope))
  const activeFetch = activeLatestScaffoldFetches.get(cacheKey)
  if (activeFetch) {
    return activeFetch
  }

  const request = (async () => {
    const { data } = await api.get<PaginatedScaffoldsResponse>('/scaffolds', {
      params: {
        contractId: scope.contractId,
        unitId: scope.unitId,
        page: 1,
        pageSize: 1,
      },
      headers: {
        'X-Selected-Unit-Id': scope.unitId,
        'X-Selected-Contract-Id': scope.contractId,
      },
      skipOrgScope: true,
    } as never)

    assertOfflineOwnerContext(ownerContext)
    return cacheLatestScaffold(scope, data.items[0] ?? null)
  })()

  const trackedRequest = request.finally(() => {
    if (activeLatestScaffoldFetches.get(cacheKey) === trackedRequest) {
      activeLatestScaffoldFetches.delete(cacheKey)
    }
  })
  activeLatestScaffoldFetches.set(cacheKey, trackedRequest)

  return trackedRequest
}

export async function refreshLatestScaffoldIfStale(scope: Scope, maxAgeMs = 30_000) {
  const cached = await getCachedLatestScaffold(scope)
  const refreshedAt = cached ? Date.parse(cached.refreshedAt) : Number.NaN

  if (!Number.isNaN(refreshedAt) && Date.now() - refreshedAt < maxAgeMs) {
    return cached
  }

  return fetchLatestScaffold(scope)
}

export async function cacheLatestScaffoldFromCreation(
  scope: Scope,
  result: CreateEmergencyScaffoldResult,
) {
  const createdScaffolds = isScaffoldBatchResponse(result) ? result.items : [result]
  const latestCreated = createdScaffolds.reduce<RemoteScaffoldResponse | null>(
    (latest, current) => {
      if (!latest) {
        return current
      }

      return Date.parse(current.createdAt) >= Date.parse(latest.createdAt) ? current : latest
    },
    null,
  )

  return cacheLatestScaffold(scope, latestCreated)
}

export function isScaffoldBatchResponse(
  result: CreateEmergencyScaffoldResult,
): result is RemoteScaffoldBatchResponse {
  return 'count' in result && Array.isArray(result.items)
}

export async function createEmergencyScaffold(draft: EmergencyScaffoldDraft, mutationId?: string) {
  const { data } = await api.post(
    '/scaffolds',
    {
      code: draft.code,
      mobileLocalId: draft.mobileLocalId ?? draft.localId,
      companyId: draft.companyId,
      unitId: draft.unitId,
      contractId: draft.contractId,
      workOrderId: draft.workOrderId,
      primaryWorkOrderId: draft.workOrderId,
      projectId: draft.projectId,
      areaId: draft.areaId,
      scaffoldTypeId: draft.scaffoldTypeId,
      description: draft.description,
      location: draft.location,
      measurementUnit: draft.measurementUnit === 'LINEAR_M' ? 'UNIDADE' : draft.measurementUnit,
      height: draft.height,
      width: draft.width,
      length: draft.length,
      volumeM3: draft.volumeM3,
      areaM2: draft.areaM2,
      linearM: draft.linearM,
      // The work order decides: planned with one, emergency without. The server confirms
      // it, and keeps field scaffolds as emergency where the contract uses the project module.
      origin: draft.workOrderId ? 'PLANEJADO' : 'CAMPO_EMERGENCIAL',
      components: draft.components?.map((component) => ({
        componentTypeId: component.componentTypeId,
        name: component.name,
        notes: component.description,
        measurementUnit: component.measurementUnit,
        quantity: component.plannedQuantity ?? 1,
        height: component.height,
        width: component.width,
        length: component.length,
      })),
      autoCreateServices: draft.autoCreateServices ?? true,
      createDismantlingService: draft.createDismantlingService ?? true,
      assemblyForecastStartDate: draft.assemblyForecastStartDate,
      assemblyForecastEndDate: draft.assemblyForecastEndDate,
      disassemblyForecastStartDate: draft.disassemblyForecastStartDate,
      disassemblyForecastEndDate: draft.disassemblyForecastEndDate,
    },
    mutationId ? { headers: { 'Idempotency-Key': mutationId } } : undefined,
  )

  return data as CreateEmergencyScaffoldResult
}
