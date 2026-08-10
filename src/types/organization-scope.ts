import type { AuthAccessScopeContract, AuthAccessScopeUnit } from '@/types/auth'

export type OrganizationScopeData = {
  units: AuthAccessScopeUnit[]
  contracts: AuthAccessScopeContract[]
  hasFullTenantAccess: boolean
}
