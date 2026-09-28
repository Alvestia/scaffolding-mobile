import type { QueueServiceItem } from '@/types/scaffold-service'

export type ExecutionBasis = { version: number; quantity: number | null; unit: string }

export function matchesExecutionBasis(service: QueueServiceItem, basis: ExecutionBasis) {
  return basis.version === (service.quantityVersion ?? 0) &&
    (basis.quantity == null || Math.abs(basis.quantity - service.plannedQuantity) < 0.000001) &&
    (!basis.unit || basis.unit === service.plannedUnit)
}
