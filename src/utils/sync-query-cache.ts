import type { QueryClient } from '@tanstack/react-query'

const SYNCED_QUERIES = new Set([
  'execution-queue',
  'queue-service-detail',
  'latest-scaffold',
  'crews',
  'employees',
  'execute-employees',
  'deviation-employees',
  'execute-work-functions',
  'deviation-work-functions',
  'projects',
  'areas',
  'work-orders',
  'scaffold-types',
  'scaffold-component-types',
  'scaffold-components',
  'deviation-types',
  'inspection-pack',
  'availability-map',
])

export function invalidateSyncedQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries(
    { predicate: (query) => SYNCED_QUERIES.has(String(query.queryKey[0])) },
    { throwOnError: true },
  )
}
