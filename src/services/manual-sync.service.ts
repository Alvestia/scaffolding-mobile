import { queueCacheRepository } from '@/database/repositories/queue-cache-repository'
import { syncStateRepository } from '@/database/repositories/sync-state-repository'
import { fetchAreas } from '@/services/areas.service'
import { fetchCrews } from '@/services/crews.service'
import { fetchDeviationTypes } from '@/services/deviation-types.service'
import { fetchEmployees } from '@/services/employees.service'
import { fetchProjects } from '@/services/projects.service'
import { fetchQueueServices } from '@/services/scaffold-services.service'
import { fetchScaffoldTypes } from '@/services/scaffold-types.service'
import { fetchLatestScaffold } from '@/services/scaffolds.service'
import { fetchWorkOrders } from '@/services/work-orders.service'
import { fetchWorkFunctions } from '@/services/work-functions.service'
import { runFullSync } from '@/sync/sync-engine'
import type { QueueServiceItem } from '@/types/scaffold-service'
import { nowIso } from '@/utils/date'
import { getErrorMessage } from '@/utils/error'

export type ManualSyncScope = {
  contractId: string
  unitId: string
  companyId?: string | null
}

export type ManualSyncStepKey =
  | 'outbox'
  | 'scaffolds'
  | 'services'
  | 'crews'
  | 'employees'
  | 'catalogs'

export type ManualSyncStepStatus = 'pending' | 'running' | 'done' | 'error'

export type ManualSyncStep = {
  key: ManualSyncStepKey
  label: string
  progress: number
  status: ManualSyncStepStatus
  message?: string | null
}

type StepDefinition = {
  key: ManualSyncStepKey
  label: string
}

const STEP_DEFINITIONS: StepDefinition[] = [
  { key: 'outbox', label: 'Pendências' },
  { key: 'scaffolds', label: 'Scaffolds' },
  { key: 'services', label: 'Services' },
  { key: 'crews', label: 'Equipes' },
  { key: 'employees', label: 'Funcionários' },
  { key: 'catalogs', label: 'Catálogos' },
]

export function createInitialManualSyncSteps(): ManualSyncStep[] {
  return STEP_DEFINITIONS.map((step) => ({
    ...step,
    progress: 0,
    status: 'pending',
    message: null,
  }))
}

function updateStep(
  steps: ManualSyncStep[],
  key: ManualSyncStepKey,
  patch: Partial<Omit<ManualSyncStep, 'key' | 'label'>>,
) {
  return steps.map((step) => (step.key === key ? { ...step, ...patch } : step))
}

export async function runManualSync(
  scope: ManualSyncScope,
  onProgress?: (steps: ManualSyncStep[]) => void,
) {
  let steps = createInitialManualSyncSteps()
  let queueItems: QueueServiceItem[] = []

  const emit = () => onProgress?.(steps.map((step) => ({ ...step })))

  const runStep = async <TResult>(key: ManualSyncStepKey, task: () => Promise<TResult>) => {
    steps = updateStep(steps, key, {
      status: 'running',
      progress: 35,
      message: null,
    })
    emit()

    try {
      const result = await task()
      steps = updateStep(steps, key, {
        status: 'done',
        progress: 100,
        message: null,
      })
      emit()
      return result
    } catch (error) {
      steps = updateStep(steps, key, {
        status: 'error',
        progress: 100,
        message: getErrorMessage(error, 'Falha ao atualizar este grupo.'),
      })
      emit()
      throw error
    }
  }

  emit()

  await runStep('outbox', () => runFullSync(scope, { includeQueue: false }))
  queueItems = await runStep('scaffolds', async () => {
    const [items] = await Promise.all([fetchQueueServices(scope), fetchLatestScaffold(scope)])
    return items
  })
  await runStep('services', () => queueCacheRepository.replaceForScope(queueItems, scope))
  await runStep('crews', () => fetchCrews(scope))
  await runStep('employees', () => fetchEmployees(scope))
  await runStep('catalogs', async () => {
    await Promise.all([
      fetchScaffoldTypes(),
      fetchDeviationTypes(),
      fetchProjects(scope),
      fetchWorkFunctions(scope),
      fetchAreas({
        companyId: scope.companyId ?? null,
        unitId: scope.unitId,
        contractId: scope.contractId,
      }),
      fetchWorkOrders({
        unitId: scope.unitId,
        contractId: scope.contractId,
      }),
    ])
  })

  await syncStateRepository.set('lastSyncAt', nowIso())
}
