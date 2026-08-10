/* eslint-disable @typescript-eslint/no-redeclare */
export const SyncStatus = {
  PENDING: 'pending',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  FAILED: 'failed',
  DEAD_LETTER: 'dead_letter',
  CONFLICT: 'conflict',
} as const

export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus]

export const OutboxEntityType = {
  EXECUTION_ENTRY: 'execution_entry',
  EMERGENCY_SCAFFOLD: 'emergency_scaffold',
  CREW_MEMBER_ADD: 'crew_member_add',
  CREW_MEMBER_REMOVE: 'crew_member_remove',
  OPERATIONAL_DEVIATION: 'operational_deviation',
} as const

export type OutboxEntityType = (typeof OutboxEntityType)[keyof typeof OutboxEntityType]

export type OutboxItem<TPayload = unknown> = {
  localId: string
  entityType: OutboxEntityType
  remoteId?: string | null
  contractId?: string | null
  unitId?: string | null
  syncStatus: SyncStatus
  retryCount: number
  idempotencyKey: string
  nextAttemptAt?: string | null
  lockedAt?: string | null
  leaseUntil?: string | null
  leaseOwner?: string | null
  lastErrorCode?: string | null
  errorMessage?: string | null
  payload: TPayload
  createdAt: string
  updatedAt: string
}

export type CachedQueueItem<TPayload = unknown> = {
  remoteId: string
  serviceId: string
  contractId?: string | null
  unitId?: string | null
  scaffoldId?: string | null
  status: string
  payload: TPayload
  fetchedAt: string
  lastSeenAt: string
}
