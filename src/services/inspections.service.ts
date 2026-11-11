import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import type { ImagePickerAsset } from 'expo-image-picker'
import { api } from '@/api/client'
import {
  getReferenceCache,
  removeReferenceCache,
  setReferenceCache,
} from '@/services/reference-cache.service'
import type {
  AvailabilityMap,
  InspectionDraft,
  InspectionEvidenceDraft,
  InspectionMediaSource,
  InspectionPack,
  ManualInspectionPayload,
  RemoteInspection,
} from '@/types/inspection'
import { createLocalId } from '@/utils/id'
import {
  assertOfflineOwnerContext,
  buildOwnedDirectorySegment,
  buildOwnedStorageKey,
  captureOfflineOwnerContext,
} from '@/security/offline-owner'

type Scope = {
  contractId: string
  unitId: string
}

// Keep aligned with the 'inspections' upload filter of scaffolding-api/src/files/multer-config.ts.
const INSPECTION_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_IMAGE_BYTES = 50 * 1024 * 1024

const packKey = (scope: Scope) => `inspection-pack:${scope.unitId}:${scope.contractId}`
const availabilityKey = (scope: Scope) => `availability-map:${scope.unitId}:${scope.contractId}`
const draftKey = (inspectionId: string) => `inspection-draft:${inspectionId}`

const activeRequests = new Map<string, Promise<unknown>>()

/** One request at a time per key and owner: screens and the sync share it. */
function shared<T>(key: string, run: () => Promise<T>): Promise<T> {
  const ownedKey = buildOwnedStorageKey(key)
  const active = activeRequests.get(ownedKey) as Promise<T> | undefined
  if (active) return active
  const request = run().finally(() => {
    if (activeRequests.get(ownedKey) === request) activeRequests.delete(ownedKey)
  })
  activeRequests.set(ownedKey, request)
  return request
}

function scopedRequest(scope: Scope) {
  return {
    params: { contractId: scope.contractId },
    headers: {
      'X-Selected-Unit-Id': scope.unitId,
      'X-Selected-Contract-Id': scope.contractId,
    },
    skipOrgScope: true,
  } as never
}

// ------------------------------------------------------------ offline pack

export function fetchInspectionPack(scope: Scope) {
  const ownerContext = captureOfflineOwnerContext()
  return shared(packKey(scope), async () => {
    const { data } = await api.get<InspectionPack>('/inspections/offline-pack', scopedRequest(scope))
    assertOfflineOwnerContext(ownerContext)
    await setReferenceCache(packKey(scope), data)
    return data
  })
}

export function getCachedInspectionPack(scope: Scope) {
  return getReferenceCache<InspectionPack>(packKey(scope))
}

export function fetchAvailabilityMap(scope: Scope) {
  const ownerContext = captureOfflineOwnerContext()
  return shared(availabilityKey(scope), async () => {
    const { data } = await api.get<AvailabilityMap>(
      '/inspections/availability-map',
      scopedRequest(scope),
    )
    assertOfflineOwnerContext(ownerContext)
    await setReferenceCache(availabilityKey(scope), data)
    return data
  })
}

export function getCachedAvailabilityMap(scope: Scope) {
  return getReferenceCache<AvailabilityMap>(availabilityKey(scope))
}

// ------------------------------------------------------------ remote calls

export async function getRemoteInspection(id: string) {
  const { data } = await api.get<RemoteInspection>(`/inspections/${id}`)
  return data
}

export async function startRemoteInspection(
  id: string,
  body: { expectedUpdatedAt: string; startedAt: string },
) {
  const { data } = await api.post<RemoteInspection>(`/inspections/${id}/start`, body)
  return data
}

export async function saveRemoteAnswers(
  id: string,
  body: {
    expectedUpdatedAt: string
    answers: { itemKey: string; value: string | null; observation: string | null }[]
  },
) {
  const { data } = await api.put<RemoteInspection>(`/inspections/${id}/answers`, {
    expectedUpdatedAt: body.expectedUpdatedAt,
    // The API takes absent fields, not nulls.
    answers: body.answers.map((answer) => ({
      itemKey: answer.itemKey,
      ...(answer.value !== null ? { value: answer.value } : {}),
      ...(answer.observation ? { observation: answer.observation } : {}),
    })),
  })
  return data
}

async function webFile(evidence: InspectionEvidenceDraft) {
  if (!evidence.base64) throw new Error('A foto não tem conteúdo local.')
  const response = await fetch(`data:${evidence.mimeType};base64,${evidence.base64}`)
  const blob = await response.blob()
  return new File([blob], evidence.fileName, { type: evidence.mimeType })
}

/** Idempotency-Key: the server returns the file already received on a resend. */
export async function uploadInspectionEvidence(
  inspectionId: string,
  evidence: InspectionEvidenceDraft,
  uploadKey: string,
) {
  const formData = new FormData()
  if (Platform.OS === 'web') {
    formData.append('file', await webFile(evidence))
  } else {
    formData.append('file', {
      uri: evidence.uri,
      name: evidence.fileName,
      type: evidence.mimeType,
    } as never)
  }
  formData.append('kind', evidence.kind)
  formData.append('source', evidence.source)
  formData.append('capturedAt', evidence.capturedAt)
  if (evidence.itemKey) formData.append('itemKey', evidence.itemKey)

  const { data } = await api.post(`/inspections/${inspectionId}/media`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      'Idempotency-Key': uploadKey,
    },
  })
  return data
}

