import { api } from '@/api/client'
import { getAllPages } from '@/api/pagination'
import { getReferenceCache, setReferenceCache } from '@/services/reference-cache.service'
import type { Crew, CrewMember } from '@/types/crew'
import type { Employee } from '@/types/employee'

type Scope = {
  contractId: string
  unitId: string
}

function crewsCacheKey(contractId: string) {
  return `crews:${contractId}`
}

function crewMembersCacheKey(contractId: string, crewId: string) {
  return `crew-members:${contractId}:${crewId}`
}

function normalizeCrewMember(member: CrewMember) {
  return {
    ...member,
    employee: member.employee
      ? {
          ...member.employee,
          registrationCode: member.employee.registrationCode ?? null,
        }
      : null,
  }
}

function normalizeCrew(crew: Crew) {
  return {
    ...crew,
    members: (crew.members ?? []).map(normalizeCrewMember),
  }
}

async function updateCrewCaches(contractId: string, crew: Crew) {
  const normalizedCrew = normalizeCrew(crew)
  const cachedCrews = await getCachedCrews(contractId)
  const nextCrews = [
    ...cachedCrews.filter((item) => item.id !== normalizedCrew.id),
    normalizedCrew,
  ].sort((left, right) => left.name.localeCompare(right.name))

  await Promise.all([
    setReferenceCache(crewsCacheKey(contractId), nextCrews),
    setReferenceCache(
      crewMembersCacheKey(contractId, normalizedCrew.id),
      normalizedCrew.members ?? [],
    ),
  ])
}

export async function fetchCrews(scope: Scope) {
  const data = await getAllPages<Crew>('/crews', {
    headers: {
      'X-Selected-Unit-Id': scope.unitId,
      'X-Selected-Contract-Id': scope.contractId,
    },
    skipOrgScope: true,
  } as never)

  const crews = data
    .filter(
      (crew) =>
        crew.contractId === scope.contractId &&
        crew.unitId === scope.unitId &&
        crew.isActive !== false,
    )
    .map(normalizeCrew)

  await Promise.all([
    setReferenceCache(crewsCacheKey(scope.contractId), crews),
    ...crews.map((crew) =>
      setReferenceCache(
        crewMembersCacheKey(scope.contractId, crew.id),
        crew.members ?? [],
      ),
    ),
  ])

  return crews
}

export async function getCachedCrews(contractId: string) {
  return (await getReferenceCache<Crew[]>(crewsCacheKey(contractId))) ?? []
}

export async function fetchCrewMembers(scope: Scope, crewId: string) {
  const { data } = await api.get(`/crews/${crewId}/members`, {
    headers: {
      'X-Selected-Unit-Id': scope.unitId,
      'X-Selected-Contract-Id': scope.contractId,
    },
  } as never)

  const members = (data as CrewMember[]).map(normalizeCrewMember)
  await setReferenceCache(crewMembersCacheKey(scope.contractId, crewId), members)

  const cachedCrews = await getCachedCrews(scope.contractId)
  const cachedCrew = cachedCrews.find((crew) => crew.id === crewId)
  if (cachedCrew) {
    await updateCrewCaches(scope.contractId, {
      ...cachedCrew,
      members,
    })
  }

  return members
}

export async function getCachedCrewMembers(contractId: string, crewId: string) {
  return (
    (await getReferenceCache<CrewMember[]>(crewMembersCacheKey(contractId, crewId))) ?? []
  )
}

export async function addCrewMembers(
  crewId: string,
  employeeIds: string[],
  mutationId?: string,
) {
  const { data } = await api.post(`/crews/${crewId}/members`, {
    employeesIds: employeeIds,
  }, mutationId ? { headers: { 'Idempotency-Key': mutationId } } : undefined)

  return (data as CrewMember[]).map(normalizeCrewMember)
}

export async function removeCrewMember(
  crewId: string,
  employeeId: string,
  mutationId?: string,
) {
  await api.delete(
    `/crews/${crewId}/members/${employeeId}`,
    mutationId ? { headers: { 'Idempotency-Key': mutationId } } : undefined,
  )
}

export async function applyCrewMembersSnapshot(
  contractId: string,
  crewId: string,
  members: (CrewMember | { employeeId: string; employee: Employee | null })[],
) {
  const normalizedMembers: CrewMember[] = members.map((member, index) => ({
    id: 'id' in member ? member.id : `${crewId}:${member.employeeId}:${index}`,
    tenantId: '',
    crewId,
    employeeId: member.employeeId,
    employee: member.employee
      ? {
          ...member.employee,
          registrationCode: member.employee.registrationCode ?? null,
        }
      : null,
  }))

  await setReferenceCache(crewMembersCacheKey(contractId, crewId), normalizedMembers)

  const cachedCrews = await getCachedCrews(contractId)
  const cachedCrew = cachedCrews.find((crew) => crew.id === crewId)
  if (!cachedCrew) {
    return
  }

  await updateCrewCaches(contractId, {
    ...cachedCrew,
    members: normalizedMembers,
  })
}
