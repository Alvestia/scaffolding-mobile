import type { ExecutionFunctionQuantityInput, ExecutionLaborMode } from './execution'

/** Preferences for new entries only. Existing drafts always keep their own values. */
export type EntryDefaults = {
  laborMode: ExecutionLaborMode
  crewId: string | null
  /** undefined: load the crew roster; an array: use this local composition. */
  memberEmployeeIds?: string[]
  functionQuantities: ExecutionFunctionQuantityInput[]
  /** undefined: suggest by time; null: explicitly no shift. */
  shiftId?: string | null
}

export function copyEntryDefaults(value?: EntryDefaults | null): EntryDefaults {
  return {
    laborMode: value?.laborMode ?? 'UNASSIGNED',
    crewId: value?.crewId ?? null,
    ...(value?.memberEmployeeIds !== undefined
      ? { memberEmployeeIds: [...value.memberEmployeeIds] }
      : {}),
    functionQuantities: (value?.functionQuantities ?? []).map((item) => ({ ...item })),
    shiftId: value?.shiftId,
  }
}
