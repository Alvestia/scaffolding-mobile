import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import { api } from '@/api/client'
import type { ExecutionEvidenceDraft } from '@/types/execution'
import { buildOwnedDirectorySegment } from '@/security/offline-owner'

function getOwnedEvidenceDirectory() {
  if (!FileSystem.documentDirectory) {
    return null
  }

  return `${FileSystem.documentDirectory}offline/${buildOwnedDirectorySegment()}/execution-evidences/`
}

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

async function createWebFile(evidence: ExecutionEvidenceDraft) {
  if (!evidence.base64) throw new Error('A evidencia web nao possui conteudo local.')
  const response = await fetch(`data:${evidence.mimeType};base64,${evidence.base64}`)
  const blob = await response.blob()
  return new File([blob], sanitizeFileName(evidence.fileName), {
    type: evidence.mimeType,
  })
}

export async function uploadExecutionMedia(
  executionEntryId: string,
  evidence: ExecutionEvidenceDraft,
  caption?: string,
  mutationId?: string,
) {
  const formData = new FormData()

  if (Platform.OS === 'web') {
    const file = await createWebFile(evidence)
    formData.append('file', file)
  } else {
    formData.append('file', {
      uri: evidence.uri,
      name: sanitizeFileName(evidence.fileName),
      type: evidence.mimeType,
    } as never)
  }

  if (caption?.trim()) {
    formData.append('caption', caption.trim())
  }

  const { data } = await api.post(`/execution-entries/${executionEntryId}/media`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      ...(mutationId ? { 'Idempotency-Key': `${mutationId}-${evidence.id}` } : {}),
      ...(evidence.checksumSha256
        ? { 'X-Content-SHA256': evidence.checksumSha256 }
        : {}),
    },
  })

  return data
}

export async function cleanupExecutionEvidenceDrafts(evidences?: ExecutionEvidenceDraft[]) {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory || !evidences?.length) {
    return
  }

  const ownedDirectory = getOwnedEvidenceDirectory()
  if (!ownedDirectory) {
    return
  }

  await Promise.all(
    evidences.map(async (evidence) => {
      if (!evidence.uri.startsWith(ownedDirectory)) {
        return
      }

      const info = await FileSystem.getInfoAsync(evidence.uri)
      if (info.exists) {
        await FileSystem.deleteAsync(evidence.uri, { idempotent: true })
      }
    }),
  )
}
