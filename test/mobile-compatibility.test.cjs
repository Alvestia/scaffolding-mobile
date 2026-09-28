const assert = require('node:assert/strict')
const { test } = require('node:test')
const { AxiosError, CanceledError } = require('axios')
const { loadSource } = require('./helpers/load-source.cjs')

const scope = { contractId: 'contract', unitId: 'unit' }
const service = {
  id: 'remote', scaffoldId: 'scaffold', type: 'MONTAGEM',
  plannedQuantity: 120, plannedUnit: 'M3', quantityVersion: 2,
  executedQuantity: 60, progress: 50, status: 'EM_EXECUCAO',
}
function httpError(status) {
  return new AxiosError('request failed', undefined, undefined, undefined,
    status ? { status, data: {} } : undefined)
}
function ownerMocks() {
  const owner = loadSource('security/offline-owner.ts')
  owner.setOfflineOwner({ id: 'user', tenantId: 'tenant' })
  return { '@/security/offline-owner': owner }
}
function detail({ cached = service, local = null, fetch = async () => service, ...extra } = {}) {
  const reads = [], writes = [], requests = []
  const mocks = {
    ...ownerMocks(),
    '@tanstack/react-query': { useQuery: (options) => options },
    '@/utils/id': { isLocalId: (id) => id.startsWith('local_') },
    '@/utils/local-scaffold': { localServiceToQueueItem: (item) => ({ id: item.localId }) },
    '@/database/repositories/local-scaffold-service-repository': {
      localScaffoldServiceRepository: { getByLocalId: async () => local },
    },
    '@/database/repositories/queue-cache-repository': {
      queueCacheRepository: {
        getByServiceId: async (...args) => { reads.push(args); return cached },
        upsert: async (...args) => writes.push(args),
      },
    },
    '@/services/scaffold-services.service': {
      fetchQueueService: async (...args) => { requests.push(args); return fetch(...args) },
    },
    ...extra,
  }
  const { useQueueServiceDetail: detailQueryOptions } = loadSource('hooks/use-queue-service-detail.ts', mocks)
  const signal = new AbortController().signal
  return {
    reads, writes, requests, mocks, signal,
    run: (id = service.id, selected = scope, online = true) =>
      detailQueryOptions(id, selected, online).queryFn({ signal }),
  }
}

test('detail refreshes a revised/completed service outside the active queue without replacing the scope', async () => {
  const revised = { ...service, status: 'CONCLUIDO', progress: 100, quantityVersion: 3 }
  const setup = detail({ fetch: async () => revised })
  assert.deepEqual(await setup.run(), revised)
  assert.deepEqual(setup.reads, [[service.id, scope]])
  assert.deepEqual(setup.requests, [[service.id, scope, setup.signal]])
  assert.deepEqual(setup.writes, [[revised, scope]])
})

test('a synchronized local service reads the remote basis; a never-sent one stays local', async () => {
  const local = { ...scope, localId: 'local_one', remoteId: 'remote' }
  const setup = detail({ local })
  assert.equal((await setup.run(local.localId)).quantityVersion, 2)
  assert.equal(setup.requests[0][0], 'remote')
  assert.equal((await setup.run(local.localId, scope, false)).id, 'remote')
  const unsent = detail({ local: { ...local, remoteId: null } })
  assert.deepEqual(await unsent.run(local.localId), { id: local.localId })
  assert.equal(unsent.requests.length, 0)
  const uncached = detail({ local, cached: null })
  assert.equal(await uncached.run(local.localId, scope, false), null)
})

test('local service and missing context cannot cross contract/unit boundaries', async () => {
  const setup = detail({ local: { ...scope, localId: 'local_one', remoteId: null } })
  assert.equal(await setup.run('local_one', { ...scope, contractId: 'other' }), null)
  assert.equal(await setup.run('local_one', { ...scope, unitId: 'other' }), null)
  assert.equal(await setup.run(service.id, { ...scope, contractId: null }), null)
  assert.equal(setup.reads.length, 0)
  assert.equal(setup.requests.length, 0)
})

