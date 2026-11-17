import { api } from '@/api/client'
import { localScaffoldServiceRepository } from '@/database/repositories/local-scaffold-service-repository'
import { outboxRepository } from '@/database/repositories/outbox-repository'
import { queueCacheRepository } from '@/database/repositories/queue-cache-repository'
import { getReferenceCache, setReferenceCache } from '@/services/reference-cache.service'
import type { MeasurementUnit, QueueServiceItem, ScaffoldServiceType } from '@/types/scaffold-service'
import { OutboxEntityType, type OutboxItem } from '@/types/sync'
import { nowIso } from '@/utils/date'
import { localServiceToQueueItem } from '@/utils/local-scaffold'
import type { MyDayActivity } from '@/utils/my-day'
import { normalizeQueuedExecutionPayload } from '@/utils/queued-execution'

type Scope = { contractId: string; unitId: string }
type Range = { from: string; to: string }

/** One row of GET /execution-entries/mine. */
export type MyExecutionEntryRow = {
  id: string
  clientMutationId?: string | null
  scaffoldId: string
  scaffoldServiceId: string
  operationType: string
  inputType: string
  inputValue: number
  effectiveQuantity: number
  basisUnit?: MeasurementUnit | null
  startTime: string | null
  endTime: string | null
  manHours: number | null
  crewSize: number | null
  approvalStatus: string
  scaffold?: { code: string; description?: string | null; location?: string | null } | null
  scaffoldService?: { type: ScaffoldServiceType; plannedUnit: MeasurementUnit } | null
  workOrder?: { code: string } | null
}

export async function fetchMyExecutionEntries(scope: Scope, range: Range) {
  const { data } = await api.get<{ items: MyExecutionEntryRow[]; truncated: boolean }>(
    '/execution-entries/mine',
    {
      params: range,
      headers: {
        'X-Selected-Unit-Id': scope.unitId,
        'X-Selected-Contract-Id': scope.contractId,
      },
      skipOrgScope: true,
    } as never,
  )
  return data
}

export function rowToActivity(row: MyExecutionEntryRow): MyDayActivity | null {
  // Entries made in the app always have a start; without one there is no day to show.
  if (!row.startTime) return null
  return {
    id: row.id,
    clientMutationId: row.clientMutationId ?? null,
    scaffoldId: row.scaffoldId,
    scaffoldCode: row.scaffold?.code ?? 'Andaime',
    scaffoldPlace: row.scaffold?.location || row.scaffold?.description || null,
    serviceType: row.scaffoldService?.type ?? null,
    operationType: row.operationType,
    inputType: row.inputType,
    inputValue: row.inputValue,
    unit: row.basisUnit ?? row.scaffoldService?.plannedUnit ?? null,
    startTime: row.startTime,
    endTime: row.endTime,
    manHours: row.manHours,
    workOrderCode: row.workOrder?.code ?? null,
    approvalStatus: row.approvalStatus,
  }
}

/**
 * Entries still on this phone (not sent, failed or waiting for photos).
 * The scaffold comes from the cached queue; a scaffold created offline from
 * its local record.
 */
export function deviceItemToActivity(
  item: OutboxItem,
  services: Map<string, QueueServiceItem>,
): MyDayActivity | null {
  const payload = normalizeQueuedExecutionPayload(item.payload)
  if (!payload?.entry.startTime) return null
  const service = services.get(payload.entry.scaffoldServiceId)
  return {
    id: item.localId,
    clientMutationId: item.idempotencyKey,
    scaffoldId: service?.scaffoldId ?? payload.scaffoldId ?? payload.entry.scaffoldServiceId,
    scaffoldCode: service?.scaffold?.code ?? 'Andaime',
    scaffoldPlace: service?.scaffold?.location || service?.scaffold?.description || null,
    serviceType: service?.type ?? null,
    operationType: payload.entry.operationType,
    inputType: payload.entry.inputType,
    inputValue: payload.entry.inputValue,
    unit: payload.basisSnapshot?.unit
      ? (payload.basisSnapshot.unit as MeasurementUnit)
      : (service?.plannedUnit ?? null),
    startTime: payload.entry.startTime,
    endTime: payload.entry.endTime ?? null,
    manHours: payload.entry.manHours ?? null,
    workOrderCode: service?.workOrder?.code ?? null,
    syncStatus: item.syncStatus,
  }
}

export async function listDeviceActivities(scope: Scope) {
  const items = (await outboxRepository.listAll()).filter(
    (item) =>
      item.entityType === OutboxEntityType.EXECUTION_ENTRY &&
      item.contractId === scope.contractId &&
      item.unitId === scope.unitId,
  )
  if (items.length === 0) return []

  const [cached, local] = await Promise.all([
    queueCacheRepository.listByScope(scope),
    localScaffoldServiceRepository.listPendingByScope(scope),
  ])
  const services = new Map<string, QueueServiceItem>()
  for (const service of [...cached, ...local.map((service) => localServiceToQueueItem(service))]) {
    services.set(service.id, service)
  }
  return items
    .map((item) => deviceItemToActivity(item, services))
    .filter((activity): activity is MyDayActivity => activity !== null)
}

/** The last periods seen, kept for offline use. */
const MAX_CACHED_RANGES = 8

type CachedRanges = Record<string, { fetchedAt: string; activities: MyDayActivity[] }>

const cacheKey = (scope: Scope) => `my-day:${scope.contractId}:${scope.unitId}`
const rangeKey = (range: Range) => `${range.from}:${range.to}`

export async function cacheMyActivities(scope: Scope, range: Range, activities: MyDayActivity[]) {
  const current = (await getReferenceCache<CachedRanges>(cacheKey(scope))) ?? {}
  current[rangeKey(range)] = { fetchedAt: nowIso(), activities }
  const kept = Object.entries(current)
    .sort(([, left], [, right]) => right.fetchedAt.localeCompare(left.fetchedAt))
    .slice(0, MAX_CACHED_RANGES)
  await setReferenceCache(cacheKey(scope), Object.fromEntries(kept))
}

export async function getCachedMyActivities(scope: Scope, range: Range) {
  const current = await getReferenceCache<CachedRanges>(cacheKey(scope))
  return current?.[rangeKey(range)] ?? null
}
