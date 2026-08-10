import * as LocalAuthentication from 'expo-local-authentication'
import { Platform } from 'react-native'

type BiometricCapability = {
  available: boolean
  label: string
  reason?: string
}

function getLabel(types: LocalAuthentication.AuthenticationType[]) {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return 'Face ID'
  }

  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return 'digital'
  }

  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return 'biometria'
  }

  return 'biometria'
}

export async function getBiometricCapability(): Promise<BiometricCapability> {
  if (Platform.OS === 'web') {
    return {
      available: false,
      label: 'biometria',
      reason: 'Biometria indisponivel no navegador.',
    }
  }

  const hasHardware = await LocalAuthentication.hasHardwareAsync()
  if (!hasHardware) {
    return {
      available: false,
      label: 'biometria',
      reason: 'Este aparelho nao possui biometria disponivel.',
    }
  }

  const enrolled = await LocalAuthentication.isEnrolledAsync()
  if (!enrolled) {
    return {
      available: false,
      label: 'biometria',
      reason: 'Nenhuma biometria foi cadastrada neste aparelho.',
    }
  }

  const types = await LocalAuthentication.supportedAuthenticationTypesAsync()

  return {
    available: true,
    label: getLabel(types),
  }
}

function shouldIgnoreError(error: LocalAuthentication.LocalAuthenticationError) {
  return ['user_cancel', 'system_cancel', 'app_cancel', 'user_fallback'].includes(error)
}

export async function authenticateWithBiometrics(promptMessage: string) {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    promptSubtitle: 'Scaffold Mobile',
    promptDescription: 'Confirme sua identidade para liberar a sessao salva.',
    cancelLabel: 'Cancelar',
    fallbackLabel: '',
    disableDeviceFallback: true,
    biometricsSecurityLevel: 'strong',
  })

  if (result.success) {
    return true
  }

  if (shouldIgnoreError(result.error)) {
    return false
  }

  if (result.error === 'not_enrolled') {
    throw new Error('Cadastre uma biometria no aparelho para usar este recurso.')
  }

  if (result.error === 'lockout') {
    throw new Error('A biometria foi bloqueada temporariamente. Entre com email e senha.')
  }

  if (result.error === 'not_available') {
    throw new Error('Biometria indisponivel neste aparelho.')
  }

  throw new Error('Nao foi possivel validar a biometria.')
}
