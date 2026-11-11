import * as LocalAuthentication from 'expo-local-authentication'
import { Platform } from 'react-native'
import { api } from '@/api/client'
import { getDeviceSessionMetadata } from '@/services/device-identity.service'
import type { LoginResponse } from '@/types/auth'

// Same format as the API (scaffolding-api/src/field-access/field-access-policy.ts).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const QR_PREFIX = 'SCAFFOLD-CAMPO:'

/** XXXX-XXXX from the QR content or typed text; null when it is not an access code. */
export function parseFieldAccessCode(raw: string | null | undefined) {
  let text = (raw ?? '').trim().toUpperCase()
  if (text.startsWith(QR_PREFIX)) text = text.slice(QR_PREFIX.length)
  const code = text.replace(/[\s-]/g, '')
  if (code.length !== 8 || [...code].some((char) => !CODE_ALPHABET.includes(char))) return null
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

/** Typing aid: keeps valid characters and adds the dash. */
export function maskFieldAccessCode(text: string) {
  const chars = [...text.toUpperCase()].filter((char) => CODE_ALPHABET.includes(char)).slice(0, 8)
  return chars.length > 4 ? `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}` : chars.join('')
}

/**
 * A field account has no password: the phone's own lock (PIN, pattern or
 * biometrics) is what protects it, so a phone without one cannot be activated.
 */
export async function assertDeviceLockAvailable() {
  if (Platform.OS === 'web') return
  const level = await LocalAuthentication.getEnrolledLevelAsync()
  if (level === LocalAuthentication.SecurityLevel.NONE) {
    throw new Error(
      'Configure um bloqueio de tela no celular (PIN, padrão, senha ou biometria) antes de ativar o acesso.',
    )
  }
}

export async function activateFieldAccess(code: string) {
  const device = await getDeviceSessionMetadata()
  const { data } = await api.post<LoginResponse>(
    '/auth/field/activate',
    { code, ...device },
    { skipOrgScope: true, skipAuthRefresh: true } as never,
  )
  return data
}
