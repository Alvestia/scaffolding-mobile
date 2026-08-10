import type { Employee } from '@/types/employee'

export type CrewMember = {
  id: string
  tenantId: string
  crewId: string
  employeeId: string
  employee?: Employee | null
}

export type Crew = {
  id: string
  tenantId: string
  unitId: string
  contractId: string
  name: string
  foremanId?: string | null
  isActive: boolean
  unit?: {
    id: string
    name: string
  } | null
  contract?: {
    id: string
    description: string
  } | null
  foreman?: {
    id: string
    name: string
  } | null
  members?: CrewMember[]
}

export type CrewMemberMutationPayload = {
  crewId: string
  employeeIds: string[]
}

export type CrewMemberRemovalPayload = {
  crewId: string
  employeeId: string
}
