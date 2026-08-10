import { outboxRepository } from '@/database/repositories/outbox-repository'
import { queueCacheRepository } from '@/database/repositories/queue-cache-repository'
import { syncStateRepository } from '@/database/repositories/sync-state-repository'
import { localScaffoldServiceRepository } from '@/database/repositories/local-scaffold-service-repository'
import {
  addCrewMembers,
  applyCrewMembersSnapshot,
  fetchCrewMembers,
  removeCrewMember,
} from '@/services/crews.service'
import { createExecutionEntry } from '@/services/execution-entries.service'
import {
  cleanupExecutionEvidenceDrafts,
  uploadExecutionMedia,
} from '@/services/execution-media.service'
import {
  cleanupDeviationEvidenceDrafts,
  uploadDeviationMedia,
} from '@/services/deviation-media.service'
import { createOperationalDeviation } from '@/services/operational-deviations.service'
import { createScaffoldMeasurementAdjustment } from '@/services/scaffold-measurement-adjustments.service'
import { fetchQueueServices } from '@/services/scaffold-services.service'
import {
  cacheLatestScaffoldFromCreation,
  createEmergencyScaffold,
  fetchLatestScaffold,
  isScaffoldBatchResponse,
} from '@/services/scaffolds.service'
import type { CrewMemberMutationPayload, CrewMemberRemovalPayload } from '@/types/crew'
import type {
  CreateExecutionEntryDto,
  EmergencyScaffoldDraft,
  QueuedExecutionEntryPayload,
} from '@/types/execution'
import type { OperationalDeviationDraft } from '@/types/operational-deviation'
import { OutboxEntityType, SyncStatus, type OutboxItem } from '@/types/sync'
import { nowIso } from '@/utils/date'
import { getErrorMessage } from '@/utils/error'
import { createLocalId, isLocalId } from '@/utils/id'
import { normalizeQueuedExecutionPayload } from '@/utils/queued-execution'
import { assertOfflineOwnerContext, captureOfflineOwnerContext } from '@/security/offline-owner'

type SyncScope = {
  contractId: string
  unitId: string
}

type RunFullSyncOptions = {
  includeQueue?: boolean
}

let activeSyncPromise: Promise<void> | null = null
let activeSyncGeneration: number | null = null

type OfflineOwnerContext = ReturnType<typeof captureOfflineOwnerContext>

const BASE_RETRY_DELAY_MS = 60_000
const MAX_RETRY_DELAY_MS = 6 * 60 * 60 * 1000
const MAX_RETRY_COUNT = 8

function getHttpStatus(error: unknown) {
  return (error as { response?: { status?: number } })?.response?.status
}

function isPermanentSyncError(error: unknown) {
  const status = getHttpStatus(error)
  return Boolean(status && status >= 400 && status < 500 && status !== 408 && status !== 429)
}

function retryAt(error: unknown, retryCount: number) {
  const retryAfter = Number(
    (error as { response?: { headers?: Record<string, string> } })?.response?.headers?.[
      'retry-after'
    ],
  )
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return new Date(Date.now() + retryAfter * 1_000).toISOString()
  }
  const cap = Math.min(BASE_RETRY_DELAY_MS * 2 ** Math.max(retryCount, 0), MAX_RETRY_DELAY_MS)
  return new Date(Date.now() + Math.floor(Math.random() * cap)).toISOString()
}

function safeErrorCode(error: unknown) {
  const response = (
    error as {
      response?: { status?: number; data?: { errorCode?: string; code?: string } }
    }
  )?.response
  return (
    response?.data?.errorCode ??
    response?.data?.code ??
    (response?.status ? `http_${response.status}` : 'network_error')
  )
}

function isRetryableConflict(error: unknown) {
  if (getHttpStatus(error) !== 409) return false
  const response = error as {
    response?: { headers?: Record<string, string>; data?: { errorCode?: string; code?: string } }
  }
  return Boolean(
    response.response?.headers?.['retry-after'] ||
    ['idempotency_in_progress', 'IDEMPOTENCY_IN_PROGRESS'].includes(
      response.response?.data?.errorCode ?? response.response?.data?.code ?? '',
    ),
  )
}

