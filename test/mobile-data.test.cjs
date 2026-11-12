const assert = require('node:assert/strict')
const { test } = require('node:test')
const { QueryClient } = require('@tanstack/react-query')
const { loadSource } = require('./helpers/load-source.cjs')

test('downloads every page beyond 500 items and preserves the requested scope', async () => {
  const requests = []
  const { getAllPages } = loadSource('api/pagination.ts', {
    '@/api/client': {
      api: {
        get: async (url, config) => {
          requests.push({ url, config })
          const page = config.params.page
          return {
            data: {
              items: Array.from({ length: page === 7 ? 1 : 100 }, (_, i) => (page - 1) * 100 + i),
              page,
              totalPages: 7,
              hasNextPage: page < 7,
            },
          }
        },
      },
    },
  })
  const result = await getAllPages('/work-orders', {
    params: { contractId: 'contract' },
    headers: { 'X-Selected-Unit-Id': 'unit' },
  })
  assert.equal(result.length, 601)
  assert.equal(result.at(-1), 600)
  assert.equal(requests.length, 7)
  assert.ok(
    requests.every(
      ({ config }) =>
        config.params.contractId === 'contract' && config.headers['X-Selected-Unit-Id'] === 'unit',
    ),
  )
})

test('honors pagination metadata even when the server returns short pages', async () => {
  const { getAllPages } = loadSource('api/pagination.ts', {
    '@/api/client': {
      api: {
        get: async (_url, { params: { page } }) => ({
          data: { items: [page], hasNextPage: page < 3 },
        }),
      },
    },
  })
  assert.deepEqual(await getAllPages('/items'), [1, 2, 3])
  await assert.rejects(getAllPages('/items', {}, 2), /base é muito grande/)
})

test('does not report incomplete or repeated pages as a successful download', async () => {
  for (const reply of [
    (page) => ({ items: [], page, hasNextPage: true }),
    () => ({ items: [1], page: 1, hasNextPage: true }),
  ]) {
    const { getAllPages } = loadSource('api/pagination.ts', {
      '@/api/client': {
        api: { get: async (_url, { params: { page } }) => ({ data: reply(page) }) },
      },
    })
    await assert.rejects(getAllPages('/items'))
  }
})

test('supports unpaginated responses and metadata-free final pages', async () => {
  for (const data of [[{ id: 'one' }], { items: [{ id: 'one' }] }]) {
    const { getAllPages } = loadSource('api/pagination.ts', {
      '@/api/client': { api: { get: async () => ({ data }) } },
    })
    assert.deepEqual(await getAllPages('/items'), [{ id: 'one' }])
  }
})

test('offline forecast filters include overlapping services, like the API', () => {
  const { matchesQueueFilters } = loadSource('utils/queue-filters.ts')
  const item = {
    id: 'service',
    status: 'EM_EXECUCAO',
    type: 'MONTAGEM',
    scaffoldId: 'scaffold',
    workOrderId: 'order',
    startForecast: '2026-09-01T00:00:00Z',
    endForecast: '2026-09-30T00:00:00Z',
  }
  assert.equal(
    matchesQueueFilters(item, { startForecast: '2026-09-10', endForecast: '2026-09-15' }),
    true,
  )
  assert.equal(matchesQueueFilters(item, { startForecast: '2026-09-30' }), true)
  assert.equal(matchesQueueFilters(item, { endForecast: '2026-09-01' }), true)
  assert.equal(matchesQueueFilters(item, { startForecast: '2026-10-01' }), false)
  assert.equal(matchesQueueFilters(item, { endForecast: '2026-08-31' }), false)
  assert.equal(
    matchesQueueFilters({ ...item, endForecast: null }, { startForecast: '2026-09-10' }),
    false,
  )
  for (const filters of [
    { statuses: ['NAO_INICIADO'] },
    { type: 'DESMONTAGEM' },
    { scaffoldId: 'other' },
    { workOrderId: 'other' },
  ]) {
    assert.equal(matchesQueueFilters(item, filters), false)
  }
})

test('updating the base invalidates queue and catalog screens without clearing unrelated state', async () => {
  const { invalidateSyncedQueries } = loadSource('utils/sync-query-cache.ts')
  const client = new QueryClient()
  const prefixes = [
    'execution-queue',
    'my-day',
    'areas',
    'projects',
    'work-orders',
    'scaffold-component-types',
    'execute-employees',
  ]
  for (const prefix of [...prefixes, 'unrelated']) client.setQueryData([prefix, 'contract'], [])
  await invalidateSyncedQueries(client)
  for (const prefix of prefixes)
    assert.equal(client.getQueryState([prefix, 'contract']).isInvalidated, true)
  assert.equal(client.getQueryState(['unrelated', 'contract']).isInvalidated, false)
  client.clear()
})

test('local queued advances and filters work both online and offline', async () => {
  const { matchesQueueFilters } = loadSource('utils/queue-filters.ts')
  for (const isConnected of [true, false]) {
    const local = {
      id: 'local',
      scaffoldId: 'scaffold',
      status: 'NAO_INICIADO',
      plannedQuantity: 10,
      executedQuantity: 0,
      progress: 0,
    }
    const remote = { ...local, id: 'remote' }
    const { useExecutionQueue } = loadSource('hooks/use-execution-queue.ts', {
      '@tanstack/react-query': { useQuery: (options) => options },
      '@/store/auth-store': {
        useAuthStore: (select) => select({ accessToken: 'token', isHydrated: true }),
      },
      '@/store/connectivity-store': { useConnectivityStore: (select) => select({ isConnected }) },
      '@/database/repositories/local-scaffold-service-repository': {
        localScaffoldServiceRepository: { listPendingByScope: async () => [local] },
      },
      '@/database/repositories/outbox-repository': {
        outboxRepository: {
          listPendingExecutionsByServiceId: async () =>
            new Map(
              ['local', 'remote'].map((id) => [id, [{ inputType: 'PERCENTUAL', inputValue: 50 }]]),
            ),
        },
      },
      '@/database/repositories/queue-cache-repository': {
        queueCacheRepository: {
          listByScope: async (_scope, filters) =>
            [remote].filter((item) => matchesQueueFilters(item, filters)),
          replaceForScope: async () => {},
        },
      },
      '@/services/scaffold-services.service': {
        fetchQueueServices: async (_scope, filters) =>
          [remote].filter((item) => matchesQueueFilters(item, filters)),
      },
      '@/utils/local-scaffold': { localServiceToQueueItem: (item) => item },
    })
    const query = useExecutionQueue({ unitId: 'unit', contractId: 'contract' })
    assert.equal(query.queryKey.at(-1), isConnected)
    const expected = [local, remote].map((item) => ({
      ...item,
      executedQuantity: 5,
      progress: 50,
      status: 'EM_EXECUCAO',
    }))
    assert.deepEqual(await query.queryFn(), expected)
    const running = useExecutionQueue(
      { unitId: 'unit', contractId: 'contract' },
      { statuses: ['EM_EXECUCAO'] },
    )
    assert.deepEqual(await running.queryFn(), expected)
    const filtered = useExecutionQueue(
      { unitId: 'unit', contractId: 'contract' },
      { workOrderId: 'other' },
    )
    assert.notDeepEqual(filtered.queryKey, query.queryKey)
    assert.deepEqual(await filtered.queryFn(), [])
  }
})
