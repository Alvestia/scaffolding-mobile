import type { CreateExecutionEntryDto, QueuedExecutionEntryPayload } from '@/types/execution'

export function normalizeQueuedExecutionPayload(
  payload: unknown,
): QueuedExecutionEntryPayload | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  if ('entry' in payload && payload.entry && typeof payload.entry === 'object') {
    const entry = normalizeEntry(payload.entry)

    if (!entry.scaffoldServiceId) {
      return null
    }

    return {
      entry,
      basisSnapshot: (payload as QueuedExecutionEntryPayload).basisSnapshot,
      scaffoldId:
        typeof (payload as QueuedExecutionEntryPayload).scaffoldId === 'string'
          ? (payload as QueuedExecutionEntryPayload).scaffoldId
          : undefined,
      adjustments: Array.isArray((payload as QueuedExecutionEntryPayload).adjustments)
        ? (payload as QueuedExecutionEntryPayload).adjustments
        : [],
      evidenceCaption:
        typeof (payload as QueuedExecutionEntryPayload).evidenceCaption === 'string'
          ? (payload as QueuedExecutionEntryPayload).evidenceCaption
          : undefined,
      evidences: Array.isArray((payload as QueuedExecutionEntryPayload).evidences)
        ? (payload as QueuedExecutionEntryPayload).evidences
        : [],
    }
  }

  if ('scaffoldServiceId' in payload) {
    const entry = normalizeEntry(payload)

    if (!entry.scaffoldServiceId) {
      return null
    }

    return {
      entry,
      scaffoldId: undefined,
      adjustments: [],
      evidenceCaption: undefined,
      evidences: [],
    }
  }

  return null
}

function normalizeEntry(value: object): CreateExecutionEntryDto {
  const entry = value as Partial<CreateExecutionEntryDto> & {
    crewMemberEmployeeIds?: string[]
    selectedScaffoldComponentIds?: string[]
  }

  return {
    clientMutationId: entry.clientMutationId,
    scaffoldGeolocation: entry.scaffoldGeolocation,
    expectedBasisVersion: entry.expectedBasisVersion,
    scaffoldServiceId: entry.scaffoldServiceId ?? '',
    operationType: entry.operationType!,
    inputType: entry.inputType!,
    inputValue: entry.inputValue!,
    startTime: entry.startTime!,
    endTime: entry.endTime!,
    notes: entry.notes,
    crewId: entry.crewId,
    laborMode: entry.laborMode ?? (entry.crewId ? 'CREW' : 'UNASSIGNED'),
    functionQuantities: entry.functionQuantities,
    memberEmployeeIds: entry.memberEmployeeIds ?? entry.crewMemberEmployeeIds,
    scaffoldComponentIds: entry.scaffoldComponentIds ?? entry.selectedScaffoldComponentIds,
    scaffoldComponentAdvances: entry.scaffoldComponentAdvances,
    crewSize: entry.crewSize,
    manHours: entry.manHours,
  }
}

export function getQueuedExecutionServiceId(payload: unknown) {
  return normalizeQueuedExecutionPayload(payload)?.entry.scaffoldServiceId ?? null
}