test('denial, deletion and cancellation do not silently revive cached service data', async () => {
  for (const error of [httpError(401), httpError(403), httpError(404), new CanceledError(), new Error('owner changed')]) {
    const setup = detail({ fetch: async () => { throw error } })
    await assert.rejects(setup.run(), (actual) => actual === error)
    assert.equal(setup.writes.length, 0)
  }
})

test('temporary unavailability uses the scoped offline base; no base means an explicit error', async () => {
  for (const status of [undefined, 408, 429, 503]) {
    const error = httpError(status)
    const setup = detail({ fetch: async () => { throw error } })
    assert.equal(await setup.run(), service)
    const empty = detail({ cached: null, fetch: async () => { throw error } })
    await assert.rejects(empty.run(), (actual) => actual === error)
  }
  const offline = detail()
  assert.equal(await offline.run(service.id, scope, false), service)
  assert.equal(offline.requests.length, 0)
})

test('switching identity during detail download cannot publish data into the new owner cache', async () => {
  const owner = ownerMocks()
  const setup = detail({ ...owner, fetch: async () => {
    owner['@/security/offline-owner'].setOfflineOwner({ id: 'other', tenantId: 'tenant' })
    return service
  } })
  await assert.rejects(setup.run(), /identidade ativa mudou/)
  assert.equal(setup.writes.length, 0)
})

test('detail request sends captured context and cancellation, and omits execution/audit history', async () => {
  let request
  const { fetchQueueService } = loadSource('services/scaffold-services.service.ts', {
    '@/api/client': { api: { get: async (...args) => {
      request = args
      return { data: { ...service, executionEntries: ['private'], revisions: ['history'] } }
    } } },
    '@/api/pagination': {},
  })
  const signal = new AbortController().signal
  const result = await fetchQueueService(service.id, scope, signal)
  assert.equal(result.quantityVersion, 2)
  assert.equal(Object.hasOwn(result, 'executionEntries'), false)
  assert.equal(Object.hasOwn(result, 'revisions'), false)
  assert.equal(request[0], '/scaffold-services/remote')
  assert.equal(request[1].signal, signal)
  assert.equal(request[1].skipOrgScope, true)
  assert.deepEqual(request[1].headers, {
    'X-Selected-Unit-Id': 'unit', 'X-Selected-Contract-Id': 'contract',
  })
})

test('individual cache updates preserve other services, and lookup requires matching scope', async () => {
  let rows = []
  const { queueCacheRepository: repo } = loadSource('database/repositories/queue-cache-repository.ts', {
    ...ownerMocks(),
    'react-native': { Platform: { OS: 'web' } },
    '@/database/client': {},
    '@/database/web-storage': {
      loadWebRows: async () => rows,
      saveWebRows: async (_key, value) => { rows = value },
    },
  })
  await repo.upsert(service, scope)
  await repo.upsert({ ...service, id: 'neighbor' }, scope)
  await repo.upsert({ ...service, id: 'other' }, { ...scope, contractId: 'other' })
  await repo.upsert({ ...service, quantityVersion: 3 }, scope)
  assert.equal(rows.length, 3)
  assert.equal((await repo.getByServiceId(service.id, scope)).quantityVersion, 3)
  assert.equal(await repo.getByServiceId(service.id, { ...scope, contractId: 'other' }), null)
  assert.equal(await repo.getByServiceId(service.id, { ...scope, unitId: 'other' }), null)
  assert.equal((await repo.listByScope(scope)).length, 2)
})

