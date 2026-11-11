import { useState } from 'react'
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius, spacing } from '@/constants/theme'
import { persistInspectionPhoto } from '@/services/inspections.service'
import type { InspectionEvidenceDraft, InspectionMediaSource } from '@/types/inspection'
import { getErrorMessage } from '@/utils/error'

const MAX_PHOTOS_PER_PICK = 6
// Native builds copy the file; the web build keeps the photo content in memory.
const onWeb = Platform.OS === 'web'

async function pickPhotos(source: InspectionMediaSource, itemKey: string | null) {
  if (source === 'CAMERA') {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Libere a câmera para fotografar a inspeção.')
      return []
    }
  }
  const result =
    source === 'CAMERA'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5, base64: onWeb })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.5,
          base64: onWeb,
          allowsMultipleSelection: true,
          selectionLimit: MAX_PHOTOS_PER_PICK,
        })
  if (result.canceled) return []
  const photos: InspectionEvidenceDraft[] = []
  for (const asset of result.assets.slice(0, MAX_PHOTOS_PER_PICK)) {
    photos.push(await persistInspectionPhoto(asset, { itemKey, source }))
  }
  return photos
}

type InspectionPhotosProps = {
  itemKey: string | null
  photos: InspectionEvidenceDraft[]
  /** Photos already on the server for this item (sent from the web or a previous sync). */
  sentCount?: number
  cameraOnly: boolean
  disabled?: boolean
  onAdd: (photos: InspectionEvidenceDraft[]) => void
  onRemove: (photo: InspectionEvidenceDraft) => void
}

/** Photos of one item, or of the whole inspection when itemKey is null. */
export function InspectionPhotos({
  itemKey,
  photos,
  sentCount = 0,
  cameraOnly,
  disabled,
  onAdd,
  onRemove,
}: InspectionPhotosProps) {
  const [busy, setBusy] = useState(false)

  const add = async (source: InspectionMediaSource) => {
    try {
      setBusy(true)
      const picked = await pickPhotos(source, itemKey)
      if (picked.length > 0) onAdd(picked)
    } catch (error) {
      Alert.alert('Não foi possível anexar a foto', getErrorMessage(error, 'Tente novamente.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Pressable
          style={[styles.addButton, disabled || busy ? styles.disabled : null]}
          disabled={disabled || busy}
          onPress={() => void add('CAMERA')}
        >
          <Ionicons name="camera-outline" size={16} color={colors.primaryStrong} />
          <Text style={styles.addLabel}>Câmera</Text>
        </Pressable>
        {cameraOnly ? null : (
          <Pressable
            style={[styles.addButton, disabled || busy ? styles.disabled : null]}
            disabled={disabled || busy}
            onPress={() => void add('GALLERY')}
          >
            <Ionicons name="images-outline" size={16} color={colors.primaryStrong} />
            <Text style={styles.addLabel}>Galeria</Text>
          </Pressable>
        )}
        {sentCount > 0 ? (
          <Text style={styles.sent}>
            {sentCount} já enviada{sentCount > 1 ? 's' : ''}
          </Text>
        ) : null}
      </View>

      {photos.length > 0 ? (
        <View style={styles.gallery}>
          {photos.map((photo) => (
            <View key={photo.id} style={styles.photoCard}>
              <Image source={{ uri: photo.uri }} style={styles.photo} contentFit="cover" />
              {photo.source === 'GALLERY' ? (
                <View style={styles.sourceTag}>
                  <Text style={styles.sourceLabel}>Galeria</Text>
                </View>
              ) : null}
              {disabled ? null : (
                <Pressable style={styles.deleteButton} onPress={() => onRemove(photo)}>
                  <Ionicons name="trash-outline" size={14} color={colors.white} />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  disabled: {
    opacity: 0.5,
  },
  addLabel: {
    color: colors.primaryStrong,
    fontSize: 13,
    fontWeight: '700',
  },
  sent: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '700',
  },
  gallery: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photoCard: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  sourceTag: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(14, 37, 45, 0.78)',
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  sourceLabel: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '700',
  },
  deleteButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(14, 37, 45, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
