import { create } from 'zustand'
import {
  authenticateWithBiometrics,
  getBiometricCapability,
} from '@/services/biometric-auth.service'
import type { AuthUser, LoginResponse } from '@/types/auth'
import {
  clearPersistedSession,
  getActiveDeviceCredential,
  hasBiometricDeviceCredential,
  hasPersistedSession,
  isBiometricLoginEnabled,
  loadBiometricDeviceCredential,
  loadPersistedSession,
  loadPersistedUser,
  loadRegularDeviceCredential,
  persistSession,
  persistUserProfile,
  setBiometricLoginEnabled as setBiometricLoginPreference,
} from '@/services/session-storage'
import { refreshDeviceSession } from '@/services/device-session.service'
import { assertOfflineOwnerContext, captureOfflineOwnerContext, setOfflineOwner } from '@/security/offline-owner'
import { useOperationalContextStore } from '@/store/operational-context-store'

async function activateOfflineOwner(user: AuthUser) {
  await useOperationalContextStore.persist.rehydrate()
  setOfflineOwner(user)
  useOperationalContextStore.getState().activateOwner(user)
}

async function deactivateOfflineOwner() {
  setOfflineOwner(null)
  await useOperationalContextStore.persist.rehydrate()
  useOperationalContextStore.getState().clearOwner()
}

type AuthState = {
  accessToken: string | null
  user: AuthUser | null
  lockedUser: AuthUser | null
  hasLockedSession: boolean
  biometricLabel: string | null
  isHydrated: boolean
  hydrate: () => Promise<void>
  setSession: (session: LoginResponse) => Promise<void>
  setUserProfile: (user: AuthUser) => Promise<void>
  setBiometricLoginEnabled: (enabled: boolean) => Promise<void>
  unlockWithBiometrics: () => Promise<LoginResponse | null>
  renewDeviceSession: () => Promise<LoginResponse | null>
  clearSession: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  lockedUser: null,
  hasLockedSession: false,
  biometricLabel: null,
  isHydrated: false,
  hydrate: async () => {
    const biometricEnabled = await isBiometricLoginEnabled()

    if (biometricEnabled && (await hasPersistedSession())) {
      const [capability, lockedUser] = await Promise.all([
        getBiometricCapability(),
        loadPersistedUser(),
      ])

      if (!capability.available) {
        await deactivateOfflineOwner()
        await clearPersistedSession()
        set({
          accessToken: null,
          user: null,
          lockedUser: null,
          hasLockedSession: false,
          biometricLabel: null,
          isHydrated: true,
        })
        return
      }

      setOfflineOwner(null)
      set({
        accessToken: null,
        user: null,
        lockedUser,
        hasLockedSession: true,
        biometricLabel: capability.label,
        isHydrated: true,
      })
      return
    }

    const session = await loadPersistedSession()
    await loadRegularDeviceCredential()

    if (session?.user) {
      await activateOfflineOwner(session.user)
    } else {
      await deactivateOfflineOwner()
    }

    set({
      accessToken: session?.accessToken ?? null,
      user: session?.user ?? null,
      lockedUser: null,
      hasLockedSession: false,
      biometricLabel: null,
      isHydrated: true,
    })
  },
  setSession: async (session) => {
    const { accessToken, user } = session
    await activateOfflineOwner(user)
    await persistSession(session)
    set({ accessToken, user, lockedUser: null, hasLockedSession: false })
  },
  setUserProfile: async (user) => {
    const accessToken = useAuthStore.getState().accessToken

    if (accessToken) {
      await persistUserProfile(accessToken, user)
    }

    await activateOfflineOwner(user)
    set({ user })
  },
  setBiometricLoginEnabled: async (enabled) => {
    await setBiometricLoginPreference(enabled)

    if (!enabled) {
      set({ hasLockedSession: false, biometricLabel: null, lockedUser: null })
      return
    }

    const capability = await getBiometricCapability()
    set({
      biometricLabel: capability.available ? capability.label : null,
      hasLockedSession: false,
    })
  },
  unlockWithBiometrics: async () => {
    if (!(await isBiometricLoginEnabled())) {
      return null
    }

    const capability = await getBiometricCapability()
    if (!capability.available) {
      throw new Error(capability.reason ?? 'Biometria indisponivel neste aparelho.')
    }

    const hasProtectedCredential = await hasBiometricDeviceCredential()
    let deviceCredential: string | null = null

    if (hasProtectedCredential) {
      deviceCredential = await loadBiometricDeviceCredential()

      if (!deviceCredential) {
        await useAuthStore.getState().clearSession()
        throw new Error(
          'A biometria do aparelho foi alterada. Entre com email e senha para ativá-la novamente.',
        )
      }
    } else {
      const authenticated = await authenticateWithBiometrics(`Entrar com ${capability.label}`)

      if (!authenticated) {
        return null
      }
    }

    const session = await loadPersistedSession()
    if (!session) {
      throw new Error('Sessao salva nao encontrada. Entre com email e senha.')
    }

    await activateOfflineOwner(session.user)
    set({
      accessToken: session.accessToken,
      user: session.user,
      lockedUser: null,
      hasLockedSession: false,
      biometricLabel: capability.label,
    })

    return session
  },
  renewDeviceSession: async () => {
    const deviceCredential = getActiveDeviceCredential()
    if (!deviceCredential) {
      return null
    }

    const ownerContext = captureOfflineOwnerContext()
    const session = await refreshDeviceSession(deviceCredential)
    assertOfflineOwnerContext(ownerContext)
    if (session.user.id !== ownerContext.owner.userId || session.user.tenantId !== ownerContext.owner.tenantId) {
      throw new Error('A renovação retornou uma identidade diferente da sessão ativa.')
    }
    await persistSession(session)
    assertOfflineOwnerContext(ownerContext)
    useOperationalContextStore.getState().activateOwner(session.user)
    set({
      accessToken: session.accessToken,
      user: session.user,
      lockedUser: null,
      hasLockedSession: false,
    })
    return session
  },
  clearSession: async () => {
    setOfflineOwner(null)
    set({
      accessToken: null,
      user: null,
      lockedUser: null,
      hasLockedSession: false,
      biometricLabel: null,
    })
    await deactivateOfflineOwner()
    await clearPersistedSession()
  },
}))
