import 'react-native-get-random-values'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { gcm } from '@noble/ciphers/aes.js'
import { bytesToHex, hexToBytes, randomBytes } from '@noble/ciphers/utils.js'
import { buildOwnedStorageKey } from '@/security/offline-owner'

const KEY_STORAGE = 'scaffold_mobile_outbox_payload_key_v1'
const ENCRYPTION_PREFIX = 'enc:v1:'

function canUseSecureStore() {
  return (
    Platform.OS !== 'web' &&
    typeof SecureStore.getItemAsync === 'function' &&
    typeof SecureStore.setItemAsync === 'function'
  )
}

async function getOrCreateKey() {
  const ownedKeyStorage = buildOwnedStorageKey(KEY_STORAGE)
  const stored = canUseSecureStore()
    ? await SecureStore.getItemAsync(ownedKeyStorage)
    : await AsyncStorage.getItem(ownedKeyStorage)

  if (stored) {
    return hexToBytes(stored)
  }

  const key = randomBytes(32)
  const encoded = bytesToHex(key)

  if (canUseSecureStore()) {
    await SecureStore.setItemAsync(ownedKeyStorage, encoded)
  } else {
    await AsyncStorage.setItem(ownedKeyStorage, encoded)
  }

  return key
}

export function isEncryptedPayload(value: string) {
  return value.startsWith(ENCRYPTION_PREFIX)
}

export async function encryptOfflinePayload(payload: unknown) {
  const key = await getOrCreateKey()
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

  const key = await getOrCreateKey()
  const plaintext = gcm(key, hexToBytes(nonceHex)).decrypt(hexToBytes(ciphertextHex))
  return JSON.parse(new TextDecoder().decode(plaintext)) as TPayload
}
