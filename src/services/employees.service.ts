import { getAllPages } from '@/api/pagination'
import type { Employee } from '@/types/employee'
import { getReferenceCache, setReferenceCache } from '@/services/reference-cache.service'

type Scope = {
  contractId: string
  unitId: string
}

function cacheKey(scope: Scope) {
  return `employees:${scope.unitId}:${scope.contractId}`
}

export async function fetchEmployees(scope: Scope) {
  const data = await getAllPages<Employee>('/employees', {
    params: {
      unitId: scope.unitId,
      contractId: scope.contractId,
    },
    headers: {
      'X-Selected-Unit-Id': scope.unitId,
      'X-Selected-Contract-Id': scope.contractId,
    },
    skipOrgScope: true,
  } as never)

  const employees = data.filter(
    (employee) =>
      employee.active !== false &&
      employee.unitId === scope.unitId &&
      employee.contractId === scope.contractId,
  )
  await setReferenceCache(cacheKey(scope), employees)
  return employees
}

export async function getCachedEmployees(scope: Scope) {
  return (await getReferenceCache<Employee[]>(cacheKey(scope))) ?? []
}
