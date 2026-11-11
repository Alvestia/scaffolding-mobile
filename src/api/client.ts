import { create, isAxiosError, type InternalAxiosRequestConfig } from 'axios'
import { env } from '@/utils/env'
import { useAuthStore } from '@/store/auth-store'
import { useConnectivityStore } from '@/store/connectivity-store'
import { useOperationalContextStore } from '@/store/operational-context-store'
import { isDeviceCredentialRejected } from '@/services/device-session.service'
import { fieldAccessEndedNotice } from '@/security/access-ended-notice'
import type { LoginResponse } from '@/types/auth'
import {
  assertOfflineOwnerContext,
  captureOfflineOwnerContext,
  getOfflineOwner,
} from '@/security/offline-owner'

type AuthRequestConfig = InternalAxiosRequestConfig & {
  _authRetry?: boolean
  skipAuthRefresh?: boolean
  offlineOwnerContext?: ReturnType<typeof captureOfflineOwnerContext>
}

let sessionRenewalPromise: Promise<LoginResponse | null> | null = null
let sessionRenewalGeneration: number | null = null

function renewDeviceSessionOnce() {
  const generation = captureOfflineOwnerContext().generation
  if (!sessionRenewalPromise || sessionRenewalGeneration !== generation) {
    sessionRenewalGeneration = generation
    const pending = useAuthStore
      .getState()
      .renewDeviceSession()
      .finally(() => {
        if (sessionRenewalPromise === pending) {
          sessionRenewalPromise = null
          sessionRenewalGeneration = null
        }
      })
    sessionRenewalPromise = pending
  }

  return sessionRenewalPromise
}

/** The server refused this phone: sign out, and tell a field account why. */
async function endRejectedSession() {
  const auth = useAuthStore.getState()
  const notice = auth.user?.accountType === 'FIELD' ? fieldAccessEndedNotice() : null
  useOperationalContextStore.getState().reset()
  await auth.clearSession()
  if (notice) useAuthStore.getState().noteAccessEnded?.(notice)
}

function applyResponseMessage(error: unknown) {
  if (!isAxiosError(error)) {
    return
  }

  const responseMessage = error.response?.data?.message

  if (typeof responseMessage === 'string' && responseMessage.trim()) {
    error.message = responseMessage
  } else if (Array.isArray(responseMessage) && responseMessage.length > 0) {
    error.message = responseMessage.join(', ')
  }
}

export const api = create({
  baseURL: env.apiUrl,
  timeout: env.requestTimeoutMs,
})

api.interceptors.request.use((config) => {
  const ownerContext = (config as AuthRequestConfig).offlineOwnerContext
  if (ownerContext) assertOfflineOwnerContext(ownerContext)
  const { accessToken } = useAuthStore.getState()
  const { unitId, contractId } = useOperationalContextStore.getState()
  const shouldSkipOrgScope = Boolean(
    (config as typeof config & { skipOrgScope?: boolean }).skipOrgScope,
  )

  config.headers = config.headers ?? {}

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
    if (getOfflineOwner()) {
      ;(config as AuthRequestConfig).offlineOwnerContext =
        captureOfflineOwnerContext()
    }
  }

  if (!shouldSkipOrgScope) {
    if (!config.headers['X-Selected-Unit-Id'] && unitId) {
      config.headers['X-Selected-Unit-Id'] = unitId
    }
    if (!config.headers['X-Selected-Contract-Id'] && contractId) {
      config.headers['X-Selected-Contract-Id'] = contractId
    }
  }

  return config
})

api.interceptors.response.use(
  (response) => {
    const ownerContext = (response.config as AuthRequestConfig).offlineOwnerContext
    if (ownerContext) {
      assertOfflineOwnerContext(ownerContext)
    }
    useConnectivityStore.getState().setApiReachable(true)
    return response
  },
  async (error) => {
    applyResponseMessage(error)

    const ownerContext = (error?.config as AuthRequestConfig | undefined)
      ?.offlineOwnerContext
    if (ownerContext) {
      try {
        assertOfflineOwnerContext(ownerContext)
      } catch (ownerError) {
        return Promise.reject(ownerError)
      }
    }

    if (error?.response) {
      useConnectivityStore.getState().setApiReachable(true)

      const requestConfig = error.config as AuthRequestConfig | undefined
      const shouldRenewSession = Boolean(
        error.response.status === 401 &&
        useAuthStore.getState().accessToken &&
        requestConfig &&
        !requestConfig._authRetry &&
        !requestConfig.skipAuthRefresh,
      )

      if (shouldRenewSession && requestConfig) {
        requestConfig._authRetry = true

        try {
          const renewedSession = await renewDeviceSessionOnce()
          if (ownerContext) assertOfflineOwnerContext(ownerContext)

          if (renewedSession) {
            requestConfig.headers = requestConfig.headers ?? {}
            requestConfig.headers.Authorization = `Bearer ${renewedSession.accessToken}`
            return api.request(requestConfig)
          }

          await endRejectedSession()
        } catch (refreshError) {
          if (ownerContext) assertOfflineOwnerContext(ownerContext)
          applyResponseMessage(refreshError)

          if (isDeviceCredentialRejected(refreshError)) {
            await endRejectedSession()
          } else if (isAxiosError(refreshError) && !refreshError.response) {
            useConnectivityStore.getState().setApiReachable(false)
          }

          return Promise.reject(refreshError)
        }
      }
    } else {
      useConnectivityStore.getState().setApiReachable(false)
      if (!error.message?.trim()) {
        error.message =
          'A API do Scaffold nao respondeu. Verifique a URL configurada e se o backend esta em execucao.'
      }
    }

    return Promise.reject(error)
  },
)
