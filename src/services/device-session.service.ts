import { create, isAxiosError } from 'axios'
import { env } from '@/utils/env'
import { getDeviceSessionMetadata } from '@/services/device-identity.service'
import type { LoginResponse } from '@/types/auth'

const authApi = create({
  baseURL: env.apiUrl,
  timeout: env.requestTimeoutMs,
})

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

export async function refreshDeviceSession(deviceCredential: string) {
  const { deviceId } = await getDeviceSessionMetadata()

  try {
    const { data } = await authApi.post('/auth/refresh', {
      deviceId,
      deviceCredential,
    })

    return data as LoginResponse
  } catch (error) {
    applyResponseMessage(error)
    throw error
  }
}

export async function revokeDeviceSession(deviceCredential: string) {
  const { deviceId } = await getDeviceSessionMetadata()

  try {
    await authApi.post('/auth/logout', {
      deviceId,
      deviceCredential,
    })
  } catch {
    // O logout local deve funcionar mesmo sem rede. A sessão remota expira ou pode ser revogada depois.
  }
}

// A API responde 401 quando a credencial expirou ou foi revogada. Um 403 vem de proxy ou
// firewall da rede local e não pode apagar a sessão do aparelho.
export function isDeviceCredentialRejected(error: unknown) {
  return isAxiosError(error) && error.response?.status === 401
}