test('native cache lookup restricts tenant, user, contract and unit', async () => {
  let read
  const { queueCacheRepository: repo } = loadSource('database/repositories/queue-cache-repository.ts', {
    ...ownerMocks(),
    'react-native': { Platform: { OS: 'android' } },
    '@/database/client': { withNativeDatabaseLock: async (fn) => fn({
      getFirstAsync: async (...args) => { read = args; return null },
    }) },
    '@/database/web-storage': {},
  })
  assert.equal(await repo.getByServiceId(service.id, scope), null)
  assert.match(read[0], /owner_tenant_id = \? AND owner_user_id = \? AND service_id = \?/)
  assert.match(read[0], /contract_id = \? AND unit_id = \?/)
  assert.deepEqual(read[1], ['tenant', 'user', 'remote', 'contract', 'unit'])
})

function queue(pending, { online = true, item = service, failure } = {}) {
  const { useExecutionQueue: queueQueryOptions } = loadSource('hooks/use-execution-queue.ts', {
    '@tanstack/react-query': { useQuery: (options) => options },
    '@/store/auth-store': { useAuthStore: (fn) => fn({ accessToken: 'token', isHydrated: true }) },
    '@/store/connectivity-store': { useConnectivityStore: (fn) => fn({ isConnected: online }) },
    '@/database/repositories/local-scaffold-service-repository': {
      localScaffoldServiceRepository: { listPendingByScope: async () => [] },
    },
    '@/database/repositories/outbox-repository': {
      outboxRepository: { listPendingExecutionsByServiceId: async () => new Map([[item.id, pending]]) },
    },
    '@/database/repositories/queue-cache-repository': {
      queueCacheRepository: { listByScope: async () => [item], replaceForScope: async () => {} },
    },
    '@/services/scaffold-services.service': { fetchQueueServices: async () => {
      if (failure) throw failure
      return [item]
    } },
    '@/utils/local-scaffold': { localServiceToQueueItem: (item) => item },
  })
  return queueQueryOptions(scope).queryFn()
}

test('stale offline percentages cannot inflate revised totals or hide the service', async () => {
  for (const online of [true, false]) {
    const stale = { inputType: 'PERCENTUAL', inputValue: 100, expectedBasisVersion: 1,
      basisSnapshot: { version: 1, quantity: 60, unit: 'M3' } }
    const legacy = { inputType: 'PERCENTUAL', inputValue: 100 }
    assert.deepEqual(await queue([stale, legacy], { online }), [service])
    const current = { inputType: 'PERCENTUAL', inputValue: 25, expectedBasisVersion: 2,
      basisSnapshot: { version: 2, quantity: 120, unit: 'M3' } }
    assert.deepEqual(await queue([stale, current], { online }), [{ ...service, executedQuantity: 90, progress: 75 }])
    assert.deepEqual(await queue([{ ...current, inputValue: 50 }], { online }), [])
    const original = { ...service, quantityVersion: 0 }
    assert.deepEqual(await queue([{ inputType: 'QUANTIDADE', inputValue: 30 }], { online, item: original }),
      [{ ...original, executedQuantity: 90, progress: 75 }])
  }
})

test('known quantity/unit changes require review even if the version is unchanged', () => {
  const { matchesExecutionBasis } = loadSource('utils/execution-basis.ts')
  assert.equal(matchesExecutionBasis(service, { version: 2, quantity: 120, unit: 'M3' }), true)
  assert.equal(matchesExecutionBasis(service, { version: 2, quantity: 60, unit: 'M3' }), false)
  assert.equal(matchesExecutionBasis(service, { version: 2, quantity: 120, unit: 'M2' }), false)
  assert.equal(matchesExecutionBasis(service, { version: 1, quantity: 120, unit: 'M3' }), false)
})

test('queue fallback tolerates a temporary outage but does not hide permission errors', async () => {
  await assert.rejects(queue([], { failure: httpError(403) }))
  assert.deepEqual(await queue([], { failure: httpError(503) }), [service])
})

