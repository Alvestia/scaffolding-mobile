import { Platform } from 'react-native'
import { withNativeDatabaseLock } from '@/database/client'
import { loadWebRecord, saveWebRecord } from '@/database/web-storage'
import { nowIso } from '@/utils/date'
import { requireOfflineOwner } from '@/security/offline-owner'

type SyncStateRow = {
  key: string
  value: string
  updated_at: string
}

export const syncStateRepository = {
  async set(key: string, value: string) {
    const owner = requireOfflineOwner()
    if (Platform.OS === 'web') {
      const record = await loadWebRecord<SyncStateRow>('sync_state')
      record[key] = {
        key,
        value,
        updated_at: nowIso(),
      }
      await saveWebRecord('sync_state', record)
      return
    }

    await withNativeDatabaseLock((db) =>
      db.runAsync(
        `INSERT OR REPLACE INTO sync_state (
           owner_tenant_id, owner_user_id, key, value, updated_at
         ) VALUES (?, ?, ?, ?, ?)`,
        [owner.tenantId, owner.userId, key, value, nowIso()],
      ),
    )
  },

  async get(key: string) {
    const owner = requireOfflineOwner()
    if (Platform.OS === 'web') {
      const record = await loadWebRecord<SyncStateRow>('sync_state')
      return record[key]?.value ?? null
    }

    const row = await withNativeDatabaseLock((db) =>
      db.getFirstAsync<SyncStateRow>(
        `SELECT * FROM sync_state
         WHERE owner_tenant_id = ? AND owner_user_id = ? AND key = ?
         LIMIT 1`,
        [owner.tenantId, owner.userId, key],
      ),
    )

    return row?.value ?? null
  },
}
