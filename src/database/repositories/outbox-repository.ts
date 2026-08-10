import { Platform } from 'react-native'
import { withNativeDatabaseLock } from '@/database/client'
import { loadWebRows, saveWebRows } from '@/database/web-storage'
import {
  OutboxEntityType,
  SyncStatus,
  type OutboxItem,
} from '@/types/sync'
import { normalizeQueuedExecutionPayload } from '@/utils/queued-execution'
import { nowIso } from '@/utils/date'
import { decryptOfflinePayload, encryptOfflinePayload } from '@/services/offline-crypto.service'
import { requireOfflineOwner } from '@/security/offline-owner'

type OutboxRow = {
  local_id: string
  entity_type: OutboxEntityType
  remote_id: string | null
  contract_id: string | null
  unit_id: string | null
  sync_status: SyncStatus
  retry_count: number
  idempotency_key: string | null
  next_attempt_at: string | null
  locked_at: string | null
  lease_until: string | null
  lease_owner: string | null
  last_error_code: string | null
  error_message: string | null
  payload: string
  created_at: string
  updated_at: string
}

async function decodePayload(payload: unknown) {
  if (typeof payload === 'string') {
    return decryptOfflinePayload(payload)
  }

  return payload
}

export const outboxRepository = {
  async enqueue(
    item: Omit<
      OutboxItem,
      | 'createdAt'
      | 'updatedAt'
      | 'retryCount'
      | 'idempotencyKey'
      | 'nextAttemptAt'
      | 'lockedAt'
      | 'leaseUntil'
      | 'leaseOwner'
      | 'lastErrorCode'
    >,
  ) {
    const owner = requireOfflineOwner()
    const encryptedPayload = await encryptOfflinePayload(item.payload)

    if (Platform.OS === 'web') {
      const timestamp = nowIso()
      const rows = await loadWebRows<OutboxItem>('outbox_items')
      const nextItem: OutboxItem = {
        ...item,
        retryCount: 0,
        idempotencyKey: item.localId,
        nextAttemptAt: timestamp,
        lockedAt: null,
        leaseUntil: null,
        leaseOwner: null,
        lastErrorCode: null,
        errorMessage: item.errorMessage ?? null,
        payload: encryptedPayload,
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      await saveWebRows(
        'outbox_items',
        [...rows.filter((row) => row.localId !== item.localId), nextItem],
      )
      return
    }

    const timestamp = nowIso()

    await withNativeDatabaseLock((db) =>
      db.runAsync(
        `INSERT OR REPLACE INTO outbox_items (
          owner_tenant_id,
          owner_user_id,
          local_id,
          entity_type,
          remote_id,
          contract_id,
          unit_id,
          sync_status,
          retry_count,
          idempotency_key,
          next_attempt_at,
          locked_at,
          lease_until,
          lease_owner,
          last_error_code,
          error_message,
          payload,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          owner.tenantId,
          owner.userId,
          item.localId,
          item.entityType,
          item.remoteId ?? null,
          item.contractId ?? null,
          item.unitId ?? null,
          item.syncStatus,
          0,
          item.localId,
          timestamp,
          null,
          null,
          null,
          null,
          item.errorMessage ?? null,
          encryptedPayload,
          timestamp,
          timestamp,
        ],
      ),
    )
  },

  async listAll() {
    const owner = requireOfflineOwner()
    if (Platform.OS === 'web') {
      const rows = await loadWebRows<OutboxItem>('outbox_items')
      const decodedRows = await Promise.all(
        rows.map(async (row) => ({
          ...row,
          payload: await decodePayload(row.payload),
        })),
      )
      return decodedRows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    }

    const rows = await withNativeDatabaseLock((db) =>
      db.getAllAsync<OutboxRow>(
        `SELECT * FROM outbox_items
         WHERE owner_tenant_id = ? AND owner_user_id = ?
         ORDER BY created_at ASC`,
        [owner.tenantId, owner.userId],
      ),
    )

    return Promise.all(
      rows.map<Promise<OutboxItem>>(async (row) => ({
        localId: row.local_id,
        entityType: row.entity_type,
        remoteId: row.remote_id,
        contractId: row.contract_id,
        unitId: row.unit_id,
        syncStatus: row.sync_status,
        retryCount: row.retry_count,
        idempotencyKey: row.idempotency_key ?? row.local_id,
        nextAttemptAt: row.next_attempt_at,
        lockedAt: row.locked_at,
        leaseUntil: row.lease_until,
        leaseOwner: row.lease_owner,
        lastErrorCode: row.last_error_code,
        errorMessage: row.error_message,
        payload: await decodePayload(row.payload),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    )
  },

  async getByLocalId(localId: string) {
    const owner = requireOfflineOwner()
    if (Platform.OS === 'web') {
      const rows = await loadWebRows<OutboxItem>('outbox_items')
      const row = rows.find((item) => item.localId === localId)
      if (!row) {
        return null
      }

      return {
        ...row,
        payload: await decodePayload(row.payload),
      }
    }

    const row = await withNativeDatabaseLock((db) =>
      db.getFirstAsync<OutboxRow>(
        `SELECT * FROM outbox_items
         WHERE owner_tenant_id = ? AND owner_user_id = ? AND local_id = ?
         LIMIT 1`,
        [owner.tenantId, owner.userId, localId],
      ),
    )

    if (!row) {
      return null
    }

    return {
      localId: row.local_id,
      entityType: row.entity_type,
      remoteId: row.remote_id,
      contractId: row.contract_id,
      unitId: row.unit_id,
      syncStatus: row.sync_status,
      retryCount: row.retry_count,
      idempotencyKey: row.idempotency_key ?? row.local_id,
      nextAttemptAt: row.next_attempt_at,
      lockedAt: row.locked_at,
      leaseUntil: row.lease_until,
      leaseOwner: row.lease_owner,
      lastErrorCode: row.last_error_code,
      errorMessage: row.error_message,
      payload: await decodePayload(row.payload),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } as OutboxItem
  },

  async updateStatus(
    localId: string,
    syncStatus: SyncStatus,
    options?: {
      errorMessage?: string | null
      retryDelta?: number
      remoteId?: string | null
      nextAttemptAt?: string | null
      lastErrorCode?: string | null
    },
  ) {
    const owner = requireOfflineOwner()
    if (Platform.OS === 'web') {
      const rows = await loadWebRows<OutboxItem>('outbox_items')
      const current = rows.find((row) => row.localId === localId)

      if (!current) {
        return
      }

      const nextRows = rows.map((row) =>
        row.localId === localId
          ? {
              ...row,
              syncStatus,
              retryCount: row.retryCount + (options?.retryDelta ?? 0),
              errorMessage: options?.errorMessage ?? null,
              nextAttemptAt: options?.nextAttemptAt ?? row.nextAttemptAt ?? null,
              lastErrorCode: options?.lastErrorCode ?? null,
              lockedAt: syncStatus === SyncStatus.SYNCING ? row.lockedAt : null,
              leaseUntil: syncStatus === SyncStatus.SYNCING ? row.leaseUntil : null,
              leaseOwner: syncStatus === SyncStatus.SYNCING ? row.leaseOwner : null,
              remoteId: options?.remoteId ?? row.remoteId,
              updatedAt: nowIso(),
            }
          : row,
      )

      await saveWebRows('outbox_items', nextRows)
      return
    }

    const current = await withNativeDatabaseLock((db) =>
      db.getFirstAsync<OutboxRow>(
        `SELECT * FROM outbox_items
         WHERE owner_tenant_id = ? AND owner_user_id = ? AND local_id = ?
         LIMIT 1`,
        [owner.tenantId, owner.userId, localId],
      ),
    )

    if (!current) {
      return
    }

    await withNativeDatabaseLock((db) =>
      db.runAsync(
        `UPDATE outbox_items
         SET sync_status = ?, retry_count = ?, error_message = ?, remote_id = ?,
             next_attempt_at = ?, last_error_code = ?,
             locked_at = CASE WHEN ? = 'syncing' THEN locked_at ELSE NULL END,
             lease_until = CASE WHEN ? = 'syncing' THEN lease_until ELSE NULL END,
             lease_owner = CASE WHEN ? = 'syncing' THEN lease_owner ELSE NULL END,
             updated_at = ?
         WHERE owner_tenant_id = ? AND owner_user_id = ? AND local_id = ?`,
        [
          syncStatus,
          current.retry_count + (options?.retryDelta ?? 0),
          options?.errorMessage ?? null,
          options?.remoteId ?? current.remote_id,
          options?.nextAttemptAt ?? current.next_attempt_at,
          options?.lastErrorCode ?? null,
          syncStatus,
          syncStatus,
          syncStatus,
          nowIso(),
          owner.tenantId,
          owner.userId,
          localId,
        ],
      ),
    )
  },

  async updatePayload(localId: string, payload: unknown) {
    const owner = requireOfflineOwner()
    const encryptedPayload = await encryptOfflinePayload(payload)

    if (Platform.OS === 'web') {
      const rows = await loadWebRows<OutboxItem>('outbox_items')
      const nextRows = rows.map((row) =>
        row.localId === localId
          ? {
              ...row,
              payload: encryptedPayload,
              updatedAt: nowIso(),
            }
          : row,
      )

      await saveWebRows('outbox_items', nextRows)
      return
    }

    await withNativeDatabaseLock((db) =>
      db.runAsync(
        `UPDATE outbox_items
         SET payload = ?, updated_at = ?
         WHERE owner_tenant_id = ? AND owner_user_id = ? AND local_id = ?`,
        [encryptedPayload, nowIso(), owner.tenantId, owner.userId, localId],
      ),
    )
  },

  async claimReady(leaseOwner: string, limit = 20, leaseMs = 2 * 60_000) {
    const owner = requireOfflineOwner()
    const now = nowIso()
    const leaseUntil = new Date(Date.now() + leaseMs).toISOString()

    if (Platform.OS === 'web') {
      const rows = await loadWebRows<OutboxItem>('outbox_items')
      const recovered = rows.map((row) =>
        row.syncStatus === SyncStatus.SYNCING &&
        (!row.leaseUntil || row.leaseUntil <= now)
          ? {
              ...row,
              syncStatus: SyncStatus.PENDING,
              lockedAt: null,
              leaseUntil: null,
              leaseOwner: null,
            }
          : row,
      )
      const readyIds = new Set(
        recovered
          .filter(
            (row) =>
              (row.syncStatus === SyncStatus.PENDING || row.syncStatus === SyncStatus.FAILED) &&
              (!row.nextAttemptAt || row.nextAttemptAt <= now) &&
              (!row.leaseUntil || row.leaseUntil <= now),
          )
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .slice(0, limit)
          .map((row) => row.localId),
      )
      const nextRows = recovered.map((row) =>
        readyIds.has(row.localId)
          ? {
              ...row,
              idempotencyKey: row.idempotencyKey ?? row.localId,
              syncStatus: SyncStatus.SYNCING,
              lockedAt: now,
              leaseUntil,
              leaseOwner,
              updatedAt: now,
            }
          : row,
      )
      await saveWebRows('outbox_items', nextRows)
      return Promise.all(
        nextRows
          .filter((row) => readyIds.has(row.localId))
          .map(async (row) => ({
            ...row,
            payload: await decodePayload(row.payload),
          })),
      )
    }

    let claimed: OutboxRow[] = []
    await withNativeDatabaseLock((db) =>
      db.withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync(
          `UPDATE outbox_items
           SET sync_status = 'pending', locked_at = NULL, lease_until = NULL,
               lease_owner = NULL, updated_at = ?
           WHERE owner_tenant_id = ? AND owner_user_id = ?
             AND sync_status = 'syncing'
             AND (lease_until IS NULL OR lease_until <= ?)`,
          [now, owner.tenantId, owner.userId, now],
        )
        const candidates = await tx.getAllAsync<OutboxRow>(
          `SELECT * FROM outbox_items
           WHERE owner_tenant_id = ? AND owner_user_id = ?
             AND sync_status IN ('pending', 'failed')
             AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
             AND (lease_until IS NULL OR lease_until <= ?)
           ORDER BY created_at ASC
           LIMIT ?`,
          [owner.tenantId, owner.userId, now, now, Math.min(limit, 50)],
        )
        for (const row of candidates) {
          await tx.runAsync(
            `UPDATE outbox_items
             SET sync_status = 'syncing', locked_at = ?, lease_until = ?,
                 lease_owner = ?, updated_at = ?
             WHERE owner_tenant_id = ? AND owner_user_id = ? AND local_id = ?
               AND sync_status IN ('pending', 'failed')`,
            [
              now,
              leaseUntil,
              leaseOwner,
              now,
              owner.tenantId,
              owner.userId,
              row.local_id,
            ],
          )
        }
        claimed = await tx.getAllAsync<OutboxRow>(
          `SELECT * FROM outbox_items
           WHERE owner_tenant_id = ? AND owner_user_id = ? AND lease_owner = ?
           ORDER BY created_at ASC`,
          [owner.tenantId, owner.userId, leaseOwner],
        )
      }),
    )

    return Promise.all(
      claimed.map<Promise<OutboxItem>>(async (row) => ({
        localId: row.local_id,
        entityType: row.entity_type,
        remoteId: row.remote_id,
        contractId: row.contract_id,
        unitId: row.unit_id,
        syncStatus: SyncStatus.SYNCING,
        retryCount: row.retry_count,
        idempotencyKey: row.idempotency_key ?? row.local_id,
        nextAttemptAt: row.next_attempt_at,
        lockedAt: row.locked_at,
        leaseUntil: row.lease_until,
        leaseOwner: row.lease_owner,
        lastErrorCode: row.last_error_code,
        errorMessage: row.error_message,
        payload: await decodePayload(row.payload),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    )
  },

  async renewLease(localId: string, leaseOwner: string, leaseMs = 2 * 60_000) {
    const owner = requireOfflineOwner()
    const leaseUntil = new Date(Date.now() + leaseMs).toISOString()
    if (Platform.OS === 'web') {
      const rows = await loadWebRows<OutboxItem>('outbox_items')
      await saveWebRows(
        'outbox_items',
        rows.map((row) =>
          row.localId === localId && row.leaseOwner === leaseOwner
            ? { ...row, leaseUntil, updatedAt: nowIso() }
            : row,
        ),
      )
      return
    }
    await withNativeDatabaseLock((db) =>
      db.runAsync(
        `UPDATE outbox_items SET lease_until = ?, updated_at = ?
         WHERE owner_tenant_id = ? AND owner_user_id = ? AND local_id = ?
           AND lease_owner = ? AND sync_status = 'syncing'`,
        [leaseUntil, nowIso(), owner.tenantId, owner.userId, localId, leaseOwner],
      ),
    )
  },

  async listPendingExecutionsByServiceId(scope: {
    contractId: string
    unitId: string
  }): Promise<Map<string, { inputType: string; inputValue: number }[]>> {
    const items = await this.listAll()
    const map = new Map<string, { inputType: string; inputValue: number }[]>()

    for (const item of items) {
      if (item.entityType !== OutboxEntityType.EXECUTION_ENTRY) {
        continue
      }
      if (item.contractId !== scope.contractId || item.unitId !== scope.unitId) {
        continue
      }
      const payload = normalizeQueuedExecutionPayload(item.payload)
      const serviceId = payload?.entry?.scaffoldServiceId
      if (!serviceId) {
        continue
      }
      const existing = map.get(serviceId) ?? []
      existing.push({
        inputType: payload.entry.inputType,
        inputValue: payload.entry.inputValue,
      })
      map.set(serviceId, existing)
    }

    return map
  },

  async remove(localId: string) {
    const owner = requireOfflineOwner()
    if (Platform.OS === 'web') {
      const rows = await loadWebRows<OutboxItem>('outbox_items')
      await saveWebRows(
        'outbox_items',
        rows.filter((row) => row.localId !== localId),
      )
      return
    }

    await withNativeDatabaseLock((db) =>
      db.runAsync(
        `DELETE FROM outbox_items
         WHERE owner_tenant_id = ? AND owner_user_id = ? AND local_id = ?`,
        [owner.tenantId, owner.userId, localId],
      ),
    )
  },
}
