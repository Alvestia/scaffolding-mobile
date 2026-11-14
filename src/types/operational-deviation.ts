/* eslint-disable @typescript-eslint/no-redeclare */
export const DeviationCategory = {
  SEGURANCA: 'SEGURANCA',
  QUALIDADE: 'QUALIDADE',
  PRODUTIVIDADE: 'PRODUTIVIDADE',
  LOGISTICA: 'LOGISTICA',
  CLIMA: 'CLIMA',
  OPERACIONAL: 'OPERACIONAL',
  OUTROS: 'OUTROS',
} as const

export type DeviationCategory = (typeof DeviationCategory)[keyof typeof DeviationCategory]

export const DeviationSeverity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITTICAL: 'CRITTICAL',
} as const

export type DeviationSeverity = (typeof DeviationSeverity)[keyof typeof DeviationSeverity]

export const DeviationResponsibility = {
  KAEFER: 'KAEFER',
  CLIENT: 'CLIENT',
  OTHER: 'OTHER',
} as const

export type DeviationResponsibility =
  (typeof DeviationResponsibility)[keyof typeof DeviationResponsibility]

export type DeviationTypeCatalog = {
  id: string
  name: string
  code?: string | null
  category: DeviationCategory
  severity: DeviationSeverity
  impactsTime: boolean
  impactsQuality: boolean
  impactsSafety: boolean
  description?: string | null
}

export type DeviationEvidenceDraft = {
  id: string
  uri: string
  fileName: string
  mimeType: string
  base64?: string
  size?: number
  checksumSha256?: string
}

export type CreateOperationalDeviationDto = {
  clientMutationId?: string
  deviationTypeId: string
  crewId?: string
  laborMode: 'CREW' | 'FUNCTION_QUANTITY' | 'UNASSIGNED'
  title: string
  description?: string
  responsibility: DeviationResponsibility
  ocurredAt: string
  resolvedAt: string
  /** Work shift; absent: the API suggests it from the start. */
  shiftId?: string | null
  memberEmployeeIds?: string[]
  functionQuantities?: {
    workFunctionId: string
    quantity: number
  }[]
  isGlobal: boolean
  companyId?: string
  unitId?: string
  contractId?: string
  projectId?: string
  workOrderId?: string
  scaffoldId?: string
  scaffoldServiceId?: string
  executionEntryId?: string
  notes?: string
}

export type OperationalDeviationDraft = {
  dto: CreateOperationalDeviationDto
  evidences?: DeviationEvidenceDraft[]
  evidenceCaption?: string
}
