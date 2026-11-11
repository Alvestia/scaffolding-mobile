import { isAxiosError } from 'axios'
import { outboxRepository } from '@/database/repositories/outbox-repository'
import {
  createManualInspection,
  fetchAvailabilityMap,
  fetchInspectionPack,
  interdictScaffold,
  removeInspectionDraft,
} from '@/services/inspections.service'
import { useSyncStore } from '@/store/sync-store'
import type {
  InspectionSubmissionPayload,
  ManualInspectionPayload,
  ScaffoldInterdictionPayload,
} from '@/types/inspection'
import { OutboxEntityType, SyncStatus } from '@/types/sync'
import { createLocalId } from '@/utils/id'

type Scope = {
  contractId: string
  unitId: string
}

/** No response at all: the request never reached the server. */
function isUnreachable(error: unknown) {
  return isAxiosError(error) && !error.response
}

async function enqueue<T>(
  scope: Scope,
  entityType: (typeof OutboxEntityType)[keyof typeof OutboxEntityType],
  localId: string,
  payload: T,
) {
  await outboxRepository.enqueue({
    localId,
    entityType,
    remoteId: null,
    contractId: scope.contractId,
    unitId: scope.unitId,
    syncStatus: SyncStatus.PENDING,
    errorMessage: null,
    payload,
  })
  await useSyncStore.getState().refreshState()
}

function syncSoon(scope: Scope, isConnected: boolean) {
  if (!isConnected) return
  void useSyncStore
    .getState()
    .runSyncNow(scope)
    .catch(() => {
      // The item stays in Pendências with its error; nothing is lost.
    })
}

function refreshInspectionData(scope: Scope) {
  return Promise.allSettled([fetchInspectionPack(scope), fetchAvailabilityMap(scope)])
}

/**
 * Concluded on the device: goes to the outbox and is sent by the sync, now
 * if there is network or later. The draft becomes the outbox payload.
 */
export async function submitInspection(
  scope: Scope,
  payload: InspectionSubmissionPayload,
  isConnected: boolean,
) {
  await enqueue(scope, OutboxEntityType.INSPECTION_SUBMISSION, createLocalId('inspection'), payload)
  await removeInspectionDraft(payload.inspectionId)
  syncSoon(scope, isConnected)
}

export type ImmediateOrQueued = { status: 'sent'; id?: string } | { status: 'queued' }

/** Online: created now and returned. Offline: queued with the same key. */
export async function requestManualInspection(
  scope: Scope,
  payload: ManualInspectionPayload,
  isConnected: boolean,
): Promise<ImmediateOrQueued> {
  const localId = createLocalId('inspmanual')
  if (isConnected) {
    try {
      const created = await createManualInspection(payload, localId)
      await refreshInspectionData(scope)
      return { status: 'sent', id: created.id }
    } catch (error) {
      if (!isUnreachable(error)) throw error
    }
  }
  await enqueue(scope, OutboxEntityType.INSPECTION_MANUAL, localId, payload)
  return { status: 'queued' }
}

/** Interdiction is urgent: sent at once when possible, otherwise queued. */
export async function requestInterdiction(
  scope: Scope,
  payload: ScaffoldInterdictionPayload,
  isConnected: boolean,
): Promise<ImmediateOrQueued> {
  if (isConnected) {
    try {
      await interdictScaffold(payload.scaffoldId, payload.reason)
      await refreshInspectionData(scope)
      return { status: 'sent' }
    } catch (error) {
      if (!isUnreachable(error)) throw error
    }
  }
  await enqueue(scope, OutboxEntityType.SCAFFOLD_INTERDICTION, createLocalId('interdiction'), payload)
  return { status: 'queued' }
}
