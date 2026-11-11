const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadSource } = require('./helpers/load-source.cjs')

function deferred() {
  let resolve, reject
  const promise = new Promise((ok, fail) => {
    resolve = ok
    reject = fail
  })
  return { promise, resolve, reject }
}

test('automatic and repeated manual triggers cannot overlap an active manual sync', async () => {
  const gate = deferred()
  let automaticRuns = 0,
    manualRuns = 0
  const { useSyncStore } = loadSource('store/sync-store.ts', {
    '@/database/repositories/outbox-repository': { outboxRepository: { listAll: async () => [] } },
    '@/database/repositories/sync-state-repository': {
      syncStateRepository: { get: async () => '2026-09-14' },
    },
    '@/services/execution-media.service': {},
    '@/services/deviation-media.service': {},
    '@/services/inspections.service': {},
    '@/services/manual-sync.service': {
      runManualSync: async () => {
        manualRuns++
        await gate.promise
      },
    },
    '@/sync/sync-engine': {
      runFullSync: async () => {
        automaticRuns++
      },
    },
  })
  const scope = { unitId: 'unit', contractId: 'contract' }
  const pending = useSyncStore.getState().runManualSyncNow(scope)
  assert.equal(useSyncStore.getState().isSyncing, true)
  await useSyncStore.getState().runSyncNow(scope)
  assert.equal(useSyncStore.getState().isSyncing, true)
  assert.equal(automaticRuns, 0)
  await assert.rejects(useSyncStore.getState().runManualSyncNow(scope), /Aguarde/)
  assert.equal(manualRuns, 1)
  gate.resolve()
  await pending
  assert.equal(useSyncStore.getState().isSyncing, false)
  await useSyncStore.getState().runSyncNow(scope)
  assert.equal(automaticRuns, 1)
})

test('failed manual sync releases the lock and can be retried', async () => {
  let fail = true
  const { useSyncStore } = loadSource('store/sync-store.ts', {
    '@/database/repositories/outbox-repository': { outboxRepository: { listAll: async () => [] } },
    '@/database/repositories/sync-state-repository': {
      syncStateRepository: { get: async () => null },
    },
    '@/services/execution-media.service': {},
    '@/services/deviation-media.service': {},
    '@/services/inspections.service': {},
    '@/services/manual-sync.service': {
      runManualSync: async () => {
        if (fail) throw new Error('rede indisponível')
      },
    },
    '@/sync/sync-engine': { runFullSync: async () => {} },
  })
  const scope = { unitId: 'unit', contractId: 'contract' }
  await assert.rejects(useSyncStore.getState().runManualSyncNow(scope))
  assert.equal(useSyncStore.getState().isSyncing, false)
  assert.equal(useSyncStore.getState().lastError, 'rede indisponível')
  fail = false
  await useSyncStore.getState().runManualSyncNow(scope)
  assert.equal(useSyncStore.getState().lastError, null)
})

function manualDependencies(overrides = {}) {
  const calls = []
  const mocks = {
    '@/database/repositories/queue-cache-repository': {
      queueCacheRepository: { replaceForScope: async () => {} },
    },
    '@/database/repositories/sync-state-repository': {
      syncStateRepository: {
        set: async () => {
          calls.push('lastSyncAt')
        },
      },
    },
    '@/sync/sync-engine': { runFullSync: async () => {} },
  }
  for (const [module, name] of [
    ['areas', 'fetchAreas'],
    ['crews', 'fetchCrews'],
    ['deviation-types', 'fetchDeviationTypes'],
    ['employees', 'fetchEmployees'],
    ['projects', 'fetchProjects'],
    ['scaffold-services', 'fetchQueueServices'],
    ['scaffold-types', 'fetchScaffoldTypes'],
    ['scaffold-component-types', 'fetchScaffoldComponentTypes'],
    ['scaffolds', 'fetchLatestScaffold'],
    ['work-orders', 'fetchWorkOrders'],
    ['work-functions', 'fetchWorkFunctions'],
  ])
    mocks[`@/services/${module}.service`] = {
      [name]: async () => {
        calls.push(name)
        return []
      },
    }
  return { calls, mocks: { ...mocks, ...overrides } }
}

test('manual base update includes component types and completes every progress step', async () => {
  const { calls, mocks } = manualDependencies()
  const { runManualSync } = loadSource('services/manual-sync.service.ts', mocks)
  let steps
  await runManualSync({ unitId: 'unit', contractId: 'contract' }, (value) => {
    steps = value
  })
  assert.ok(calls.includes('fetchScaffoldComponentTypes'))
  assert.ok(steps.every((step) => step.status === 'done' && step.progress === 100))
  assert.equal(calls.at(-1), 'lastSyncAt')
})

test('a failed catalog waits for remaining requests before releasing the update', async () => {
  const started = deferred(),
    remaining = deferred()
  const { mocks, calls } = manualDependencies({
    '@/services/work-orders.service': {
      fetchWorkOrders: async () => {
        started.resolve()
        throw new Error('Falha nas OS')
      },
    },
    '@/services/areas.service': { fetchAreas: () => remaining.promise },
  })
  const { runManualSync } = loadSource('services/manual-sync.service.ts', mocks)
  let finished = false,
    steps
  const pending = runManualSync({ unitId: 'unit', contractId: 'contract' }, (value) => {
    steps = value
  })
  const checked = assert.rejects(pending, /Falha nas OS/).then(() => {
    finished = true
  })
  await started.promise
  await Promise.resolve()
  assert.equal(finished, false)
  remaining.resolve([])
  await checked
  assert.equal(steps.find((step) => step.key === 'catalogs').status, 'error')
  assert.equal(calls.includes('lastSyncAt'), false)
})
