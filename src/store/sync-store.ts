import { create } from 'zustand'
import { outboxRepository } from '@/database/repositories/outbox-repository'
import { syncStateRepository } from '@/database/repositories/sync-state-repository'
import { cleanupExecutionEvidenceDrafts } from '@/services/execution-media.service'
import { cleanupDeviationEvidenceDrafts } from '@/services/deviation-media.service'
import {
  runManualSync,
  type ManualSyncScope,
  type ManualSyncStep,
} from '@/services/manual-sync.service'
import { runFullSync } from '@/sync/sync-engine'
import type { OperationalDeviationDraft } from '@/types/operational-deviation'
import { OutboxEntityType, SyncStatus, type OutboxItem } from '@/types/sync'
import { getErrorMessage } from '@/utils/error'
import { normalizeQueuedExecutionPayload } from '@/utils/queued-execution'

type SyncStore = {
  isSyncing: boolean
  lastSyncAt: string | null
  outboxItems: OutboxItem[]
  pendingCount: number
  failedCount: number
  lastError: string | null
  refreshState: () => Promise<void>
  runSyncNow: (scope?: { contractId: string; unitId: string } | null) => Promise<void>
  runManualSyncNow: (
    scope: ManualSyncScope,
    onProgress?: (steps: ManualSyncStep[]) => void,
  ) => Promise<void>
  retryItem: (localId: string, scope?: { contractId: string; unitId: string } | null) => Promise<void>
  removeItem: (localId: string) => Promise<void>
  resetState: () => void
}

function countPending(items: OutboxItem[]) {
  return items.filter(
    (item) =>
      item.syncStatus === SyncStatus.PENDING ||
      item.syncStatus === SyncStatus.SYNCING,
  ).length
}

function countFailures(items: OutboxItem[]) {
  const failureStatuses: readonly SyncStatus[] = [
    SyncStatus.FAILED,
    SyncStatus.DEAD_LETTER,
    SyncStatus.CONFLICT,
  ]
  return items.filter((item) => failureStatuses.includes(item.syncStatus)).length
}

export const useSyncStore = create<SyncStore>((set) => ({
  isSyncing: false,
  lastSyncAt: null,
  outboxItems: [],
  pendingCount: 0,
  failedCount: 0,
  lastError: null,
  resetState: () =>
    set({
      isSyncing: false,
      lastSyncAt: null,
      outboxItems: [],
      pendingCount: 0,
      failedCount: 0,
      lastError: null,
    }),
  refreshState: async () => {
    const [outboxItems, lastSyncAt] = await Promise.all([
      outboxRepository.listAll(),
      syncStateRepository.get('lastSyncAt'),
    ])

    set({
      outboxItems,
      lastSyncAt,
      pendingCount: countPending(outboxItems),
      failedCount: countFailures(outboxItems),
    })
  },
  runSyncNow: async (scope) => {
    try {
      set({ isSyncing: true, lastError: null })
      await runFullSync(scope ?? undefined)
      const [outboxItems, lastSyncAt] = await Promise.all([
        outboxRepository.listAll(),
        syncStateRepository.get('lastSyncAt'),
      ])

      set({
        isSyncing: false,
        outboxItems,
        lastSyncAt,
        pendingCount: countPending(outboxItems),
        failedCount: countFailures(outboxItems),
      })
    } catch (error) {
      set({
        isSyncing: false,
        lastError: getErrorMessage(error, 'Falha ao sincronizar.'),
      })
    }
  },
  runManualSyncNow: async (scope, onProgress) => {
    try {
      set({ isSyncing: true, lastError: null })
      await runManualSync(scope, onProgress)
      const [outboxItems, lastSyncAt] = await Promise.all([
        outboxRepository.listAll(),
        syncStateRepository.get('lastSyncAt'),
      ])

      set({
        isSyncing: false,
        outboxItems,
        lastSyncAt,
        pendingCount: countPending(outboxItems),
        failedCount: countFailures(outboxItems),
      })
    } catch (error) {
      const message = getErrorMessage(error, 'Falha ao sincronizar.')
      set({
        isSyncing: false,
        lastError: message,
      })
      throw error
    }
  },
  retryItem: async (localId, scope) => {
    await outboxRepository.updateStatus(localId, 'pending', {
      errorMessage: null,
      nextAttemptAt: new Date().toISOString(),
      lastErrorCode: null,
    })

    const [outboxItems, lastSyncAt] = await Promise.all([
      outboxRepository.listAll(),
      syncStateRepository.get('lastSyncAt'),
    ])

    set({
      outboxItems,
      lastSyncAt,
      pendingCount: countPending(outboxItems),
      failedCount: countFailures(outboxItems),
      lastError: null,
    })

    if (scope?.contractId && scope?.unitId) {
      await useSyncStore.getState().runSyncNow(scope)
    }
  },
  removeItem: async (localId) => {
    const currentItem = await outboxRepository.getByLocalId(localId)

    if (currentItem?.entityType === OutboxEntityType.EXECUTION_ENTRY) {
      const payload = normalizeQueuedExecutionPayload(currentItem.payload)
      await cleanupExecutionEvidenceDrafts(payload?.evidences)
    }

    if (currentItem?.entityType === OutboxEntityType.OPERATIONAL_DEVIATION) {
      const payload = currentItem.payload as OperationalDeviationDraft | undefined
      await cleanupDeviationEvidenceDrafts(payload?.evidences)
    }

    await outboxRepository.remove(localId)

    const [outboxItems, lastSyncAt] = await Promise.all([
      outboxRepository.listAll(),
      syncStateRepository.get('lastSyncAt'),
    ])

    set({
      outboxItems,
      lastSyncAt,
      pendingCount: countPending(outboxItems),
      failedCount: countFailures(outboxItems),
    })
  },
}))
