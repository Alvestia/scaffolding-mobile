import { useState } from 'react'
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { Ionicons } from '@expo/vector-icons'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { colors, radius, spacing } from '@/constants/theme'
import type { DeviationEvidenceDraft } from '@/types/operational-deviation'
import { createLocalId } from '@/utils/id'
import { buildOwnedDirectorySegment } from '@/security/offline-owner'
import { checksumBase64 } from '@/utils/checksum'
import { validateEvidenceAsset } from '@/utils/evidence-validation'
import { getErrorMessage } from '@/utils/error'

const MAX_EVIDENCE_COUNT = 4
function getEvidenceDir() {
  if (!FileSystem.documentDirectory) {
    return null
  }

  return `${FileSystem.documentDirectory}offline/${buildOwnedDirectorySegment()}/deviation-evidences`
}

async function ensureEvidenceDir() {
  const evidenceDir = getEvidenceDir()
  if (!evidenceDir) {
    return null
  }

  const info = await FileSystem.getInfoAsync(evidenceDir)
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(evidenceDir, { intermediates: true })
  }

  return evidenceDir
}

function buildFileName(asset: ImagePicker.ImagePickerAsset) {
  const extension = asset.fileName?.split('.').pop() || asset.mimeType?.split('/').pop() || 'jpg'
  return `${createLocalId('deviation-evidence')}.${extension}`
}

async function persistAsset(asset: ImagePicker.ImagePickerAsset) {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
    return asset.uri
  }

  const evidenceDir = await ensureEvidenceDir()
  if (!evidenceDir) {
    return asset.uri
  }
  const targetUri = `${evidenceDir}/${buildFileName(asset)}`
  await FileSystem.copyAsync({
    from: asset.uri,
    to: targetUri,
  })
  return targetUri
}

async function normalizeAsset(
  asset: ImagePicker.ImagePickerAsset,
): Promise<DeviationEvidenceDraft | null> {
  if (!asset.base64 || !asset.mimeType) {
    return null
  }

  const persistedUri = await persistAsset(asset)

  return {
    id: createLocalId('deviation-evidence'),
    uri: persistedUri,
    fileName: asset.fileName || buildFileName(asset),
    mimeType: asset.mimeType,
    base64: Platform.OS === 'web' ? asset.base64 : undefined,
    size: asset.fileSize,
    checksumSha256: checksumBase64(asset.base64),
  }
}

async function removePersistedEvidence(evidence: DeviationEvidenceDraft) {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
    return
  }

  const evidenceDir = getEvidenceDir()
  if (!evidenceDir || !evidence.uri.startsWith(`${evidenceDir}/`)) {
    return
  }

  const info = await FileSystem.getInfoAsync(evidence.uri)
  if (info.exists) {
    await FileSystem.deleteAsync(evidence.uri, { idempotent: true })
  }
}

type DeviationEvidencePickerProps = {
  value: DeviationEvidenceDraft[]
  caption: string
  onChange: (value: DeviationEvidenceDraft[]) => void
  onCaptionChange: (value: string) => void
}

export function DeviationEvidencePicker({
  value,
  caption,
  onChange,
  onCaptionChange,
}: DeviationEvidencePickerProps) {
  const [isPicking, setIsPicking] = useState(false)

  const appendAssets = async (assets: ImagePicker.ImagePickerAsset[]) => {
    const availableSlots = MAX_EVIDENCE_COUNT - value.length

    if (availableSlots <= 0) {
      Alert.alert('Limite atingido', `Use no maximo ${MAX_EVIDENCE_COUNT} fotos por desvio.`)
      return
    }

    assets.slice(0, availableSlots).forEach(validateEvidenceAsset)
    const normalized = await Promise.all(
      assets.slice(0, availableSlots).map((asset) => normalizeAsset(asset)),
    )

    onChange([
      ...value,
      ...normalized.filter((item): item is DeviationEvidenceDraft => Boolean(item)),
    ])
  }

  const pickFromLibrary = async () => {
    try {
      setIsPicking(true)
      // The system picker grants access only to the selected photos.
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        base64: true,
        mediaTypes: ['images'],
        quality: 0.5,
        selectionLimit: Math.max(1, MAX_EVIDENCE_COUNT - value.length),
      })

      if (!result.canceled) {
        await appendAssets(result.assets)
      }
    } catch (error) {
      Alert.alert('Não foi possível anexar a foto', getErrorMessage(error, 'Tente novamente ou selecione outra imagem.'))
    } finally {
      setIsPicking(false)
    }
  }

  const pickFromCamera = async () => {
    try {
      setIsPicking(true)
      const permission = await ImagePicker.requestCameraPermissionsAsync()

      if (!permission.granted) {
        Alert.alert('Permissao necessaria', 'Libere a camera para fazer o registro fotografico.')
        return
      }

      const result = await ImagePicker.launchCameraAsync({
        base64: true,
        mediaTypes: ['images'],
        quality: 0.5,
      })

      if (!result.canceled) {
        await appendAssets(result.assets)
      }
    } catch (error) {
      Alert.alert('Não foi possível anexar a foto', getErrorMessage(error, 'Tente novamente ou selecione outra imagem.'))
    } finally {
      setIsPicking(false)
    }
  }

  const removeItem = async (id: string) => {
    const target = value.find((item) => item.id === id)
    if (!target) {
      return
    }

    await removePersistedEvidence(target)
    onChange(value.filter((item) => item.id !== id))
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Registro fotografico</Text>
          <Text style={styles.subtitle}>
            Fotografe o que comprova o desvio (chuva, falta de material, risco, etc.).
          </Text>
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>
            {value.length}/{MAX_EVIDENCE_COUNT}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Button variant="secondary" onPress={() => void pickFromCamera()} loading={isPicking}>
          Camera
        </Button>
        <Button variant="secondary" onPress={() => void pickFromLibrary()} loading={isPicking}>
          Galeria
        </Button>
      </View>

      {value.length === 0 ? (
        <Banner
          tone="info"
          title="Nenhuma foto anexada"
          description="O desvio pode ser salvo sem foto, mas uma evidencia visual agiliza a analise."
        />
      ) : (
        <View style={styles.gallery}>
          {value.map((item) => (
            <View key={item.id} style={styles.photoCard}>
              <Image source={{ uri: item.uri }} style={styles.photo} contentFit="cover" />
              <Pressable style={styles.deleteButton} onPress={() => void removeItem(item.id)}>
                <Ionicons name="trash-outline" size={16} color={colors.white} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={styles.captionBox}>
        <Text style={styles.captionLabel}>Legenda das fotos</Text>
        <TextInput
          value={caption}
          onChangeText={onCaptionChange}
          placeholder="Descreva rapidamente o que a foto comprova"
          placeholderTextColor={colors.textMuted}
          style={styles.captionInput}
          multiline
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  headerBadge: {
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  headerBadgeText: {
    color: colors.primaryStrong,
    fontWeight: '800',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  gallery: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photoCard: {
    width: 96,
    height: 96,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  deleteButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(14, 37, 45, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionBox: {
    gap: spacing.xs,
  },
  captionLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  captionInput: {
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
  },
})
