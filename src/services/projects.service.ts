import { getAllPages } from '@/api/pagination'
import { getReferenceCache, setReferenceCache } from '@/services/reference-cache.service'
import type { Project } from '@/types/project'

type Scope = {
  contractId: string
  unitId: string
}

function cacheKey(scope: Scope) {
  return `projects:v2:${scope.unitId}:${scope.contractId}`
}

export async function fetchProjects(scope: Scope) {
  const projects = await getAllPages<Project>('/projects', {
    params: {
      contractId: scope.contractId,
      unitId: scope.unitId,
      // A API normaliza os valores atuais (`active`) e legados (`ATIVO`).
      status: 'active',
    },
    headers: {
      'X-Selected-Unit-Id': scope.unitId,
      'X-Selected-Contract-Id': scope.contractId,
    },
  })
  const scopedProjects = projects.filter(
    (project) =>
      !project.contractId || project.contractId === scope.contractId,
  )
  await setReferenceCache(cacheKey(scope), scopedProjects)
  return scopedProjects
}

export async function getCachedProjects(scope: Scope) {
  return (await getReferenceCache<Project[]>(cacheKey(scope))) ?? []
}
