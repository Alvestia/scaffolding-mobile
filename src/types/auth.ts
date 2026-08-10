export type AuthRole = {
  id: string
  name: string
}

export type AuthAccessScopeUnit = {
  id: string
  name: string
  code: string
  companyId: string
  company: {
    id: string
    name: string
  } | null
}

export type AuthAccessScopeContract = {
  id: string
  code: string
  description: string
  clientName?: string | null
  clientContractNumber?: string | null
  clientPlantName?: string | null
  contractObject?: string | null
  unitId: string
  unit: AuthAccessScopeUnit | null
}

export type AuthAccessScope = {
  mode: 'NONE' | 'ALL' | 'RESTRICTED'
  canAccessAll: boolean
  explicitUnitIds: string[]
  explicitContractIds: string[]
  accessibleUnitIds: string[]
  accessibleContractIds: string[]
  units: AuthAccessScopeUnit[]
  contracts: AuthAccessScopeContract[]
}

export type AuthUser = {
  id: string
  name: string
  email: string
  tenantId: string
  roles: AuthRole[]
  permissions: string[]
  accessScope: AuthAccessScope
}

export type LoginInput = {
  email: string
  password: string
}

export type LoginResponse = {
  accessToken: string
  user: AuthUser
  sessionMode?: 'LEGACY' | 'DEVICE'
  deviceCredential?: string | null
  deviceCredentialExpiresAt?: string
}
