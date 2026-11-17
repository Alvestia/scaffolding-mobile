import type { EntryDefaults } from './entry-defaults'

export type TeamMember = {
  employeeId: string
  name: string
  registrationCode?: string | null
  role?: string | null
}

export type OperationalContext = {
  companyId: string | null
  companyName: string | null
  unitId: string | null
  unitCode: string | null
  unitName: string | null
  contractId: string | null
  contractCode: string | null
  contractDescription: string | null
  contractClientName: string | null
  contractPlantName: string | null
  crewId: string | null
  crewName: string | null
  crewForemanName: string | null
  teamMembers: TeamMember[]
  entryDefaults: EntryDefaults | null
  lastUpdatedAt: string | null
}
