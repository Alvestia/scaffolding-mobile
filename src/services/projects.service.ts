import { getAllPages } from '@/api/pagination'
import { getReferenceCache, setReferenceCache } from '@/services/reference-cache.service'
import type { Project } from '@/types/project'

const CACHE_KEY = 'projects'

export async function fetchProjects() {
  const projects = await getAllPages<Project>('/projects')
  await setReferenceCache(CACHE_KEY, projects)
  return projects
}

export async function getCachedProjects() {
  return (await getReferenceCache<Project[]>(CACHE_KEY)) ?? []
}
