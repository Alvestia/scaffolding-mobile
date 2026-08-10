import type { AuthAccessScopeContract, AuthAccessScopeUnit, AuthUser } from '@/types/auth'

export function getAccessibleUnits(user: AuthUser | null) {
  return user?.accessScope.units ?? []
}

export function getContractsForUnit(
  user: AuthUser | null,
  unitId: string | null,
): AuthAccessScopeContract[] {
  if (!user || !unitId) {
    return []
  }

  return user.accessScope.contracts.filter((contract) => contract.unitId === unitId)
}

export function getUnitById(user: AuthUser | null, unitId: string | null): AuthAccessScopeUnit | null {
  if (!user || !unitId) {
    return null
  }

  return user.accessScope.units.find((unit) => unit.id === unitId) ?? null
}
