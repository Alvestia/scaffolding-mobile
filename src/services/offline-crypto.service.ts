import 'react-native-get-random-values'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { gcm } from '@noble/ciphers/aes.js'
import { bytesToHex, hexToBytes, randomBytes } from '@noble/ciphers/utils.js'
import {
  assertOfflineOwnerContext,
  buildOwnedStorageKey,
  captureOfflineOwnerContext,
} from '@/security/offline-owner'

const KEY_STORAGE = 'scaffold_mobile_outbox_payload_key_v1'
const ENCRYPTION_PREFIX = 'enc:v1:'
const pendingKeys = new Map<string, Promise<Uint8Array>>()

function canUseSecureStore() {
  if (Platform.OS === 'web') return false
  const available =
    typeof SecureStore.getItemAsync === 'function' && typeof SecureStore.setItemAsync === 'function'
  if (!available) throw new Error('Armazenamento seguro indisponível para os dados offline.')
  return true
}

async function loadKey(ownedKeyStorage: string, allowCreate: boolean) {
  const stored = canUseSecureStore()
    ? await SecureStore.getItemAsync(ownedKeyStorage)
    : await AsyncStorage.getItem(ownedKeyStorage)

  if (stored) {
    const key = hexToBytes(stored)
    if (key.length !== 32) throw new Error('A chave dos dados offline é inválida.')
    return key
  }

  if (!allowCreate) throw new Error('A chave dos dados offline não está disponível neste aparelho.')

  const key = randomBytes(32)
  const encoded = bytesToHex(key)

  if (canUseSecureStore()) {
    await SecureStore.setItemAsync(ownedKeyStorage, encoded, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    })
  } else {
    await AsyncStorage.setItem(ownedKeyStorage, encoded)
  }

  return key
}

function getKey(allowCreate: boolean) {
  const storageKey = buildOwnedStorageKey(KEY_STORAGE)
  let pending = pendingKeys.get(storageKey)
  if (!pending) {
    pending = loadKey(storageKey, allowCreate).finally(() => pendingKeys.delete(storageKey))
    pendingKeys.set(storageKey, pending)
  }
  return pending
}

export function isEncryptedPayload(value: string) {
  return value.startsWith(ENCRYPTION_PREFIX)
}

export async function encryptOfflinePayload(payload: unknown) {
  const ownerContext = captureOfflineOwnerContext()
  const key = await getKey(true)
  assertOfflineOwnerContext(ownerContext)
  const nonce = randomBytes(12)
  const plaintext = new TextEncoder().encode(JSON.stringify(payload))
  const ciphertext = gcm(key, nonce).encrypt(plaintext)

  return `${ENCRYPTION_PREFIX}${bytesToHex(nonce)}:${bytesToHex(ciphertext)}`
}

export async function decryptOfflinePayload<TPayload = unknown>(payload: string) {
  if (!isEncryptedPayload(payload)) {
    return JSON.parse(payload) as TPayload
  }

  const [, encoded] = payload.split(ENCRYPTION_PREFIX)
  const [nonceHex, ciphertextHex] = encoded.split(':')

  if (!nonceHex || !ciphertextHex) {
    throw new Error('Payload offline criptografado esta corrompido.')
  }

  const ownerContext = captureOfflineOwnerContext()
  const key = await getKey(false)
  assertOfflineOwnerContext(ownerContext)
  const plaintext = gcm(key, hexToBytes(nonceHex)).decrypt(hexToBytes(ciphertextHex))
  return JSON.parse(new TextDecoder().decode(plaintext)) as TPayload
}
