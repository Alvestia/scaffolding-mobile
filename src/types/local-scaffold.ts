import type { MeasurementUnit, ScaffoldServiceType } from './scaffold-service'
import type { SyncStatus } from './sync'

export type LocalScaffoldService = {
  localId: string
  localScaffoldId: string
  remoteId: string | null
  type: ScaffoldServiceType
  plannedUnit: MeasurementUnit
  plannedQuantity: number | null
  description: string | null
  scaffoldCode: string | null
  scaffoldDescription: string | null
  contractId: string
  unitId: string
  syncStatus: SyncStatus
  createdAt: string
  updatedAt: string
}
