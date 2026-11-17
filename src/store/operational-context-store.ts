import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import type { OperationalContext, TeamMember } from '@/types/operational-context'
import { createJSONStorage, persist } from '@/utils/zustand-middleware'
import { nowIso } from '@/utils/date'
import { copyEntryDefaults, type EntryDefaults } from '@/types/entry-defaults'

type OperationalContextState = OperationalContext & {
  ownerTenantId: string | null
  ownerUserId: string | null
  setScope: (payload: {
    companyId: string | null
    companyName?: string | null
    unitId: string
    unitCode?: string | null
    unitName?: string | null
    contractId: string
    contractCode?: string | null
    contractDescription?: string | null
    contractClientName?: string | null
    contractPlantName?: string | null
  }) => void
  setCrew: (payload: {
    crewId: string
    crewName: string
    crewForemanName?: string | null
    teamMembers: TeamMember[]
  }) => void
  setTeamMembers: (teamMembers: TeamMember[]) => void
  setEntryDefaults: (defaults: EntryDefaults | null) => void
  reset: () => void
  activateOwner: (user: { id: string; tenantId: string }) => void
  clearOwner: () => void
}

const initialState: OperationalContext = {
  companyId: null,
  companyName: null,
  unitId: null,
  unitCode: null,
  unitName: null,
  contractId: null,
  contractCode: null,
  contractDescription: null,
  contractClientName: null,
  contractPlantName: null,
  crewId: null,
  crewName: null,
  crewForemanName: null,
  teamMembers: [],
  entryDefaults: null,
  lastUpdatedAt: null,
}

export const useOperationalContextStore = create<OperationalContextState>()(
  persist(
    (set) => ({
      ...initialState,
      ownerTenantId: null,
      ownerUserId: null,
      setScope: ({
        companyId,
        companyName,
        unitId,
        unitCode,
        unitName,
        contractId,
        contractCode,
        contractDescription,
        contractClientName,
        contractPlantName,
      }) =>
        set((state) => ({
          companyId,
          companyName: companyName ?? null,
          unitId,
          unitCode: unitCode ?? null,
          unitName: unitName ?? null,
          contractId,
          contractCode: contractCode ?? null,
          contractDescription: contractDescription ?? null,
          contractClientName: contractClientName ?? null,
          contractPlantName: contractPlantName ?? null,
          entryDefaults:
            state.contractId === contractId && state.unitId === unitId ? state.entryDefaults : null,
          crewId: null,
          crewName: null,
          crewForemanName: null,
          teamMembers: [],
          lastUpdatedAt: nowIso(),
        })),
      setEntryDefaults: (defaults) =>
        set({
          entryDefaults: defaults ? copyEntryDefaults(defaults) : null,
          lastUpdatedAt: nowIso(),
        }),
      setCrew: ({ crewId, crewName, crewForemanName, teamMembers }) =>
        set({
          crewId,
          crewName,
          crewForemanName: crewForemanName ?? null,
          teamMembers,
          lastUpdatedAt: nowIso(),
        }),
      setTeamMembers: (teamMembers) =>
        set({
          teamMembers,
          lastUpdatedAt: nowIso(),
        }),
      reset: () =>
        set((state) => ({
          ...initialState,
          ownerTenantId: state.ownerTenantId,
          ownerUserId: state.ownerUserId,
        })),
      activateOwner: (user) =>
        set((state) => {
          if (state.ownerTenantId === user.tenantId && state.ownerUserId === user.id) {
            return state
          }

          return {
            ...initialState,
            ownerTenantId: user.tenantId,
            ownerUserId: user.id,
          }
        }),
      clearOwner: () =>
        set({
          ...initialState,
          ownerTenantId: null,
          ownerUserId: null,
        }),
    }),
    {
      name: 'scaffold_mobile_operational_context',
      version: 4,
      migrate: (persistedState, persistedVersion) => {
        const state = persistedState as Partial<OperationalContextState> | undefined

        if (persistedVersion < 3) {
          return {
            ...initialState,
            ownerTenantId: null,
            ownerUserId: null,
          }
        }

        return {
          ...initialState,
          ...state,
          crewId: state?.crewId ?? null,
          crewName: state?.crewName ?? null,
          crewForemanName: state?.crewForemanName ?? null,
          teamMembers: state?.teamMembers ?? [],
          entryDefaults: persistedVersion < 4 ? null : (state?.entryDefaults ?? null),
          ownerTenantId: state?.ownerTenantId ?? null,
          ownerUserId: state?.ownerUserId ?? null,
        }
      },
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
)
