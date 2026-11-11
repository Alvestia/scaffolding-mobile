import { Ionicons } from '@expo/vector-icons'
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera'
import { useRouter } from 'expo-router'
import { useMemo, useRef, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button } from '@/components/ui/button'
import { colors, radius, spacing } from '@/constants/theme'
import { useInspectionPack } from '@/hooks/use-inspections'
import { useOperationalContextStore } from '@/store/operational-context-store'
import type { PackScaffold } from '@/types/inspection'
import { extractPlateToken, plateTokenHash } from '@/utils/plate-qr'

/**
 * Reads the plate QR Code and opens the scaffold. Works offline: the code is
 * matched against the scaffolds downloaded with the inspections.
 */
export default function ScanPlateScreen() {
  const router = useRouter()
  const [permission, requestPermission] = useCameraPermissions()
  const { contractId, unitId } = useOperationalContextStore()
  const pack = useInspectionPack({ contractId, unitId })
  const [torch, setTorch] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const handled = useRef(false)

  const byPlate = useMemo(() => {
    const map = new Map<string, PackScaffold>()
    for (const scaffold of pack.data?.scaffolds ?? []) {
      if (scaffold.plateHash) map.set(scaffold.plateHash, scaffold)
    }
    return map
  }, [pack.data])

  const onScanned = ({ data }: BarcodeScanningResult) => {
    if (handled.current) return
    const token = extractPlateToken(data)
    if (!token) {
      setMessage('Este QR Code não é de uma placa de andaime.')
      return
    }
    const scaffold = byPlate.get(plateTokenHash(token))
    if (!scaffold) {
      setMessage(
        'Andaime não encontrado neste contrato. Confira o contrato selecionado ou sincronize: a placa pode ter sido trocada.',
      )
      return
    }
    handled.current = true
    router.replace(`/(app)/inspections/scaffold/${scaffold.id}` as never)
  }

  if (!permission) {
    return <SafeAreaView style={styles.safeArea} />
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.centered]}>
        <Ionicons name="camera-outline" size={44} color={colors.white} />
        <Text style={styles.permissionTitle}>Câmera necessária</Text>
        <Text style={styles.permissionText}>
          A câmera é usada só para ler o QR Code da placa do andaime.
        </Text>
        <View style={styles.permissionActions}>
          {permission.canAskAgain ? (
            <Button onPress={() => void requestPermission()}>Permitir câmera</Button>
          ) : (
            <Button onPress={() => void Linking.openSettings()}>Abrir configurações</Button>
          )}
          <Button variant="secondary" onPress={() => router.back()}>
            Voltar
          </Button>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <View style={styles.safeArea}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScanned}
      />
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.topBar}>
          <Pressable style={styles.roundButton} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={colors.white} />
          </Pressable>
          <Text style={styles.topTitle}>Ler placa do andaime</Text>
          <Pressable style={styles.roundButton} onPress={() => setTorch((on) => !on)} hitSlop={8}>
            <Ionicons name={torch ? 'flash' : 'flash-outline'} size={22} color={colors.white} />
          </Pressable>
        </View>

        <View style={styles.frame} />

        <View style={styles.bottom}>
          {message ? (
            <View style={styles.message}>
              <Text style={styles.messageText}>{message}</Text>
            </View>
          ) : (
            <Text style={styles.hint}>Aponte para o QR Code da placa</Text>
          )}
          {!pack.data?.enabled ? (
            <Text style={styles.hint}>
              A base de inspeções deste contrato ainda não foi baixada.
            </Text>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  permissionTitle: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '800',
  },
  permissionText: {
    color: '#D1D5DB',
    fontSize: 14,
    textAlign: 'center',
  },
  permissionActions: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  topTitle: {
    flex: 1,
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  roundButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    alignSelf: 'center',
    width: 250,
    height: 250,
    borderRadius: radius.xxl,
    borderWidth: 3,
    borderColor: colors.white,
  },
  bottom: {
    gap: spacing.sm,
    alignItems: 'center',
  },
  hint: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
  message: {
    alignSelf: 'stretch',
    borderRadius: radius.lg,
    backgroundColor: 'rgba(185, 28, 28, 0.92)',
    padding: spacing.md,
  },
  messageText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
})
