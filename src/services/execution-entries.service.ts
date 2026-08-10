import { api } from '@/api/client'
import type { CreateExecutionEntryDto } from '@/types/execution'

export async function createExecutionEntry(
  payload: CreateExecutionEntryDto,
  mutationId?: string,
) {
  const { data } = await api.post(
    '/execution-entries',
    { ...payload, clientMutationId: mutationId ?? payload.clientMutationId },
    mutationId ? { headers: { 'Idempotency-Key': mutationId } } : undefined,
  )
  return data
}