async function syncExecutionOutboxItem(
  item: OutboxItem<CreateExecutionEntryDto | QueuedExecutionEntryPayload>,
  ownerContext: OfflineOwnerContext,
) {
  let normalizedPayload = normalizeQueuedExecutionPayload(item.payload)

  if (!normalizedPayload) {
    throw new Error('Nao foi possivel interpretar o apontamento salvo no aparelho.')
  }

  // Se o scaffoldServiceId for um ID local, resolve para o ID remoto antes de enviar.
  // Isso cobre o caso de avanços criados offline para andaimes também criados offline.
  if (isLocalId(normalizedPayload.entry.scaffoldServiceId)) {
    const localService = await localScaffoldServiceRepository.getByLocalId(
      normalizedPayload.entry.scaffoldServiceId,
    )

    if (!localService?.remoteId) {
      throw new Error(
        'O servico de andaime local ainda nao foi sincronizado. O apontamento sera enviado automaticamente apos a sincronizacao do andaime.',
      )
    }

    normalizedPayload = {
      ...normalizedPayload,
      entry: {
        ...normalizedPayload.entry,
        scaffoldServiceId: localService.remoteId,
      },
    }
  }

  assertOfflineOwnerContext(ownerContext)
  const remoteEntry = await createExecutionEntry(normalizedPayload.entry, item.idempotencyKey)
  const remoteEntryId = item.remoteId ?? remoteEntry.id
  const remoteScaffoldId = remoteEntry.scaffoldId ?? normalizedPayload.scaffoldId
  assertOfflineOwnerContext(ownerContext)

  if (!item.remoteId) {
    await outboxRepository.updateStatus(item.localId, SyncStatus.SYNCING, {
      remoteId: remoteEntryId,
      errorMessage: null,
    })
  }

  const adjustments = normalizedPayload.adjustments ?? []
  if (adjustments.length > 0 && !remoteScaffoldId) {
    throw new Error('Nao foi possivel identificar o andaime dos ajustes desta execucao.')
  }

  for (const adjustment of adjustments) {
    assertOfflineOwnerContext(ownerContext)
    await outboxRepository.renewLease(item.localId, item.leaseOwner ?? '')
    await createScaffoldMeasurementAdjustment(
      remoteScaffoldId,
      remoteEntryId,
      adjustment,
      `${item.idempotencyKey}:adjustment:${adjustment.localId}`,
    )
  }

  const evidences = normalizedPayload.evidences ?? []
  const uploadedEvidences: NonNullable<QueuedExecutionEntryPayload['evidences']> = []

  for (let evidenceIndex = 0; evidenceIndex < evidences.length; evidenceIndex += 1) {
    const evidence = evidences[evidenceIndex]
    try {
      assertOfflineOwnerContext(ownerContext)
      await outboxRepository.renewLease(item.localId, item.leaseOwner ?? '')
      await uploadExecutionMedia(
        remoteEntryId,
        evidence,
        normalizedPayload.evidenceCaption,
        item.idempotencyKey,
      )
      assertOfflineOwnerContext(ownerContext)
      uploadedEvidences.push(evidence)
    } catch (error) {
      assertOfflineOwnerContext(ownerContext)
      await outboxRepository.updatePayload(item.localId, {
        ...normalizedPayload,
        evidences: evidences.slice(evidenceIndex),
      })

      try {
        await cleanupExecutionEvidenceDrafts(uploadedEvidences)
      } catch {
        // A limpeza local não deve mascarar o erro real de sincronização.
      }

      throw error
    }
  }

  try {
    await cleanupExecutionEvidenceDrafts(evidences)
  } catch {
    // O envio remoto foi concluído; a limpeza local é melhor esforço.
  }
  assertOfflineOwnerContext(ownerContext)
  await outboxRepository.remove(item.localId)
}

async function syncEmergencyScaffoldOutboxItem(
  item: OutboxItem<EmergencyScaffoldDraft>,
  ownerContext: OfflineOwnerContext,
) {
  assertOfflineOwnerContext(ownerContext)
  const result = await createEmergencyScaffold(item.payload, item.idempotencyKey)
  assertOfflineOwnerContext(ownerContext)
  const scaffold = isScaffoldBatchResponse(result) ? result.items[0] : result

  try {
    await cacheLatestScaffoldFromCreation(
      {
        contractId: item.payload.contractId,
        unitId: item.payload.unitId,
      },
      result,
    )
  } catch {
    // O cadastro remoto foi concluído; o cache será recomposto na próxima atualização online.
  }

  // Após criar o andaime na API, resolve os IDs locais dos serviços.
  // Isso desbloqueia os apontamentos que estavam aguardando esses IDs.
  if (scaffold?.scaffoldServices && scaffold.scaffoldServices.length > 0) {
    assertOfflineOwnerContext(ownerContext)
    await localScaffoldServiceRepository.resolveRemoteIds(item.localId, scaffold.scaffoldServices)
  }

  assertOfflineOwnerContext(ownerContext)
  await outboxRepository.remove(item.localId)
}

