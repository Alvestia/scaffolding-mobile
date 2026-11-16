/* eslint-disable @typescript-eslint/no-redeclare */
import type { ScaffoldGeolocation } from './scaffold-geolocation'
export const ExecutionOperationType = {
  MONTAGEM: 'MONTAGEM',
  DESMONTAGEM: 'DESMONTAGEM',
} as const

export type ExecutionOperationType =
  (typeof ExecutionOperationType)[keyof typeof ExecutionOperationType]

export const ExecutionInputType = {
  QUANTIDADE: 'QUANTIDADE',
  PERCENTUAL: 'PERCENTUAL',
} as const

export type ExecutionInputType = (typeof ExecutionInputType)[keyof typeof ExecutionInputType]

export type ExecutionLaborMode = 'UNASSIGNED' | 'CREW' | 'FUNCTION_QUANTITY'

export type ExecutionFunctionQuantityInput = {
  workFunctionId: string
  quantity: number
}

export type ExecutionComponentAdvanceInput = {
  scaffoldComponentId: string
  inputType: ExecutionInputType
  inputValue: number
}

export const MeasurementAdjustmentType = {
  DEDUCTION: 'DEDUCTION',
  ADDITION: 'ADDITION',
} as const

export type MeasurementAdjustmentType =
  (typeof MeasurementAdjustmentType)[keyof typeof MeasurementAdjustmentType]

export type ExecutionMeasurementAdjustmentDraft = {
  localId: string
  scope: 'SCAFFOLD' | 'COMPONENT'
  scaffoldComponentId?: string
  measurementUnit: 'M3' | 'M2' | 'UNIDADE'
  type: MeasurementAdjustmentType
  quantity: number
  reason: string
}

export type ExecutionDraft = {
  localId: string
  scaffoldServiceId: string
  operationType: ExecutionOperationType
  inputType: ExecutionInputType
  inputValue: number
  startTime: string
  endTime: string
  notes?: string
  crewId?: string
  scaffoldComponentIds?: string[]
  crewSize?: number
  manHours?: number
  memberEmployeeIds?: string[]
}

export type CreateExecutionEntryDto = {
  scaffoldGeolocation?: ScaffoldGeolocation
  expectedBasisVersion?: number
  clientMutationId?: string
  scaffoldServiceId: string
  operationType: ExecutionOperationType
  inputType: ExecutionInputType
  inputValue: number
  startTime: string
  endTime: string
  notes?: string
  /** Work shift; absent: the API suggests it from the start (older drafts). */
  shiftId?: string | null
  crewId?: string
  laborMode?: ExecutionLaborMode
  functionQuantities?: ExecutionFunctionQuantityInput[]
  scaffoldComponentIds?: string[]
  scaffoldComponentAdvances?: ExecutionComponentAdvanceInput[]
  crewSize?: number
  manHours?: number
  memberEmployeeIds?: string[]
}

export type ExecutionEvidenceDraft = {
  id: string
  uri: string
  fileName: string
  mimeType: string
  base64?: string
  size?: number
  checksumSha256?: string
}

export type QueuedExecutionEntryPayload = {
  basisSnapshot?: { version: number; quantity: number; unit: string }
  entry: CreateExecutionEntryDto
  scaffoldId?: string
  adjustments?: ExecutionMeasurementAdjustmentDraft[]
  evidenceCaption?: string
  evidences?: ExecutionEvidenceDraft[]
}

export type EmergencyScaffoldComponentDraft = {
  componentTypeId: string
  componentTypeCode?: string
  name: string
  description?: string
  measurementUnit: 'M3' | 'M2' | 'UNIDADE'
  height?: number
  width?: number
  length?: number
  plannedQuantity?: number
}

export type EmergencyScaffoldDraft = {
  geolocation?: ScaffoldGeolocation
  localId: string
  mobileLocalId?: string
  code?: string
  scaffoldTypeId: string
  companyId: string
  unitId: string
  contractId: string
  workOrderId?: string
  projectId?: string
  areaId?: string
  description?: string
  location?: string
  measurementUnit: 'M3' | 'M2' | 'LINEAR_M' | 'UNIDADE'
  height?: number
  width?: number
  length?: number
  volumeM3?: number
  areaM2?: number
  linearM?: number
  autoCreateServices?: boolean
  createDismantlingService?: boolean
  assemblyForecastStartDate?: string
  assemblyForecastEndDate?: string
  disassemblyForecastStartDate?: string
  disassemblyForecastEndDate?: string
  components?: EmergencyScaffoldComponentDraft[]
}
