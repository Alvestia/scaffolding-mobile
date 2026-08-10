import { Platform } from 'react-native'
import { withNativeDatabaseLock } from '@/database/client'
import { loadWebRows, saveWebRows } from '@/database/web-storage'
import type { QueueServiceItem } from '@/types/scaffold-service'
import { getBusinessDateKey, nowIso } from '@/utils/date'
import { requireOfflineOwner } from '@/security/offline-owner'

type QueueRow = {
  remote_id: string
  service_id: string
  contract_id: string | null
  unit_id: string | null
  scaffold_id: string | null
  status: string
  payload: string
  fetched_at: string
  last_seen_at: string
}

export const queueCacheRepository = {
  async replaceForScope(
    items: QueueServiceItem[],
    scope: { contractId: string; unitId: string },
  ) {
    const owner = requireOfflineOwner()
    if (Platform.OS === 'web') {
      const timestamp = nowIso()
      const rows = await loadWebRows<QueueRow>('cached_queue_items')
      const preservedRows = rows.filter(
        (row) => row.contract_id !== scope.contractId || row.unit_id !== scope.unitId,
      )

      const nextRows: QueueRow[] = items.map((item) => ({
        remote_id: item.id,
        service_id: item.id,
        contract_id: scope.contractId,
        unit_id: scope.unitId,
        scaffold_id: item.scaffoldId,
        status: item.status,
        payload: JSON.stringify(item),
        fetched_at: timestamp,
        last_seen_at: timestamp,
      }))

      await saveWebRows('cached_queue_items', [...preservedRows, ...nextRows])
      return
    }

    const timestamp = nowIso()

    await withNativeDatabaseLock((db) =>
      db.withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync(
          `DELETE FROM cached_queue_items
           WHERE owner_tenant_id = ? AND owner_user_id = ?
             AND contract_id = ? AND unit_id = ?`,
          [owner.tenantId, owner.userId, scope.contractId, scope.unitId],
        )

        for (const item of items) {
          await tx.runAsync(
            `INSERT OR REPLACE INTO cached_queue_items (
              owner_tenant_id,
              owner_user_id,
              remote_id,
              service_id,
              contract_id,
              unit_id,
              scaffold_id,
              status,
              payload,
              fetched_at,
              last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              owner.tenantId,
              owner.userId,
              item.id,
              item.id,
              scope.contractId,
              scope.unitId,
              item.scaffoldId,
              item.status,
              JSON.stringify(item),
              timestamp,
              timestamp,
            ],
          )
        }
      }),
    )
  },

  async listByScope(
    scope: { contractId: string; unitId: string },
    filters?: { statuses?: string[]; startForecast?: string; endForecast?: string },
  ) {
    const owner = requireOfflineOwner()
    const statusSet = filters?.statuses && filters.statuses.length > 0
      ? new Set(filters.statuses)
      : null
    const startDate = getBusinessDateKey(filters?.startForecast)
    const endDate = getBusinessDateKey(filters?.endForecast)

    const applyFilters = (items: QueueServiceItem[]) =>
      items.filter((item) => {
        if (statusSet && !statusSet.has(item.status)) {
          return false
        }

        if (startDate !== null) {
          const itemStartDate = getBusinessDateKey(item.startForecast)
          if (itemStartDate === null || itemStartDate < startDate) {
            return false
          }
        }

        if (endDate !== null) {
          const itemEndDate = getBusinessDateKey(item.endForecast)
          if (itemEndDate === null || itemEndDate > endDate) {
            return false
          }
        }

        return true
      })

    if (Platform.OS === 'web') {
      const rows = await loadWebRows<QueueRow>('cached_queue_items')
      const items = rows
        .filter((row) => row.contract_id === scope.contractId && row.unit_id === scope.unitId)
        .sort((a, b) => b.fetched_at.localeCompare(a.fetched_at))
        .map((row) => JSON.parse(row.payload) as QueueServiceItem)
      return applyFilters(items)
    }

    const rows = await withNativeDatabaseLock((db) =>
      db.getAllAsync<QueueRow>(
        `SELECT * FROM cached_queue_items
         WHERE contract_id = ? AND unit_id = ?
           AND owner_tenant_id = ? AND owner_user_id = ?
         ORDER BY fetched_at DESC`,
        [scope.contractId, scope.unitId, owner.tenantId, owner.userId],
      ),
    )

    return applyFilters(rows.map((row) => JSON.parse(row.payload) as QueueServiceItem))
  },

  async getByServiceId(serviceId: string) {
    const owner = requireOfflineOwner()
    if (Platform.OS === 'web') {
      const rows = await loadWebRows<QueueRow>('cached_queue_items')
      const row = rows.find((item) => item.service_id === serviceId) ?? null
      return row ? (JSON.parse(row.payload) as QueueServiceItem) : null
    }

    const row = await withNativeDatabaseLock((db) =>
      db.getFirstAsync<QueueRow>(
        `SELECT * FROM cached_queue_items
         WHERE owner_tenant_id = ? AND owner_user_id = ? AND service_id = ?
         LIMIT 1`,
        [owner.tenantId, owner.userId, serviceId],
      ),
    )

    return row ? (JSON.parse(row.payload) as QueueServiceItem) : null
  },
}
