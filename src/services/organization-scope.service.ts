import { getAllPages } from '@/api/pagination'
import { fetchMe } from '@/services/auth.service'
import {
  getReferenceCache,
  removeReferenceCache,
  setReferenceCache,
} from '@/services/reference-cache.service'
import type { AuthAccessScopeContract, AuthAccessScopeUnit, AuthUser } from '@/types/auth'
import type { OrganizationScopeData } from '@/types/organization-scope'

type RemoteUnit = {
  id: string
  companyId: string
  name: string
  code: string
  company?: {
    id: string
    name: string
  } | null
}

type RemoteContract = {
  id: string
  code: string
  description: string
  clientName?: string | null
  clientContractNumber?: string | null
  clientPlantName?: string | null
  contractObject?: string | null
  unitId: string
}

type ListPayload<T> = T[] | { items?: T[] }

const LEGACY_SCOPE_UNITS_CACHE_KEY = 'organization-scope:units'
const LEGACY_SCOPE_CONTRACTS_CACHE_KEY = 'organization-scope:contracts'

function scopeUnitsCacheKey(user: AuthUser) {
  return `organization-scope:${user.tenantId}:${user.id}:units`
}

function scopeContractsCacheKey(user: AuthUser) {
  return `organization-scope:${user.tenantId}:${user.id}:contracts`
}

function normalizeListPayload<T>(payload: ListPayload<T>) {
  if (Array.isArray(payload)) {
    return payload
  }

  return payload.items ?? []
}

export function hasFullTenantAccess(user: AuthUser | null) {
  return Boolean(
    user?.accessScope?.canAccessAll || user?.roles?.some((role) => role.name === 'TENANT_ADMIN'),
  )
}

function normalizeUnit(unit: RemoteUnit): AuthAccessScopeUnit {
  return {
    id: unit.id,
    name: unit.name,
    code: unit.code,
    companyId: unit.companyId,
    company: unit.company ?? null,
  }
}

function normalizeContract(
  contract: RemoteContract,
  units: AuthAccessScopeUnit[],
): AuthAccessScopeContract {
  return {
    id: contract.id,
    code: contract.code,
    description: contract.description,
    clientName: contract.clientName ?? null,
    clientContractNumber: contract.clientContractNumber ?? null,
    clientPlantName: contract.clientPlantName ?? null,
    contractObject: contract.contractObject ?? null,
    unitId: contract.unitId,
    unit: units.find((unit) => unit.id === contract.unitId) ?? null,
  }
}

export async function fetchAvailableUnits(user: AuthUser) {
  const data = await getAllPages<RemoteUnit>('/units', { skipOrgScope: true })
  const units = normalizeListPayload(data).map(normalizeUnit)
  await setReferenceCache(scopeUnitsCacheKey(user), units)
  return units
}

export async function fetchAvailableContracts(units: AuthAccessScopeUnit[], user: AuthUser) {
  const data = await getAllPages<RemoteContract>('/contracts', { skipOrgScope: true })
  const contracts = normalizeListPayload(data).map((contract) => normalizeContract(contract, units))
  await setReferenceCache(scopeContractsCacheKey(user), contracts)
  return contracts
}

export async function getCachedOrganizationScope(
  user: AuthUser | null,
): Promise<OrganizationScopeData> {
  if (!user) {
    return {
      units: [],
      contracts: [],
      hasFullTenantAccess: false,
    }
  }

  if (!hasFullTenantAccess(user)) {
    return {
      units: user.accessScope.units,
      contracts: user.accessScope.contracts,
      hasFullTenantAccess: false,
    }
  }

  const [units, contracts] = await Promise.all([
    getReferenceCache<AuthAccessScopeUnit[]>(scopeUnitsCacheKey(user)),
    getReferenceCache<AuthAccessScopeContract[]>(scopeContractsCacheKey(user)),
  ])

  return {
    units: units ?? [],
    contracts: contracts ?? [],
    hasFullTenantAccess: hasFullTenantAccess(user),
  }
}

export async function refreshCurrentUserScope() {
  return fetchMe()
}

export async function clearOrganizationScopeCache(user?: AuthUser | null) {
  const keys = [LEGACY_SCOPE_UNITS_CACHE_KEY, LEGACY_SCOPE_CONTRACTS_CACHE_KEY]

  if (user) {
    keys.push(scopeUnitsCacheKey(user), scopeContractsCacheKey(user))
  }

  await Promise.all(keys.map((key) => removeReferenceCache(key)))
}

export async function fetchAuthoritativeOrganizationScope() {
  const resolvedUser = await refreshCurrentUserScope()

  if (!hasFullTenantAccess(resolvedUser)) {
    return {
      user: resolvedUser,
      scope: {
        units: resolvedUser.accessScope.units,
        contracts: resolvedUser.accessScope.contracts,
        hasFullTenantAccess: false,
      } satisfies OrganizationScopeData,
    }
  }

  const units = await fetchAvailableUnits(resolvedUser)
  const contracts = await fetchAvailableContracts(units, resolvedUser)

  return {
    user: resolvedUser,
    scope: {
      units,
      contracts,
      hasFullTenantAccess: true,
    } satisfies OrganizationScopeData,
  }
}

export function isOrganizationContextAllowed(
  scope: OrganizationScopeData | null | undefined,
  context: { unitId?: string | null; contractId?: string | null },
) {
  if (!context.unitId || !context.contractId || !scope) {
    return false
  }

  const unitExists = scope.units.some((unit) => unit.id === context.unitId)
  const contractExists = scope.contracts.some(
    (contract) => contract.id === context.contractId && contract.unitId === context.unitId,
  )

  return unitExists && contractExists
}
