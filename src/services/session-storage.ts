import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import type { AuthUser, LoginResponse } from '@/types/auth'

const ACCESS_TOKEN_KEY = 'scaffold_mobile_access_token'
const USER_KEY = 'scaffold_mobile_cached_user'
const SESSION_MODE_KEY = 'scaffold_mobile_session_mode_v1'
const DEVICE_CREDENTIAL_KEY = 'scaffold_mobile_device_credential_v1'
const BIOMETRIC_DEVICE_CREDENTIAL_KEY = 'scaffold_mobile_biometric_device_credential_v1'
const DEVICE_CREDENTIAL_STORAGE_MODE_KEY = 'scaffold_mobile_device_credential_mode_v1'
const BIOMETRIC_LOGIN_KEY = 'scaffold_mobile_biometric_login_enabled'

type DeviceCredentialStorageMode = 'regular' | 'biometric'

let activeDeviceCredential: string | null = null
let sessionWrites: Promise<unknown> = Promise.resolve()

function serializeSessionWrite(operation: () => Promise<void>) {
  const pending = sessionWrites.then(operation, operation)
  sessionWrites = pending.catch(() => undefined)
  return pending
}

const regularSecureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
}

const biometricSecureStoreOptions: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: 'Confirme sua identidade para entrar no Scaffold Mobile.',
  keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
}

function canUseSecureStore() {
  if (Platform.OS === 'web') return false
  const available =
    typeof SecureStore.getItemAsync === 'function' &&
    typeof SecureStore.setItemAsync === 'function' &&
    typeof SecureStore.deleteItemAsync === 'function'
  if (!available) {
    throw new Error('Armazenamento seguro indisponível. Reinicie o aplicativo e tente novamente.')
  }
  return true
}

async function setSecureValue(
  key: string,
  value: string,
  options: SecureStore.SecureStoreOptions = regularSecureStoreOptions,
) {
  if (canUseSecureStore()) {
    await SecureStore.setItemAsync(key, value, options)
    return
  }

  await AsyncStorage.setItem(key, value)
}

async function getSecureValue(
  key: string,
  options: SecureStore.SecureStoreOptions = regularSecureStoreOptions,
) {
  if (canUseSecureStore()) {
    return SecureStore.getItemAsync(key, options)
  }

  return AsyncStorage.getItem(key)
}

async function deleteSecureValue(key: string) {
  if (canUseSecureStore()) {
    await SecureStore.deleteItemAsync(key)
    return
  }

  await AsyncStorage.removeItem(key)
}

async function persistAccessToken(accessToken: string) {
  await setSecureValue(ACCESS_TOKEN_KEY, accessToken)
}

async function loadAccessToken() {
  return getSecureValue(ACCESS_TOKEN_KEY)
}

async function clearAccessToken() {
  await deleteSecureValue(ACCESS_TOKEN_KEY)
}

async function getDeviceCredentialStorageMode() {
  return AsyncStorage.getItem(
    DEVICE_CREDENTIAL_STORAGE_MODE_KEY,
  ) as Promise<DeviceCredentialStorageMode | null>
}

async function clearStoredDeviceCredential() {
  activeDeviceCredential = null
  await Promise.all([
    deleteSecureValue(DEVICE_CREDENTIAL_KEY),
    deleteSecureValue(BIOMETRIC_DEVICE_CREDENTIAL_KEY),
    AsyncStorage.removeItem(DEVICE_CREDENTIAL_STORAGE_MODE_KEY),
  ])
}

async function persistDeviceCredential(deviceCredential: string) {
  activeDeviceCredential = deviceCredential
  const biometricEnabled = await isBiometricLoginEnabled()

  if (biometricEnabled && canUseSecureStore()) {
    await setSecureValue(
      BIOMETRIC_DEVICE_CREDENTIAL_KEY,
      deviceCredential,
      biometricSecureStoreOptions,
    )
    await Promise.all([
      deleteSecureValue(DEVICE_CREDENTIAL_KEY),
      AsyncStorage.setItem(DEVICE_CREDENTIAL_STORAGE_MODE_KEY, 'biometric'),
    ])
    return
  }

  await setSecureValue(DEVICE_CREDENTIAL_KEY, deviceCredential)
  await Promise.all([
    deleteSecureValue(BIOMETRIC_DEVICE_CREDENTIAL_KEY),
    AsyncStorage.setItem(DEVICE_CREDENTIAL_STORAGE_MODE_KEY, 'regular'),
  ])
}

export function persistSession(session: LoginResponse) {
  return serializeSessionWrite(() => saveSession(session))
}

async function saveSession(session: LoginResponse) {
  if (typeof session.deviceCredential === 'string') {
    await persistDeviceCredential(session.deviceCredential)
  } else if (session.deviceCredential === null) {
    await clearStoredDeviceCredential()
  }

  await Promise.all([
    persistAccessToken(session.accessToken),
    AsyncStorage.setItem(USER_KEY, JSON.stringify(session.user)),
    session.sessionMode
      ? AsyncStorage.setItem(SESSION_MODE_KEY, session.sessionMode)
      : Promise.resolve(),
  ])
}

