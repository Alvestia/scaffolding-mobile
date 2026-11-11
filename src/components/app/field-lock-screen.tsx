import { Ionicons } from '@expo/vector-icons'
import * as LocalAuthentication from 'expo-local-authentication'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button } from '@/components/ui/button'
import { colors, radius, spacing } from '@/constants/theme'
import { useAppLockStore } from '@/store/app-lock-store'

type FieldLockScreenProps = {
  userName: string
}

/** Asks the phone's own lock (PIN, pattern, password or biometrics) before the app opens. */
export function FieldLockScreen({ userName }: FieldLockScreenProps) {
  const unlock = useAppLockStore((state) => state.unlock)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const prompted = useRef(false)

  const authenticate = useCallback(async () => {
    if (Platform.OS === 'web') {
      unlock()
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const level = await LocalAuthentication.getEnrolledLevelAsync()
      if (level === LocalAuthentication.SecurityLevel.NONE) {
        setMessage(
          'Este celular está sem bloqueio de tela. Configure um PIN, padrão, senha ou biometria nas configurações do aparelho e toque em Desbloquear.',
        )
        return
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloquear o Scaffold',
        cancelLabel: 'Cancelar',
        disableDeviceFallback: false,
      })
      if (result.success) {
        unlock()
        return
      }
      if (result.error !== 'user_cancel' && result.error !== 'system_cancel' && result.error !== 'app_cancel') {
        setMessage('Não foi possível confirmar. Tente de novo.')
      }
    } catch {
      setMessage('Não foi possível usar o bloqueio do celular. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }, [unlock])

  useEffect(() => {
    if (prompted.current) return
    prompted.current = true
    void authenticate()
  }, [authenticate])

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name="lock-closed" size={28} color={colors.primaryStrong} />
        </View>
        <Text style={styles.title}>Scaffold bloqueado</Text>
        <Text style={styles.text}>
          {userName}, desbloqueie com a senha, o padrão ou a biometria do celular.
        </Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Button onPress={() => void authenticate()} loading={busy}>
          Desbloquear
        </Button>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.brandInk,
  },
  card: {
    gap: spacing.md,
    alignItems: 'stretch',
    borderRadius: radius.xxl,
    backgroundColor: colors.surface,
    padding: spacing.xl,
  },
  icon: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  text: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  message: {
    color: colors.warning,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
})
