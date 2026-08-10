import { api } from '@/api/client'
import type { ExecutionMeasurementAdjustmentDraft } from '@/types/execution'

export async function createScaffoldMeasurementAdjustment(
  scaffoldId: string,
  executionEntryId: string,
  adjustment: ExecutionMeasurementAdjustmentDraft,
  mutationId: string,
) {
  const { data } = await api.post(
    `/scaffolds/${scaffoldId}/measurement-adjustments`,
    {
      clientMutationId: mutationId,
      scaffoldComponentId:
        adjustment.scope === 'COMPONENT' ? adjustment.scaffoldComponentId : undefined,
      executionEntryId,
      measurementUnit: adjustment.measurementUnit,
      type: adjustment.type,
      quantity: adjustment.quantity,
      reason: adjustment.reason,
    },
    { headers: { 'Idempotency-Key': mutationId } },
  )

  return data
}