async function syncOperationalDeviationOutboxItem(
  item: OutboxItem<OperationalDeviationDraft>,
  ownerContext: OfflineOwnerContext,
) {
  const remoteDeviationId =
    item.remoteId ??
    (assertOfflineOwnerContext(ownerContext),
    await createOperationalDeviation(item.payload.dto, item.idempotencyKey)).id
  assertOfflineOwnerContext(ownerContext)

  if (!item.remoteId) {
    await outboxRepository.updateStatus(item.localId, SyncStatus.SYNCING, {
      remoteId: remoteDeviationId,
      errorMessage: null,
    })
  }

  const evidences = item.payload.evidences ?? []
  const uploadedEvidences: NonNullable<OperationalDeviationDraft['evidences']> = []

  for (let evidenceIndex = 0; evidenceIndex < evidences.length; evidenceIndex += 1) {
    const evidence = evidences[evidenceIndex]
    try {
      assertOfflineOwnerContext(ownerContext)
      await outboxRepository.renewLease(item.localId, item.leaseOwner ?? '')
      await uploadDeviationMedia(
        remoteDeviationId,
        evidence,
        item.payload.evidenceCaption,
        item.idempotencyKey,
      )
      assertOfflineOwnerContext(ownerContext)
      uploadedEvidences.push(evidence)
    } catch (error) {
      assertOfflineOwnerContext(ownerContext)
      await outboxRepository.updatePayload(item.localId, {
        ...item.payload,
        evidences: evidences.slice(evidenceIndex),
      })

      try {
        await cleanupDeviationEvidenceDrafts(uploadedEvidences)
      } catch {
        // A limpeza local não deve mascarar o erro real de sincronização.
      }

      throw error
    }
  }

  try {
    await cleanupDeviationEvidenceDrafts(evidences)
  } catch {
    // O envio remoto foi concluído; a limpeza local é melhor esforço.
  }
  assertOfflineOwnerContext(ownerContext)
  await outboxRepository.remove(item.localId)
}

async function syncCrewMemberAddOutboxItem(
  item: OutboxItem<CrewMemberMutationPayload>,
  ownerContext: OfflineOwnerContext,
) {
  assertOfflineOwnerContext(ownerContext)
  const members = await addCrewMembers(
    item.payload.crewId,
    item.payload.employeeIds,
    item.idempotencyKey,
  )
  assertOfflineOwnerContext(ownerContext)

  if (item.contractId) {
    await applyCrewMembersSnapshot(item.contractId, item.payload.crewId, members)
  }

  assertOfflineOwnerContext(ownerContext)
  await outboxRepository.remove(item.localId)
}

async function syncCrewMemberRemoveOutboxItem(
  item: OutboxItem<CrewMemberRemovalPayload>,
  ownerContext: OfflineOwnerContext,
) {
  assertOfflineOwnerContext(ownerContext)
  await removeCrewMember(item.payload.crewId, item.payload.employeeId, item.idempotencyKey)
  assertOfflineOwnerContext(ownerContext)

  if (item.contractId && item.unitId) {
    const members = await fetchCrewMembers(
      {
        contractId: item.contractId,
        unitId: item.unitId,
      },
      item.payload.crewId,
    )
    assertOfflineOwnerContext(ownerContext)
    await applyCrewMembersSnapshot(item.contractId, item.payload.crewId, members)
  }

  assertOfflineOwnerContext(ownerContext)
  await outboxRepository.remove(item.localId)
}

