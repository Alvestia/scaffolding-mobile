import AsyncStorage from '@react-native-async-storage/async-storage'
import { buildOwnedStorageKey } from '@/security/offline-owner'

const KEY_PREFIX = 'scaffolding_mobile_web_db'

function buildKey(key: string) {
  return buildOwnedStorageKey(`${KEY_PREFIX}:${key}`)
}

export async function loadWebRows<T>(key: string) {
  const raw = await AsyncStorage.getItem(buildKey(key))

  if (!raw) {
    return [] as T[]
  }

  try {
    return JSON.parse(raw) as T[]
  } catch {
    return [] as T[]
  }
}

export async function saveWebRows<T>(key: string, rows: T[]) {
  await AsyncStorage.setItem(buildKey(key), JSON.stringify(rows))
}

export async function loadWebRecord<T>(key: string) {
  const raw = await AsyncStorage.getItem(buildKey(key))

  if (!raw) {
    return {} as Record<string, T>
  }

  try {
    return JSON.parse(raw) as Record<string, T>
  } catch {
    return {} as Record<string, T>
  }
}

export async function saveWebRecord<T>(key: string, value: Record<string, T>) {
  await AsyncStorage.setItem(buildKey(key), JSON.stringify(value))
}