export function persistUserProfile(accessToken: string, user: AuthUser) {
  return serializeSessionWrite(() => saveUserProfile(accessToken, user))
}

async function saveUserProfile(accessToken: string, user: AuthUser) {
  await Promise.all([
    persistAccessToken(accessToken),
    AsyncStorage.setItem(USER_KEY, JSON.stringify(user)),
  ])
}

export async function loadPersistedSession(): Promise<LoginResponse | null> {
  const [accessToken, userJson, sessionMode] = await Promise.all([
    loadAccessToken(),
    AsyncStorage.getItem(USER_KEY),
    AsyncStorage.getItem(SESSION_MODE_KEY),
  ])

  if (!accessToken || !userJson) {
    return null
  }

  try {
    const user = JSON.parse(userJson) as AuthUser
    return {
      accessToken,
      user,
      sessionMode: sessionMode === 'DEVICE' ? 'DEVICE' : 'LEGACY',
    }
  } catch {
    return null
  }
}

export async function hasPersistedSession() {
  const [accessToken, userJson] = await Promise.all([
    loadAccessToken(),
    AsyncStorage.getItem(USER_KEY),
  ])

  return Boolean(accessToken && userJson)
}

export async function loadPersistedUser() {
  const userJson = await AsyncStorage.getItem(USER_KEY)

  if (!userJson) {
    return null
  }

  try {
    return JSON.parse(userJson) as AuthUser
  } catch {
    return null
  }
}

export async function loadRegularDeviceCredential() {
  if ((await getDeviceCredentialStorageMode()) !== 'regular') {
    return null
  }

  const credential = await getSecureValue(DEVICE_CREDENTIAL_KEY)
  activeDeviceCredential = credential
  return credential
}

export async function loadBiometricDeviceCredential() {
  if ((await getDeviceCredentialStorageMode()) !== 'biometric') {
    return null
  }

  let credential: string | null

  try {
    credential = await getSecureValue(BIOMETRIC_DEVICE_CREDENTIAL_KEY, biometricSecureStoreOptions)
  } catch {
    throw new Error('A validacao biometrica foi cancelada ou nao pôde ser concluida.')
  }

  activeDeviceCredential = credential
  return credential
}

export function getActiveDeviceCredential() {
  return activeDeviceCredential
}

export async function hasBiometricDeviceCredential() {
  return (await getDeviceCredentialStorageMode()) === 'biometric'
}

export async function isBiometricLoginEnabled() {
  if (Platform.OS === 'web') {
    return false
  }

  return AsyncStorage.getItem(BIOMETRIC_LOGIN_KEY).then((value) => value === 'true')
}

export async function setBiometricLoginEnabled(enabled: boolean) {
  if (Platform.OS === 'web') {
    return
  }

  if (enabled) {
    const credential = activeDeviceCredential ?? (await getSecureValue(DEVICE_CREDENTIAL_KEY))

    if (credential && canUseSecureStore()) {
      await setSecureValue(BIOMETRIC_DEVICE_CREDENTIAL_KEY, credential, biometricSecureStoreOptions)
      await Promise.all([
        deleteSecureValue(DEVICE_CREDENTIAL_KEY),
        AsyncStorage.setItem(DEVICE_CREDENTIAL_STORAGE_MODE_KEY, 'biometric'),
      ])
      activeDeviceCredential = credential
    }

    await AsyncStorage.setItem(BIOMETRIC_LOGIN_KEY, 'true')
    return
  }

  const storageMode = await getDeviceCredentialStorageMode()
  let credential = activeDeviceCredential

  if (!credential && storageMode === 'biometric') {
    credential = await loadBiometricDeviceCredential()
  }

  if (credential) {
    await setSecureValue(DEVICE_CREDENTIAL_KEY, credential)
    await AsyncStorage.setItem(DEVICE_CREDENTIAL_STORAGE_MODE_KEY, 'regular')
  } else {
    await AsyncStorage.removeItem(DEVICE_CREDENTIAL_STORAGE_MODE_KEY)
  }

  await Promise.all([
    deleteSecureValue(BIOMETRIC_DEVICE_CREDENTIAL_KEY),
    AsyncStorage.removeItem(BIOMETRIC_LOGIN_KEY),
  ])
}

export function clearPersistedSession() {
  activeDeviceCredential = null
  return serializeSessionWrite(removePersistedSession)
}

async function removePersistedSession() {
  activeDeviceCredential = null
  await Promise.all([
    clearAccessToken(),
    AsyncStorage.removeItem(USER_KEY),
    AsyncStorage.removeItem(SESSION_MODE_KEY),
    AsyncStorage.removeItem(BIOMETRIC_LOGIN_KEY),
    AsyncStorage.removeItem(DEVICE_CREDENTIAL_STORAGE_MODE_KEY),
    deleteSecureValue(DEVICE_CREDENTIAL_KEY),
    deleteSecureValue(BIOMETRIC_DEVICE_CREDENTIAL_KEY),
  ])
}