export async function completeRemoteInspection(
  id: string,
  body: {
    expectedUpdatedAt: string
    performedAt: string
    restrictions?: string
    notes?: string
    latitude?: number
    longitude?: number
    gpsAccuracyM?: number
    durationSeconds?: number
    clientMutationId: string
  },
) {
  const { data } = await api.post<RemoteInspection>(`/inspections/${id}/complete`, body)
  return data
}

export async function createManualInspection(payload: ManualInspectionPayload, key: string) {
  const { data } = await api.post<RemoteInspection>(
    '/inspections',
    { scaffoldId: payload.scaffoldId, trigger: payload.trigger, reason: payload.reason },
    { headers: { 'Idempotency-Key': key } },
  )
  return data
}

export async function interdictScaffold(scaffoldId: string, reason: string) {
  const { data } = await api.post(`/scaffolds/${scaffoldId}/interdict`, { reason })
  return data
}

// ------------------------------------------------------------------ drafts

export function getInspectionDraft(inspectionId: string) {
  return getReferenceCache<InspectionDraft>(draftKey(inspectionId))
}

export function saveInspectionDraft(draft: InspectionDraft) {
  return setReferenceCache(draftKey(draft.inspectionId), draft)
}

export function removeInspectionDraft(inspectionId: string) {
  return removeReferenceCache(draftKey(inspectionId))
}

// ------------------------------------------------------------- local files

function evidenceDirectory() {
  if (!FileSystem.documentDirectory) return null
  return `${FileSystem.documentDirectory}offline/${buildOwnedDirectorySegment()}/inspection-evidences`
}

async function ensureEvidenceDirectory() {
  const directory = evidenceDirectory()
  if (!directory) return null
  const info = await FileSystem.getInfoAsync(directory)
  if (!info.exists) await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
  return directory
}

function extensionOf(mimeType: string) {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  return 'jpg'
}

export function validateInspectionPhoto(asset: Pick<ImagePickerAsset, 'mimeType' | 'fileSize'>) {
  if (!asset.mimeType || !INSPECTION_IMAGE_TYPES.has(asset.mimeType)) {
    throw new Error('Use uma foto JPEG, PNG ou WebP.')
  }
  if ((asset.fileSize ?? 0) > MAX_IMAGE_BYTES) {
    throw new Error('Cada foto deve ter no máximo 50 MB.')
  }
}

/** Copies the photo into the app folder: it survives until the inspection syncs. */
export async function persistInspectionPhoto(
  asset: ImagePickerAsset,
  options: { itemKey: string | null; source: InspectionMediaSource },
): Promise<InspectionEvidenceDraft> {
  validateInspectionPhoto(asset)
  const mimeType = asset.mimeType!
  const id = createLocalId('insphoto')
  const fileName = `${id}.${extensionOf(mimeType)}`
  const capturedAt = new Date().toISOString()
  const base = { id, kind: 'PHOTO' as const, itemKey: options.itemKey, source: options.source }

  const directory = Platform.OS === 'web' ? null : await ensureEvidenceDirectory()
  if (!directory) {
    if (!asset.base64) throw new Error('Não foi possível ler a foto selecionada.')
    return { ...base, uri: asset.uri, fileName, mimeType, base64: asset.base64, capturedAt }
  }
  const uri = `${directory}/${fileName}`
  await FileSystem.copyAsync({ from: asset.uri, to: uri })
  return { ...base, uri, fileName, mimeType, capturedAt }
}

/** Signature drawn on the screen, as PNG. */
export async function persistSignature(pngBase64: string): Promise<InspectionEvidenceDraft> {
  const id = createLocalId('inssign')
  const fileName = `${id}.png`
  const base = {
    id,
    kind: 'SIGNATURE' as const,
    itemKey: null,
    source: 'UNKNOWN' as const,
    fileName,
    mimeType: 'image/png',
    capturedAt: new Date().toISOString(),
  }
  const directory = Platform.OS === 'web' ? null : await ensureEvidenceDirectory()
  if (!directory) {
    return { ...base, uri: `data:image/png;base64,${pngBase64}`, base64: pngBase64 }
  }
  const uri = `${directory}/${fileName}`
  await FileSystem.writeAsStringAsync(uri, pngBase64, {
    encoding: FileSystem.EncodingType.Base64,
  })
  return { ...base, uri }
}

/** Deletes only files this module created, never a gallery original. */
export async function removeInspectionEvidenceFiles(evidences?: InspectionEvidenceDraft[]) {
  const directory = Platform.OS === 'web' ? null : evidenceDirectory()
  if (!directory || !evidences?.length) return
  await Promise.all(
    evidences.map(async (evidence) => {
      if (!evidence.uri.startsWith(`${directory}/`)) return
      await FileSystem.deleteAsync(evidence.uri, { idempotent: true })
    }),
  )
}
