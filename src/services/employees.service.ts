import { getAllPages } from '@/api/pagination'
import type { Employee } from '@/types/employee'
import { getReferenceCache, setReferenceCache } from '@/services/reference-cache.service'

type Scope = {
  contractId: string
  unitId: string
}

function cacheKey(contractId: string) {
  return `employees:${contractId}`
}

export async function fetchEmployees(scope: Scope) {
  const data = await getAllPages<Employee>('/employees', {
    headers: {
      'X-Selected-Unit-Id': scope.unitId,
      'X-Selected-Contract-Id': scope.contractId,
    },
    skipOrgScope: true,
  } as never)

  const employees = data.filter((employee) => employee.active !== false)
  await setReferenceCache(cacheKey(scope.contractId), employees)
  return employees
}

export async function getCachedEmployees(contractId: string) {
  return (await getReferenceCache<Employee[]>(cacheKey(contractId))) ?? []
}
