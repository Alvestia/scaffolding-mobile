/* eslint-disable @typescript-eslint/no-redeclare */
export const ScaffoldServiceStatus = {
  NAO_INICIADO: 'NAO_INICIADO',
  EM_EXECUCAO: 'EM_EXECUCAO',
  CONCLUIDO: 'CONCLUIDO',
  CANCELLED: 'CANCELLED',
  NOT_EXECUTED: 'NOT_EXECUTED',
} as const

export type ScaffoldServiceStatus =
  (typeof ScaffoldServiceStatus)[keyof typeof ScaffoldServiceStatus]

export const ScaffoldServiceType = {
  MONTAGEM: 'MONTAGEM',
  DESMONTAGEM: 'DESMONTAGEM',
  MODIFICACAO: 'MODIFICACAO',
} as const

export type ScaffoldServiceType = (typeof ScaffoldServiceType)[keyof typeof ScaffoldServiceType]

export const MeasurementUnit = {
  M3: 'M3',
  M2: 'M2',
  LINEAR_M: 'LINEAR_M',
  UNIDADE: 'UNIDADE',
} as const

export type MeasurementUnit = (typeof MeasurementUnit)[keyof typeof MeasurementUnit]

export type QueueServiceItem = {
  id: string
  scaffoldId: string
  workOrderId?: string | null
  type: ScaffoldServiceType
  plannedUnit: MeasurementUnit
  quantityVersion?: number
  plannedQuantity: number
  executedQuantity: number
  progress: number
  status: ScaffoldServiceStatus
  description?: string | null
  startForecast?: string | null
  endForecast?: string | null
  scaffold?: {
    id: string
    code: string
    areaId?: string | null
    areaRef?: {
      id: string
      code?: string | null
      name: string
    } | null
    area?: {
      id: string
      code?: string | null
      name: string
    } | null
    description?: string | null
    location?: string | null
    height?: number | null
    length?: number | null
    width?: number | null
    scaffoldType?: {
      id: string
      code: string
      name: string
    } | null
  } | null
  workOrder?: {
    id: string
    code: string
    areaId?: string | null
    areaRef?: {
      id: string
      code?: string | null
      name: string
    } | null
  } | null
  scaffoldComponent?: {
    id: string
    name: string
    category: string
  } | null
}
