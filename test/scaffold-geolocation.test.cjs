const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadSource } = require('./helpers/load-source.cjs')
const { hookHarness } = require('./helpers/hook-harness.cjs')

const gps = {
  latitude: 0,
  longitude: -46.5,
  method: 'GPS',
  accuracyMeters: 8.5,
  capturedAt: '2026-11-15T10:00:00.000Z',
}
function gpsService(changes = {}) {
  const native = {
    Accuracy: { High: 4 },
    requestForegroundPermissionsAsync: async () => ({ granted: true }),
    hasServicesEnabledAsync: async () => true,
    getCurrentPositionAsync: async () => ({
      coords: { latitude: 0, longitude: -46.5, accuracy: 8.54 },
      timestamp: Date.parse(gps.capturedAt),
    }),
    ...changes,
  }
  return loadSource('services/scaffold-location.service.ts', { 'expo-location': native })
}

test('captures device GPS without a network service and preserves its timestamp and accuracy', async () => {
  assert.deepEqual(await gpsService().captureScaffoldLocation(), gps)
})

test('permission denial and disabled GPS give actionable errors without attempting a fix', async () => {
  const shouldNotRun = async () => {
    throw new Error('unexpected GPS request')
  }
  await assert.rejects(
    gpsService({
      requestForegroundPermissionsAsync: async () => ({ granted: false }),
      getCurrentPositionAsync: shouldNotRun,
    }).captureScaffoldLocation(),
    /Permita/,
  )
  await assert.rejects(
    gpsService({
      hasServicesEnabledAsync: async () => false,
      getCurrentPositionAsync: shouldNotRun,
    }).captureScaffoldLocation(),
    /Ligue o GPS/,
  )
  await assert.rejects(
    gpsService({
      getCurrentPositionAsync: async () => ({
        coords: { latitude: NaN, longitude: 1 },
        timestamp: 0,
      }),
    }).captureScaffoldLocation(),
    /inválida/,
  )
})

test('a GPS request times out without silently using a previous position', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const pending = gpsService({
    getCurrentPositionAsync: () => new Promise(() => {}),
  }).captureScaffoldLocation()
  await Promise.resolve()
  await Promise.resolve()
  const failure = assert.rejects(pending, /GPS não respondeu/)
  t.mock.timers.tick(20_001)
  await failure
})

test('offline serialization and normalization preserve the captured GPS on every retry', () => {
  const { normalizeQueuedExecutionPayload } = loadSource('utils/queued-execution.ts')
  const payload = {
    scaffoldId: 'scaffold',
    entry: { scaffoldServiceId: 'assembly', scaffoldGeolocation: gps },
  }
  const restored = normalizeQueuedExecutionPayload(JSON.parse(JSON.stringify(payload)))
  assert.deepEqual(restored.entry.scaffoldGeolocation, gps)
  assert.deepEqual(normalizeQueuedExecutionPayload(restored).entry.scaffoldGeolocation, gps)
  assert.equal(
    normalizeQueuedExecutionPayload({ scaffoldServiceId: 'legacy' }).entry.scaffoldGeolocation,
    undefined,
  )
})

test('emergency registration sends the GPS from the outbox without recapturing it', async () => {
  let sent
  const { createEmergencyScaffold } = loadSource('services/scaffolds.service.ts', {
    '@/api/client': {
      api: {
        post: async (url, body) => {
          sent = body
          return { data: { id: 'remote' } }
        },
      },
    },
    '@/services/reference-cache.service': {},
    '@/security/offline-owner': {},
  })
  await createEmergencyScaffold({ localId: 'local', geolocation: gps })
  assert.deepEqual(sent.geolocation, gps)
})

function hookTest() {
  const harness = hookHarness()
  // Memoize callbacks as React does, while keeping native services substituted.
  harness.hooks.useCallback = (callback, deps) => {
    const ref = harness.hooks.useRef(null)
    if (!ref.current || deps.some((value, i) => !Object.is(value, ref.current.deps[i])))
      ref.current = { callback, deps }
    return ref.current.callback
  }
  let resolve
  let owner = { id: 'user', tenantId: 'tenant' }
  const { useScaffoldGeolocation } = loadSource('hooks/use-scaffold-geolocation.ts', {
    react: harness.hooks,
    '@/store/auth-store': { useAuthStore: (select) => select({ user: owner }) },
    '@/services/scaffold-location.service': {
      captureScaffoldLocation: () =>
        new Promise((done) => {
          resolve = done
        }),
    },
    '@/security/offline-owner': {
      captureOfflineOwnerContext: () => owner,
      assertOfflineOwnerContext: (initial) => {
        if (initial !== owner) throw new Error('owner changed')
      },
    },
  })
  const Component = ({ scope, known }) => useScaffoldGeolocation(scope, known)
  return {
    render: (scope = 'scope', known) => harness.render(Component, { scope, known }),
    resolve: () => resolve(gps),
    changeOwner: () => {
      owner = { id: 'other', tenantId: 'tenant' }
    },
  }
}

test('a late GPS result cannot cross a contract or user change', async () => {
  for (const changeUser of [false, true]) {
    const hook = hookTest()
    const pending = hook.render().capture()
    assert.equal(hook.render().busy, true)
    if (changeUser) hook.changeOwner()
    const scope = changeUser ? 'scope' : 'other-contract'
    hook.render(scope)
    hook.resolve()
    await pending
    assert.equal(hook.render(scope).value, undefined)
    assert.equal(hook.render(scope).busy, false)
  }
})

test('skip cancels a pending capture; known positions suppress initial GPS payloads', async () => {
  const hook = hookTest()
  const pending = hook.render().capture()
  hook.render().reset()
  hook.resolve()
  await pending
  assert.equal(hook.render().value, undefined)
  hook.render().setDraft(gps)
  assert.deepEqual(hook.render().value, gps)
  assert.equal(hook.render('scope', { latitude: 10, longitude: 20 }).value, undefined)
})