async function syncOutbox(ownerContext: OfflineOwnerContext) {
  assertOfflineOwnerContext(ownerContext)
  const leaseOwner = createLocalId('sync')
  const allItems = await outboxRepository.claimReady(leaseOwner)

  // Ordena os itens da outbox para garantir que andaimes sejam sincronizados
  // ANTES dos apontamentos que dependem deles. Dentro de cada grupo, a ordem
  // de criação (created_at ASC) é preservada pelo listAll().
  const ordered = [
    ...allItems.filter((i) => i.entityType === OutboxEntityType.EMERGENCY_SCAFFOLD),
    ...allItems.filter(
      (i) =>
        i.entityType !== OutboxEntityType.EMERGENCY_SCAFFOLD &&
        i.entityType !== OutboxEntityType.EXECUTION_ENTRY,
    ),
    ...allItems.filter((i) => i.entityType === OutboxEntityType.EXECUTION_ENTRY),
  ]

  for (const item of ordered) {
    assertOfflineOwnerContext(ownerContext)
    // Para apontamentos que referenciam um serviço local, verifica se o andaime
    // já foi sincronizado neste mesmo ciclo. Se não, o item permanece PENDING e
    // será processado no próximo ciclo de sincronização (após o andaime ser enviado).
    if (item.entityType === OutboxEntityType.EXECUTION_ENTRY) {
      const payload = normalizeQueuedExecutionPayload(item.payload)
      if (payload && isLocalId(payload.entry.scaffoldServiceId)) {
        const localService = await localScaffoldServiceRepository.getByLocalId(
          payload.entry.scaffoldServiceId,
        )
        if (!localService?.remoteId) {
          await outboxRepository.updateStatus(item.localId, SyncStatus.PENDING, {
            nextAttemptAt: new Date(Date.now() + 30_000).toISOString(),
            errorMessage: null,
          })
          continue
        }
      }
    }

    try {
      if (item.entityType === OutboxEntityType.EXECUTION_ENTRY) {
        await syncExecutionOutboxItem(item as OutboxItem<CreateExecutionEntryDto>, ownerContext)
      }

      if (item.entityType === OutboxEntityType.EMERGENCY_SCAFFOLD) {
        await syncEmergencyScaffoldOutboxItem(
          item as OutboxItem<EmergencyScaffoldDraft>,
          ownerContext,
        )
      }

      if (item.entityType === OutboxEntityType.CREW_MEMBER_ADD) {
        await syncCrewMemberAddOutboxItem(
          item as OutboxItem<CrewMemberMutationPayload>,
          ownerContext,
        )
      }

      if (item.entityType === OutboxEntityType.CREW_MEMBER_REMOVE) {
        await syncCrewMemberRemoveOutboxItem(
          item as OutboxItem<CrewMemberRemovalPayload>,
          ownerContext,
        )
      }

      if (item.entityType === OutboxEntityType.OPERATIONAL_DEVIATION) {
        await syncOperationalDeviationOutboxItem(
          item as OutboxItem<OperationalDeviationDraft>,
          ownerContext,
        )
      }
    } catch (error) {
      assertOfflineOwnerContext(ownerContext)
      const permanent = isPermanentSyncError(error)
      const message = getErrorMessage(error, 'Falha ao enviar o registro pendente.')
      const nextRetryCount = item.retryCount + 1
      const status =
        getHttpStatus(error) === 409 && !isRetryableConflict(error)
          ? SyncStatus.CONFLICT
          : (permanent && !isRetryableConflict(error)) || nextRetryCount >= MAX_RETRY_COUNT
            ? SyncStatus.DEAD_LETTER
            : SyncStatus.FAILED

      await outboxRepository.updateStatus(item.localId, status, {
        errorMessage: message,
        retryDelta: 1,
        nextAttemptAt: status === SyncStatus.FAILED ? retryAt(error, nextRetryCount) : null,
        lastErrorCode: safeErrorCode(error),
      })
    }
  }
}

async function syncQueue(ownerContext: OfflineOwnerContext, scope?: SyncScope) {
  if (!scope?.contractId || !scope?.unitId) {
    return
  }

  assertOfflineOwnerContext(ownerContext)
  const items = await fetchQueueServices(scope)
  assertOfflineOwnerContext(ownerContext)
  await queueCacheRepository.replaceForScope(items, scope)
}

async function syncLatestScaffold(ownerContext: OfflineOwnerContext, scope?: SyncScope) {
  if (!scope?.contractId || !scope?.unitId) {
    return
  }

  try {
    assertOfflineOwnerContext(ownerContext)
    await fetchLatestScaffold(scope)
    assertOfflineOwnerContext(ownerContext)
  } catch {
    assertOfflineOwnerContext(ownerContext)
    // Mantém a última referência em cache sem interromper a sincronização operacional.
  }
}

export async function runFullSync(scope?: SyncScope, options?: RunFullSyncOptions) {
  const ownerContext = captureOfflineOwnerContext()
  if (activeSyncPromise) {
    if (activeSyncGeneration !== ownerContext.generation) {
      throw new Error('Existe uma sincronizacao de outra identidade sendo encerrada.')
    }
    return activeSyncPromise
  }

  activeSyncGeneration = ownerContext.generation
  activeSyncPromise = (async () => {
    await syncOutbox(ownerContext)
    if (options?.includeQueue !== false) {
      await Promise.all([syncQueue(ownerContext, scope), syncLatestScaffold(ownerContext, scope)])
    }
    assertOfflineOwnerContext(ownerContext)
    await syncStateRepository.set('lastSyncAt', nowIso())
  })()

  try {
    await activeSyncPromise
  } finally {
    activeSyncPromise = null
    activeSyncGeneration = null
  }
}
