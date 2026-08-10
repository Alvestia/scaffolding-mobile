import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { withNativeDatabaseLock } from '@/database/client'
import { nowIso } from '@/utils/date'
import { buildOwnedStorageKey, requireOfflineOwner } from '@/security/offline-owner'

const KEY_PREFIX = 'scaffold_mobile_reference_cache'

type ReferenceRow = {
  cache_key: string
  payload: string
}

function buildKey(key: string) {
  return buildOwnedStorageKey(`${KEY_PREFIX}:${key}`)
}

export async function setReferenceCache<T>(key: string, value: T) {
  const owner = requireOfflineOwner()
  const payload = JSON.stringify(value)

  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(buildKey(key), payload)
    return
  }

  await withNativeDatabaseLock((db) =>
    db.runAsync(
      `INSERT OR REPLACE INTO reference_records (
         owner_tenant_id, owner_user_id, cache_key, payload, updated_at
       ) VALUES (?, ?, ?, ?, ?)`,
      [owner.tenantId, owner.userId, key, payload, nowIso()],
    ),
  )
}

export async function getReferenceCache<T>(key: string) {
  const owner = requireOfflineOwner()
  if (Platform.OS === 'web') {
    const raw = await AsyncStorage.getItem(buildKey(key))
    if (!raw) {
      return null
    }

    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  const row = await withNativeDatabaseLock((db) =>
    db.getFirstAsync<ReferenceRow>(
      `SELECT cache_key, payload FROM reference_records
       WHERE owner_tenant_id = ? AND owner_user_id = ? AND cache_key = ?
       LIMIT 1`,
      [owner.tenantId, owner.userId, key],
    ),
  )

  if (!row?.payload) {
    return null
  }

  try {
    return JSON.parse(row.payload) as T
  } catch {
    return null
  }
}

export async function removeReferenceCache(key: string) {
  const owner = requireOfflineOwner()
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(buildKey(key))
    return
  }

  await withNativeDatabaseLock((db) =>
    db.runAsync(
      `DELETE FROM reference_records
       WHERE owner_tenant_id = ? AND owner_user_id = ? AND cache_key = ?`,
      [owner.tenantId, owner.userId, key],
    ),
  )
}
