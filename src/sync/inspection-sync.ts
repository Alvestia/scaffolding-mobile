import { outboxRepository } from '@/database/repositories/outbox-repository'
import {
  completeRemoteInspection,
  createManualInspection,
  fetchAvailabilityMap,
  fetchInspectionPack,
  getRemoteInspection,
  interdictScaffold,
  removeInspectionEvidenceFiles,
  saveRemoteAnswers,
  startRemoteInspection,
  uploadInspectionEvidence,
} from '@/services/inspections.service'
import type {
  InspectionSubmissionPayload,
  ManualInspectionPayload,
  ScaffoldInterdictionPayload,
} from '@/types/inspection'
import { useAuthStore } from '@/store/auth-store'
import type { OutboxItem } from '@/types/sync'
import { hasPermission } from '@/utils/inspection-rules'
import { assertOfflineOwnerContext, captureOfflineOwnerContext } from '@/security/offline-owner'

type OfflineOwnerContext = ReturnType<typeof captureOfflineOwnerContext>

/** A 409 the sync engine records as a conflict for the user to review. */
function conflict(message: string, errorCode: string) {
  return Object.assign(new Error(message), {
    response: { status: 409, data: { message, errorCode } },
  })
}

function sameInstant(left: string, right: string) {
  return Date.parse(left) === Date.parse(right)
}

/**
 * Sends an inspection done on the device: answers, then each photo or
 * signature, then the conclusion. Every step can be repeated safely, so a
 * failure halfway resumes where it stopped on the next sync.
 */
export async function syncInspectionSubmission(
  item: OutboxItem<InspectionSubmissionPayload>,
  ownerContext: OfflineOwnerContext,
) {
  const payload = item.payload
  const id = payload.inspectionId

  assertOfflineOwnerContext(ownerContext)
  let remote = await getRemoteInspection(id)
  assertOfflineOwnerContext(ownerContext)

  if (remote.status === 'COMPLETED' || remote.status === 'CANCELLED') {
    const alreadyOurs = payload.complete && remote.clientMutationId === item.idempotencyKey
    if (!alreadyOurs) {
      throw conflict(
        remote.status === 'COMPLETED'
          ? 'A inspeção já foi concluída em outro lugar. O registro do aparelho não foi enviado.'
          : 'A inspeção foi cancelada. O registro do aparelho não foi enviado.',
        'inspection_closed',
      )
    }
  } else {
    if (!payload.answersSent) {
      // Someone else took the inspection after it was downloaded: never overwrite their work.
      const takenByOther =
        !sameInstant(remote.updatedAt, payload.baseUpdatedAt) &&
        Boolean(remote.inspectorId) &&
        remote.inspectorId !== ownerContext.owner.userId
      if (takenByOther) {
        throw conflict(
          'Outra pessoa alterou esta inspeção depois do download. Revise antes de enviar.',
          'inspection_taken',
        )
      }
      if (remote.status === 'PENDING') {
        remote = await startRemoteInspection(id, {
          expectedUpdatedAt: remote.updatedAt,
          startedAt: payload.startedAt,
        })
        assertOfflineOwnerContext(ownerContext)
      }
      remote = await saveRemoteAnswers(id, {
        expectedUpdatedAt: remote.updatedAt,
        answers: payload.answers,
      })
      assertOfflineOwnerContext(ownerContext)
      await outboxRepository.updatePayload(item.localId, { ...payload, answersSent: true })
    }

    const evidences = payload.evidences
    for (let index = 0; index < evidences.length; index += 1) {
      const evidence = evidences[index]
      try {
        assertOfflineOwnerContext(ownerContext)
        await outboxRepository.renewLease(item.localId, item.leaseOwner ?? '')
        await uploadInspectionEvidence(id, evidence, `${item.idempotencyKey}-${evidence.id}`)
        assertOfflineOwnerContext(ownerContext)
      } catch (error) {
        assertOfflineOwnerContext(ownerContext)
        await outboxRepository.updatePayload(item.localId, {
          ...payload,
          answersSent: true,
          evidences: evidences.slice(index),
        })
        try {
          await removeInspectionEvidenceFiles(evidences.slice(0, index))
        } catch {
          // Local cleanup must not hide the real sync error.
        }
        throw error
      }
    }

    if (payload.complete) {
      // Uploads do not change updatedAt; the answers just sent did.
      remote = await getRemoteInspection(id)
      assertOfflineOwnerContext(ownerContext)
      await completeRemoteInspection(id, {
        expectedUpdatedAt: remote.updatedAt,
        performedAt: payload.performedAt,
        clientMutationId: item.idempotencyKey,
        ...(payload.restrictions ? { restrictions: payload.restrictions } : {}),
        ...(payload.notes ? { notes: payload.notes } : {}),
        ...(payload.gps
          ? {
              latitude: payload.gps.latitude,
              longitude: payload.gps.longitude,
              ...(payload.gps.accuracyM !== null ? { gpsAccuracyM: payload.gps.accuracyM } : {}),
            }
          : {}),
        ...(payload.durationSeconds !== null ? { durationSeconds: payload.durationSeconds } : {}),
      })
      assertOfflineOwnerContext(ownerContext)
    }
  }

  try {
    await removeInspectionEvidenceFiles(payload.evidences)
  } catch {
    // The server has everything; local cleanup is best effort.
  }
  assertOfflineOwnerContext(ownerContext)
  await outboxRepository.remove(item.localId)
}

/** Manual inspection created offline; the Idempotency-Key makes a resend harmless. */
export async function syncManualInspection(
  item: OutboxItem<ManualInspectionPayload>,
  ownerContext: OfflineOwnerContext,
) {
  assertOfflineOwnerContext(ownerContext)
  await createManualInspection(item.payload, item.idempotencyKey)
  assertOfflineOwnerContext(ownerContext)
  await outboxRepository.remove(item.localId)
}

function alreadyInterdicted(error: unknown) {
  return (error as { response?: { status?: number } })?.response?.status === 409
}

/** Interdiction registered offline. Already interdicted on the server is the goal reached. */
export async function syncScaffoldInterdiction(
  item: OutboxItem<ScaffoldInterdictionPayload>,
  ownerContext: OfflineOwnerContext,
) {
  assertOfflineOwnerContext(ownerContext)
  try {
    await interdictScaffold(item.payload.scaffoldId, item.payload.reason)
  } catch (error) {
    if (!alreadyInterdicted(error)) throw error
  }
  assertOfflineOwnerContext(ownerContext)
  await outboxRepository.remove(item.localId)
}

/** Inspections and availability of the contract, kept on the device for offline use. */
export async function syncInspectionData(
  ownerContext: OfflineOwnerContext,
  scope?: { contractId: string; unitId: string },
) {
  if (!scope?.contractId || !scope?.unitId) return

  const user = useAuthStore.getState().user
  const requests: Promise<unknown>[] = []
  assertOfflineOwnerContext(ownerContext)
  if (hasPermission(user, 'inspection:view')) requests.push(fetchInspectionPack(scope))
  if (hasPermission(user, 'scaffold:view')) requests.push(fetchAvailabilityMap(scope))
  // Each keeps its previous copy on failure; the operational sync goes on.
  await Promise.allSettled(requests)
  assertOfflineOwnerContext(ownerContext)
}
