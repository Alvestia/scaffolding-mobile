import { api } from '@/api/client'
import { getReferenceCache, setReferenceCache } from '@/services/reference-cache.service'
import type { ContractShift } from '@/types/shift'

type Scope = {
  contractId: string
  unitId: string
}

function cacheKey(scope: Scope) {
  return `contract-shifts:active:${scope.unitId}:${scope.contractId}`
}

/** Active shifts of the contract, kept for offline entries. */
export async function fetchContractShifts(scope: Scope) {
  const { data } = await api.get<ContractShift[]>(`/contracts/${scope.contractId}/shifts`, {
    headers: {
      'X-Selected-Unit-Id': scope.unitId,
      'X-Selected-Contract-Id': scope.contractId,
    },
  })
  await setReferenceCache(cacheKey(scope), data)
  return data
}

export async function getCachedContractShifts(scope: Scope) {
  return (await getReferenceCache<ContractShift[]>(cacheKey(scope))) ?? []
}
