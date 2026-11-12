import type { QueueServiceItem } from '@/types/scaffold-service'
import type { WorkOrder } from '@/types/work-order'
import { isLocalId } from '@/utils/id'

/** Optional link of a deviation: a work order, a scaffold, both or neither. */
export type DeviationScaffoldOption = {
  id: string
  code: string
  location: string | null
  description: string | null
  /** Work orders of the scaffold's services in the queue. */
  workOrderIds: string[]
}

/**
 * Scaffolds the deviation can point to: those with activities in the queue,
 * which is available offline. Scaffolds still only on this phone are left out:
 * the server does not know them yet.
 */
export function scaffoldsFromQueue(items: QueueServiceItem[]): DeviationScaffoldOption[] {
  const byId = new Map<string, DeviationScaffoldOption>()
  for (const item of items) {
    if (!item.scaffold || !item.scaffoldId || isLocalId(item.scaffoldId)) continue
    const current = byId.get(item.scaffoldId) ?? {
      id: item.scaffoldId,
      code: item.scaffold.code,
      location: item.scaffold.location ?? null,
      description: item.scaffold.description ?? null,
      workOrderIds: [],
    }
    if (item.workOrderId && !current.workOrderIds.includes(item.workOrderId)) {
      current.workOrderIds.push(item.workOrderId)
    }
    byId.set(item.scaffoldId, current)
  }
  return [...byId.values()].sort((left, right) => left.code.localeCompare(right.code))
}

/** With a work order chosen, only the scaffolds that belong to it. */
export function scaffoldsForWorkOrder(
  scaffolds: DeviationScaffoldOption[],
  workOrderId: string | null | undefined,
) {
  return workOrderId
    ? scaffolds.filter((scaffold) => scaffold.workOrderIds.includes(workOrderId))
    : scaffolds
}

/** Work orders in progress in the contract and unit of the deviation. */
export function linkableWorkOrders(
  workOrders: WorkOrder[],
  scope: { contractId: string | null; unitId: string | null },
) {
  return workOrders.filter(
    (workOrder) =>
      (workOrder.status === 'OPEN' || workOrder.status === 'IN_PROGRESS') &&
      (!workOrder.contractId || workOrder.contractId === scope.contractId) &&
      (!workOrder.unitId || workOrder.unitId === scope.unitId),
  )
}

/**
 * The deviation stays contract-wide (global) only without a work order and
 * without a scaffold. With either, the server takes the contract from it.
 */
export function deviationLinkFields(link: { workOrderId: string; scaffoldId: string }) {
  const workOrderId = link.workOrderId || undefined
  const scaffoldId = link.scaffoldId || undefined
  return { isGlobal: !workOrderId && !scaffoldId, workOrderId, scaffoldId }
}
