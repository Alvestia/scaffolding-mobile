import { Ionicons } from '@expo/vector-icons'
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button } from '@/components/ui/button'
import { colors, radius, spacing } from '@/constants/theme'
import { queryClient } from '@/providers/app-providers'
import { refreshAuthenticatedSessionAccess } from '@/services/auth-session.service'
import { prefetchOfflineCatalogs } from '@/services/catalog-preload.service'
import {
  activateFieldAccess,
  assertDeviceLockAvailable,
  maskFieldAccessCode,
  parseFieldAccessCode,
} from '@/services/field-access.service'
import { useAppLockStore } from '@/store/app-lock-store'
import { useAuthStore } from '@/store/auth-store'
import { useConnectivityStore } from '@/store/connectivity-store'
import { useOperationalContextStore } from '@/store/operational-context-store'
import { getErrorMessage, isOfflineLikeError } from '@/utils/error'

/**
 * Sign-in for employees without corporate e-mail: the one-time code from the
 * person in charge of the contract links this phone to their account.
 */
export default function FieldCodePage() {
  const setSession = useAuthStore((state) => state.setSession)
  const setUserProfile = useAuthStore((state) => state.setUserProfile)
  const clearSession = useAuthStore((state) => state.clearSession)
  const isConnected = useConnectivityStore((state) => state.isConnected)
  const resetContext = useOperationalContextStore((state) => state.reset)
  const [permission, requestPermission] = useCameraPermissions()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const busyRef = useRef(false)

  const activate = async (raw: string) => {
    if (busyRef.current) return
    const parsed = parseFieldAccessCode(raw)
    if (!parsed) {
      setError('Código inválido. Confira os 8 caracteres.')
      return
    }
    if (!isConnected) {
      setError('Conecte-se à internet para ativar. Depois disso, o aplicativo funciona sem rede.')
      return
    }
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      // Checked first: a phone without a screen lock must not use up the code.
      await assertDeviceLockAvailable()
      resetContext()
      queryClient.clear()
      const response = await activateFieldAccess(parsed)
      await clearSession()
      await setSession(response, { keepSignedIn: true })
      // The code was just used on this phone: no lock prompt right after activating.
      useAppLockStore.getState().unlock()
      try {
        await setUserProfile(await refreshAuthenticatedSessionAccess(response.user))
      } catch (profileError) {
        if (!isOfflineLikeError(profileError) && !useAuthStore.getState().accessToken) {
          throw profileError
        }
      }
      void prefetchOfflineCatalogs()
      router.replace('/')
    } catch (activationError) {
      setError(getErrorMessage(activationError, 'Não foi possível ativar o acesso agora.'))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const openScanner = async () => {
    setError(null)
    if (!permission?.granted) {
      const result = await requestPermission()
      if (!result.granted) {
        setError(
          result.canAskAgain
            ? 'Permita o uso da câmera para ler o QR Code, ou digite o código.'
            : 'A câmera está bloqueada para o aplicativo. Libere nas configurações ou digite o código.',
        )
        return
      }
    }
    setScanning(true)
  }

  const onScanned = ({ data }: BarcodeScanningResult) => {
    const parsed = parseFieldAccessCode(data)
    if (!parsed || busyRef.current) return
    setScanning(false)
    setCode(parsed)
    void activate(parsed)
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8}>
            <Ionicons name="chevron-back" size={18} color={colors.white} />
            <Text style={styles.backLabel}>Entrar com e-mail corporativo</Text>
          </Pressable>

          <View style={styles.card}>
            <Text style={styles.title}>Acesso com código</Text>
            <Text style={styles.text}>
              Para quem não tem e-mail corporativo. Peça o código de ativação ao responsável pelo
              contrato: ele vale uma vez e vincula este celular ao seu cadastro.
            </Text>

            <Button variant="secondary" onPress={() => void openScanner()} disabled={busy}>
              Ler QR Code
            </Button>

            <Text style={styles.or}>ou digite o código</Text>
            <TextInput
              value={code}
              onChangeText={(text) => {
                setCode(maskFieldAccessCode(text))
                setError(null)
              }}
              placeholder="XXXX-XXXX"
              placeholderTextColor={colors.borderStrong}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={9}
              style={styles.input}
              onSubmitEditing={() => void activate(code)}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button onPress={() => void activate(code)} loading={busy} disabled={code.length < 9}>
              Ativar acesso
            </Button>

            <Text style={styles.hint}>
              Depois de ativado, o celular continua conectado e o aplicativo pede o bloqueio de tela
              do próprio aparelho ao abrir. Se trocar de celular, peça um novo código.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <View style={styles.scanner}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onScanned}
          />
          <SafeAreaView style={styles.scannerOverlay}>
            <Text style={styles.scannerTitle}>Aponte para o QR Code de ativação</Text>
            <View style={styles.frame} />
            <View style={styles.scannerActions}>
              <Button variant="secondary" onPress={() => setScanning(false)}>
                Cancelar
              </Button>
              {!permission?.canAskAgain && !permission?.granted ? (
                <Button variant="secondary" onPress={() => void Linking.openSettings()}>
                  Abrir configurações
                </Button>
              ) : null}
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.brandInk,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  backLabel: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  card: {
    gap: spacing.md,
    borderRadius: radius.xxl,
    backgroundColor: colors.surface,
    padding: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  text: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  or: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 56,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 4,
    textAlign: 'center',
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  scanner: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scannerOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.xl,
  },
  scannerTitle: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  frame: {
    width: 250,
    height: 250,
    borderRadius: radius.xxl,
    borderWidth: 3,
    borderColor: colors.white,
  },
  scannerActions: {
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
})