test('outbox totals exclude accepted entries with pending photos and unresolved conflicts', async () => {
  const { outboxRepository: repo } = loadSource('database/repositories/outbox-repository.ts', {
    ...ownerMocks(),
    'react-native': { Platform: { OS: 'web' } },
    '@/database/client': {}, '@/database/web-storage': {},
    '@/services/offline-crypto.service': {},
  })
  const basisSnapshot = { version: 2, quantity: 120, unit: 'M3' }
  const entry = { scaffoldServiceId: 'remote', inputType: 'QUANTIDADE', inputValue: 10, expectedBasisVersion: 2 }
  const item = { ...scope, entityType: 'execution_entry', syncStatus: 'pending', payload: { entry, basisSnapshot } }
  const rows = [item, { ...item, syncStatus: 'failed' }, { ...item, syncStatus: 'syncing' },
    { ...item, remoteId: 'already-accepted' }, { ...item, syncStatus: 'conflict' },
    { ...item, syncStatus: 'dead_letter' }, { ...item, syncStatus: 'synced' },
    { ...item, contractId: 'other' }, { ...item, unitId: 'other' }, { ...item, entityType: 'emergency_scaffold' }]
  repo.listAll = async () => rows
  const original = structuredClone(rows)
  const map = await repo.listPendingExecutionsByServiceId(scope)
  assert.equal(map.size, 1)
  assert.equal(map.get('remote').length, 3)
  assert.deepEqual(map.get('remote')[0], { inputType: 'QUANTIDADE', inputValue: 10, expectedBasisVersion: 2, basisSnapshot })
  assert.deepEqual(rows, original, 'drafts and their evidence must stay untouched')
})

test('the sync engine preserves the draft and requires manual review after a basis conflict', async () => {
  const item = {
    localId: 'draft', idempotencyKey: 'draft', ...scope, entityType: 'execution_entry',
    syncStatus: 'syncing', retryCount: 0,
    payload: { basisSnapshot: { version: 1, quantity: 60, unit: 'M3' },
      entry: { scaffoldServiceId: 'remote', inputType: 'PERCENTUAL', inputValue: 100, expectedBasisVersion: 1 },
      evidences: [{ id: 'photo', uri: 'local-photo' }] },
  }
  let submitted, statusUpdate
  let removed = false
  const mocks = {
    ...ownerMocks(),
    '@/utils/id': { createLocalId: () => 'lease', isLocalId: () => false },
    '@/database/repositories/outbox-repository': { outboxRepository: {
      claimReady: async () => [item],
      updateStatus: async (...args) => { statusUpdate = args },
      remove: async () => { removed = true },
    } },
    '@/database/repositories/queue-cache-repository': {},
    '@/database/repositories/local-scaffold-service-repository': {},
    '@/database/repositories/sync-state-repository': { syncStateRepository: { set: async () => {} } },
    '@/services/execution-entries.service': { createExecutionEntry: async (...args) => {
      submitted = args
      const error = httpError(409)
      error.response.data = { code: 'EXECUTION_BASIS_CHANGED', message: 'A base foi revisada.' }
      throw error
    } },
  }
  for (const name of ['crews', 'execution-media', 'deviation-media', 'operational-deviations',
    'scaffold-measurement-adjustments', 'scaffold-services', 'scaffolds']) {
    mocks[`@/services/${name}.service`] = {}
  }
  const original = structuredClone(item)
  const { runFullSync } = loadSource('sync/sync-engine.ts', mocks)
  await runFullSync(scope, { includeQueue: false })
  assert.equal(submitted[0].expectedBasisVersion, 1)
  assert.equal(submitted[1], 'draft')
  assert.equal(statusUpdate[0], 'draft')
  assert.equal(statusUpdate[1], 'conflict')
  assert.equal(statusUpdate[2].nextAttemptAt, null)
  assert.equal(statusUpdate[2].lastErrorCode, 'EXECUTION_BASIS_CHANGED')
  assert.equal(removed, false)
  assert.deepEqual(item, original)
})
