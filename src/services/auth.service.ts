import { api } from '@/api/client'
import { isAxiosError } from 'axios'
import { Platform } from 'react-native'
import { getDeviceSessionMetadata } from '@/services/device-identity.service'
import type { AuthUser, LoginInput, LoginResponse } from '@/types/auth'

function normalizeNegotiatedSession(data: LoginResponse): LoginResponse {
  if (data.sessionMode === 'DEVICE' || typeof data.deviceCredential === 'string') {
    return data
  }

  return {
    ...data,
    sessionMode: 'LEGACY',
    deviceCredential: null,
  }
}

function isLegacyLoginContract(error: unknown) {
  if (!isAxiosError(error) || error.response?.status !== 400) {
    return false
  }

  const messages = error.response.data?.message
  const normalized = Array.isArray(messages) ? messages.join(' ') : String(messages ?? '')

  return (
    normalized.includes('should not exist') &&
    (normalized.includes('clientType') || normalized.includes('deviceId'))
  )
}

export async function login(input: LoginInput) {
  const credentials = {
    email: input.email.trim().toLowerCase(),
    password: input.password,
  }

  if (Platform.OS === 'web') {
    const { data } = await api.post('/auth/login', credentials, {
      skipOrgScope: true,
      skipAuthRefresh: true,
    } as never)
    return normalizeNegotiatedSession(data as LoginResponse)
  }

  const device = await getDeviceSessionMetadata()

  try {
    const { data } = await api.post(
      '/auth/login',
      {
        ...credentials,
        clientType: 'MOBILE',
        ...device,
      },
      { skipOrgScope: true, skipAuthRefresh: true } as never,
    )

    return normalizeNegotiatedSession(data as LoginResponse)
  } catch (error) {
    if (!isLegacyLoginContract(error)) {
      throw error
    }

    const { data } = await api.post('/auth/login', credentials, {
      skipOrgScope: true,
      skipAuthRefresh: true,
    } as never)

    return normalizeNegotiatedSession(data as LoginResponse)
  }
}

export async function fetchMe() {
  const { data } = await api.get('/auth/me')
  return data as AuthUser
}

export async function upgradeLegacyDeviceSession() {
  const device = await getDeviceSessionMetadata()

  try {
    const { data } = await api.post('/auth/device-session', device, {
      skipOrgScope: true,
    } as never)
    return data as LoginResponse
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) {
      return null
    }

    throw error
  }
}
