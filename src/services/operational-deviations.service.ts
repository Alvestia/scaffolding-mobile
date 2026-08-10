import { api } from '@/api/client'
import type { CreateOperationalDeviationDto } from '@/types/operational-deviation'

export async function createOperationalDeviation(
  dto: CreateOperationalDeviationDto,
  mutationId?: string,
) {
  const { data } = await api.post<{ id: string }>(
    '/operational-deviations',
    { ...dto, clientMutationId: mutationId ?? dto.clientMutationId },
    mutationId ? { headers: { 'Idempotency-Key': mutationId } } : undefined,
  )
  return data
}
