import { Platform } from 'react-native'
import { withNativeDatabaseLock } from '@/database/client'
import { loadWebRows, saveWebRows } from '@/database/web-storage'
import type { LocalScaffoldService } from '@/types/local-scaffold'
import { SyncStatus } from '@/types/sync'
import { nowIso } from '@/utils/date'
import { requireOfflineOwner } from '@/security/offline-owner'

type LocalScaffoldServiceRow = {
  local_id: string
  local_scaffold_id: string
  remote_id: string | null
  type: string
  planned_unit: string
  planned_quantity: number | null
  description: string | null
  scaffold_code: string | null
  scaffold_description: string | null
  contract_id: string
  unit_id: string
  sync_status: string
  created_at: string
  updated_at: string
}

function rowToModel(row: LocalScaffoldServiceRow): LocalScaffoldService {
  return {
    localId: row.local_id,
    localScaffoldId: row.local_scaffold_id,
    remoteId: row.remote_id,
    type: row.type as LocalScaffoldService['type'],
    plannedUnit: row.planned_unit as LocalScaffoldService['plannedUnit'],
    plannedQuantity: row.planned_quantity,
    description: row.description,
    scaffoldCode: row.scaffold_code,
    scaffoldDescription: row.scaffold_description,
    contractId: row.contract_id,
    unitId: row.unit_id,
    syncStatus: row.sync_status as LocalScaffoldService['syncStatus'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const localScaffoldServiceRepository = {
  async insert(
    item: Omit<LocalScaffoldService, 'createdAt' | 'updatedAt' | 'remoteId'>,
  ): Promise<void> {
    const owner = requireOfflineOwner()
    const timestamp = nowIso()

    if (Platform.OS === 'web') {
      const rows = await loadWebRows<LocalScaffoldService>('local_scaffold_services')
      const newItem: LocalScaffoldService = {
        ...item,
        remoteId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await saveWebRows('local_scaffold_services', [...rows, newItem])
      return
    }

    await withNativeDatabaseLock((db) =>
      db.runAsync(
        `INSERT OR REPLACE INTO local_scaffold_services (
          owner_tenant_id, owner_user_id,
          local_id, local_scaffold_id, remote_id, type, planned_unit,
          planned_quantity, description, scaffold_code, scaffold_description,
          contract_id, unit_id, sync_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          owner.tenantId,
          owner.userId,
          item.localId,
          item.localScaffoldId,
          null,
          item.type,
          item.plannedUnit,
          item.plannedQuantity ?? null,
          item.description ?? null,
          item.scaffoldCode ?? null,
          item.scaffoldDescription ?? null,
          item.contractId,
          item.unitId,
          item.syncStatus,
          timestamp,
          timestamp,
        ],
      ),
    )
  },

  async getByLocalId(localId: string): Promise<LocalScaffoldService | null> {
    const owner = requireOfflineOwner()
    if (Platform.OS === 'web') {
      const rows = await loadWebRows<LocalScaffoldService>('local_scaffold_services')
      return rows.find((row) => row.localId === localId) ?? null
    }

    const row = await withNativeDatabaseLock((db) =>
      db.getFirstAsync<LocalScaffoldServiceRow>(
        `SELECT * FROM local_scaffold_services
         WHERE owner_tenant_id = ? AND owner_user_id = ? AND local_id = ?
         LIMIT 1`,
        [owner.tenantId, owner.userId, localId],
      ),
    )

    return row ? rowToModel(row) : null
  },

  async listPendingByScope(scope: {
    contractId: string
    unitId: string
  }): Promise<LocalScaffoldService[]> {
    const owner = requireOfflineOwner()
    if (Platform.OS === 'web') {
      const rows = await loadWebRows<LocalScaffoldService>('local_scaffold_services')
      return rows.filter(
        (row) =>
          row.contractId === scope.contractId &&
          row.unitId === scope.unitId &&
          row.syncStatus === SyncStatus.PENDING,
      )
    }

    const rows = await withNativeDatabaseLock((db) =>
      db.getAllAsync<LocalScaffoldServiceRow>(
        `SELECT * FROM local_scaffold_services
         WHERE contract_id = ? AND unit_id = ? AND sync_status = ?
           AND owner_tenant_id = ? AND owner_user_id = ?
         ORDER BY created_at ASC`,
        [
          scope.contractId,
          scope.unitId,
          SyncStatus.PENDING,
          owner.tenantId,
          owner.userId,
        ],
      ),
    )

    return rows.map(rowToModel)
  },

  /**
   * Após o andaime ser criado na API, recebe os serviços reais retornados pelo backend
   * e mapeia cada serviço local (por tipo) ao seu ID remoto correspondente.
   * Marca os serviços resolvidos como SYNCED para que não apareçam mais na fila local.
   */
  async resolveRemoteIds(
    localScaffoldId: string,
    services: { id: string; type: string }[],
  ): Promise<void> {
    const owner = requireOfflineOwner()
    const timestamp = nowIso()

    if (Platform.OS === 'web') {
      const rows = await loadWebRows<LocalScaffoldService>('local_scaffold_services')
      const updated = rows.map((row) => {
        if (row.localScaffoldId !== localScaffoldId) {
          return row
        }
        const match = services.find((s) => s.type === row.type)
        if (!match) {
          return row
        }
        return {
          ...row,
          remoteId: match.id,
          syncStatus: SyncStatus.SYNCED,
          updatedAt: timestamp,
        }
      })
      await saveWebRows('local_scaffold_services', updated)
      return
    }

    const localRows = await withNativeDatabaseLock((db) =>
      db.getAllAsync<LocalScaffoldServiceRow>(
        `SELECT * FROM local_scaffold_services
         WHERE owner_tenant_id = ? AND owner_user_id = ? AND local_scaffold_id = ?`,
        [owner.tenantId, owner.userId, localScaffoldId],
      ),
    )

    for (const row of localRows) {
      const match = services.find((s) => s.type === row.type)
      if (!match) {
        continue
      }

      await withNativeDatabaseLock((db) =>
        db.runAsync(
          `UPDATE local_scaffold_services
           SET remote_id = ?, sync_status = ?, updated_at = ?
           WHERE owner_tenant_id = ? AND owner_user_id = ? AND local_id = ?`,
          [
            match.id,
            SyncStatus.SYNCED,
            timestamp,
            owner.tenantId,
            owner.userId,
            row.local_id,
          ],
        ),
      )
    }
  },

  async remove(localId: string): Promise<void> {
    const owner = requireOfflineOwner()
    if (Platform.OS === 'web') {
      const rows = await loadWebRows<LocalScaffoldService>('local_scaffold_services')
      await saveWebRows(
        'local_scaffold_services',
        rows.filter((row) => row.localId !== localId),
      )
      return
    }

    await withNativeDatabaseLock((db) =>
      db.runAsync(
        `DELETE FROM local_scaffold_services
         WHERE owner_tenant_id = ? AND owner_user_id = ? AND local_id = ?`,
        [owner.tenantId, owner.userId, localId],
      ),
    )
  },
}
