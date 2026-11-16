const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadSource } = require('./helpers/load-source.cjs')
const { hookHarness } = require('./helpers/hook-harness.cjs')

const flush = () => new Promise((resolve) => setImmediate(resolve))
function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function owner() {
  const value = loadSource('security/offline-owner.ts')
  value.setOfflineOwner({ id: 'user', tenantId: 'tenant' })
  return value
}
function cryptoSetup(overrides = {}) {
  const values = new Map()
  const identity = owner()
  let writes = 0
  const secure = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      writes++
      await flush()
      values.set(key, value)
    },
    ...overrides,
  }
  const crypto = loadSource('services/offline-crypto.service.ts', {
    'react-native-get-random-values': {},
    'react-native': { Platform: { OS: 'android' } },
    'expo-secure-store': secure,
    '@react-native-async-storage/async-storage': {
      getItem: () => assert.fail('Native keys must never use AsyncStorage'),
      setItem: () => assert.fail('Native keys must never use AsyncStorage'),
    },
    '@/security/offline-owner': identity,
  })
  return { crypto, values, identity, writes: () => writes }
}

test('release API transport rejects HTTP, credentials, query strings and unlimited timeouts', () => {
  const { validateApiUrl, validateRequestTimeout } = loadSource('utils/api-config.ts')
  for (const url of [
    'http://api.example.com',
    'https://user:pass@api.example.com',
    'https://api.example.com?secret=x',
    'https://api.example.com#secret',
    'file:///tmp/data',
  ]) {
    assert.throws(() => validateApiUrl(url, false))
  }
  assert.equal(validateApiUrl('https://api.example.com/', false), 'https://api.example.com')
  assert.equal(validateApiUrl('http://10.0.2.2:3089', true), 'http://10.0.2.2:3089')
  for (const timeout of ['', '0', '-1', 'Infinity', 'no', '300001']) {
    assert.throws(() => validateRequestTimeout(timeout, 30000))
  }
  assert.equal(validateRequestTimeout(undefined, 30000), 30000)
})

test('concurrent first saves use one persisted AES key and every payload remains readable', async () => {
  const setup = cryptoSetup()
  const payloads = await Promise.all(
    Array.from({ length: 12 }, (_, id) => setup.crypto.encryptOfflinePayload({ id })),
  )
  assert.equal(setup.writes(), 1)
  assert.equal(new Set(payloads.map((value) => value.split(':')[2])).size, 12)
  for (const [id, payload] of payloads.entries()) {
    assert.deepEqual(await setup.crypto.decryptOfflinePayload(payload), { id })
  }
  const payload = payloads[0]
  await assert.rejects(
    setup.crypto.decryptOfflinePayload(
      payload.slice(0, -2) + (payload.endsWith('00') ? 'ff' : '00'),
    ),
  )
})

test('missing decryption keys are never replaced and native secure storage fails closed', async () => {
  const setup = cryptoSetup()
  const encrypted = await setup.crypto.encryptOfflinePayload({ id: 1 })
  setup.values.clear()
  await assert.rejects(setup.crypto.decryptOfflinePayload(encrypted), /chave.*não está disponível/)
  assert.equal(setup.writes(), 1)
  const broken = cryptoSetup({ getItemAsync: undefined })
  await assert.rejects(broken.crypto.encryptOfflinePayload({ id: 2 }), /seguro indisponível/)
  const session = loadSource('services/session-storage.ts', {
    'react-native': { Platform: { OS: 'android' } },
    'expo-secure-store': {},
    '@react-native-async-storage/async-storage': {
      getItem: async () => null,
      setItem: async (key) => assert.ok(!/token|credential_v1/.test(key)),
    },
  })
  await assert.rejects(
    session.persistSession({ accessToken: 'test-access', user: {} }),
    /seguro indisponível/,
  )
})

test('identity changes while loading a key cannot encrypt under the previous owner', async () => {
  const gate = deferred()
  const setup = cryptoSetup({ getItemAsync: () => gate.promise })
  const pending = setup.crypto.encryptOfflinePayload({ sensitive: true })
  setup.identity.setOfflineOwner({ id: 'another-user', tenantId: 'tenant' })
  gate.resolve('a'.repeat(64))
  await assert.rejects(pending, /identidade ativa mudou/)
})

test('database or session bootstrap failure has a retry path without erasing data', async () => {
  for (const stage of ['database', 'session']) {
    const harness = hookHarness()
    let failing = true,
      initialized = 0,
      hydrated = 0
    const state = {
      isHydrated: false,
      hydrate: async () => {
        hydrated++
        if (stage === 'session' && failing) throw new Error('SecureStore unavailable')
        state.isHydrated = true
      },
    }
    const { useAppBootstrap } = loadSource('hooks/use-app-bootstrap.ts', {
      react: harness.hooks,
      '@/database/migrations': {
        initializeDatabase: async () => {
          initialized++
          if (stage === 'database' && failing) throw new Error('SQLite unavailable')
        },
      },
      '@/store/auth-store': { useAuthStore: (selector) => selector(state) },
    })
    harness.render(useAppBootstrap)
    await flush()
    const failed = harness.render(useAppBootstrap)
    assert.equal(failed.isReady, false)
    assert.match(failed.error, /preservados/)
    assert.equal(failed.canResetSession, stage === 'session')
    if (stage === 'database') assert.equal(hydrated, 0)
    failing = false
    failed.retry()
    harness.render(useAppBootstrap)
    await flush()
    assert.equal(harness.render(useAppBootstrap).isReady, true)
    assert.equal(initialized, 2)
  }
})

test('native database opening retries after failure instead of caching a rejected promise', async () => {
  let opens = 0
  const database = { execAsync: async () => {} }
  const client = loadSource('database/client.ts', {
    'react-native': { Platform: { OS: 'android' } },
    'expo-sqlite': {
      openDatabaseAsync: async () => {
        if (++opens === 1) throw new Error('busy')
        return database
      },
    },
  })
  await assert.rejects(client.getDatabase(), (error) => error.cause?.message === 'busy')
  assert.equal(await client.getDatabase(), database)
  assert.equal(opens, 2)
})

function authSetup() {
  const identity = owner(),
    gate = deferred(),
    writes = []
  const context = { activateOwner: () => {}, clearOwner: () => {} }
  const { useAuthStore } = loadSource('store/auth-store.ts', {
    '@/security/offline-owner': identity,
    '@/services/biometric-auth.service': {},
    '@/services/session-storage': {
      getActiveDeviceCredential: () => 'test-device',
      persistSession: async (session) => writes.push(session),
      clearPersistedSession: async () => {},
    },
    '@/services/device-session.service': { refreshDeviceSession: () => gate.promise },
    '@/store/operational-context-store': {
      useOperationalContextStore: {
        persist: { rehydrate: async () => {} },
        getState: () => context,
      },
    },
  })
  return { identity, gate, writes, store: useAuthStore }
}

test('late session refresh cannot restore a logged-out account or replace another identity', async () => {
  for (const change of ['logout', 'switch']) {
    const setup = authSetup()
    setup.store.setState({ accessToken: 'old', user: { id: 'user', tenantId: 'tenant' } })
    const pending = setup.store.getState().renewDeviceSession()
    if (change === 'logout') await setup.store.getState().clearSession()
    else {
      setup.identity.setOfflineOwner({ id: 'new', tenantId: 'tenant' })
      setup.store.setState({ accessToken: 'new-token', user: { id: 'new', tenantId: 'tenant' } })
    }
    setup.gate.resolve({ accessToken: 'renewed-old', user: { id: 'user', tenantId: 'tenant' } })
    await assert.rejects(pending, /identidade ativa mudou/)
    assert.equal(setup.writes.length, 0)
    assert.equal(setup.store.getState().accessToken, change === 'logout' ? null : 'new-token')
  }
})

test('refresh refuses a server response for an unexpected user', async () => {
  const setup = authSetup()
  const pending = setup.store.getState().renewDeviceSession()
  setup.gate.resolve({ accessToken: 'unexpected', user: { id: 'other', tenantId: 'tenant' } })
  await assert.rejects(pending, /identidade diferente/)
  assert.equal(setup.writes.length, 0)
})

test('media validation rejects formats and sizes the upload API refuses', () => {
  const { validateEvidenceAsset } = loadSource('utils/evidence-validation.ts')
  assert.throws(() => validateEvidenceAsset({ mimeType: 'image/heic', base64: 'YQ==' }), /JPEG/)
  assert.throws(
    () =>
      validateEvidenceAsset({
        mimeType: 'image/jpeg',
        fileSize: 50 * 1024 * 1024 + 1,
        base64: 'YQ==',
      }),
    /50 MB/,
  )
  assert.throws(() => validateEvidenceAsset({ mimeType: 'image/jpeg' }), /ler a foto/)
  assert.doesNotThrow(() => validateEvidenceAsset({ mimeType: 'image/jpeg', base64: 'YQ==' }))
})

test('catalogs propagate denied/deleted resources but still fall back during server outages', async () => {
  const { AxiosError } = require('axios')
  const entries = [
    ['areas', 'useAreas', 'fetchAreas', 'getCachedAreas'],
    ['crews', 'useCrews', 'fetchCrews', 'getCachedCrews'],
    ['deviation-types', 'useDeviationTypes', 'fetchDeviationTypes', 'getCachedDeviationTypes'],
    ['projects', 'useProjects', 'fetchProjects', 'getCachedProjects'],
    [
      'scaffold-component-types',
      'useScaffoldComponentTypes',
      'fetchScaffoldComponentTypes',
      'getCachedScaffoldComponentTypes',
    ],
    [
      'scaffold-components',
      'useScaffoldComponents',
      'fetchScaffoldComponents',
      'getCachedScaffoldComponents',
    ],
    ['scaffold-types', 'useScaffoldTypes', 'fetchScaffoldTypes', 'getCachedScaffoldTypes'],
    ['work-orders', 'useWorkOrders', 'fetchWorkOrders', 'getCachedWorkOrders'],
  ]
  for (const [module, hook, fetch, cached] of entries) {
    let status = 403,
      cacheReads = 0
    const hooks = loadSource(`hooks/use-${module}.ts`, {
      '@tanstack/react-query': { useQuery: (options) => options },
      '@/store/auth-store': {
        useAuthStore: (selector) => selector({ accessToken: 'test', isHydrated: true }),
      },
      '@/store/connectivity-store': {
        useConnectivityStore: (selector) => selector({ isConnected: true }),
      },
      '@/store/operational-context-store': {
        useOperationalContextStore: (selector) =>
          selector({ contractId: 'contract', unitId: 'unit' }),
      },
      '@/utils/id': { isLocalId: () => false },
      [`@/services/${module}.service`]: {
        [fetch]: async () => {
          throw new AxiosError('failure', undefined, undefined, undefined, { status, data: {} })
        },
        [cached]: async () => {
          cacheReads++
          return [{ id: 'cached' }]
        },
      },
    })
    const filters = {
      contractId: 'contract',
      unitId: 'unit',
      scaffoldId: 'scaffold',
      operationType: 'MONTAGEM',
    }
    const options = hooks[hook](filters)
    for (status of [401, 403, 404]) await assert.rejects(options.queryFn(), undefined, module)
    assert.equal(cacheReads, 0, module)
    status = 503
    assert.deepEqual(await options.queryFn(), [{ id: 'cached' }], module)
  }
})

test('external links reject malformed percent encodings before reaching the router decoder', () => {
  const { redirectSystemPath } = loadSource('app/+native-intent.tsx')
  for (const path of [
    'scaffoldingmobile:///?q=' + '%E0%A4'.repeat(100),
    'scaffoldingmobile:///?q=%ZZ',
    'scaffoldingmobile:///' + 'x'.repeat(2048),
    'scaffoldingmobile:///\nqueue',
  ]) {
    assert.equal(redirectSystemPath({ path, initial: true }), '/')
    assert.equal(redirectSystemPath({ path, initial: false }), '/')
  }
  const path = 'scaffoldingmobile:///queue/service-1?name=Jo%C3%A3o'
  assert.equal(redirectSystemPath({ path, initial: true }), path)
})

test('logout removes credentials even if a previous persistence write is still pending', async () => {
  const gate = deferred(),
    started = deferred(),
    values = new Map()
  const session = loadSource('services/session-storage.ts', {
    'react-native': { Platform: { OS: 'android' } },
    'expo-secure-store': {
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => {
        if (key.includes('access_token')) {
          started.resolve()
          await gate.promise
        }
        values.set(key, value)
      },
      deleteItemAsync: async (key) => {
        values.delete(key)
      },
    },
    '@react-native-async-storage/async-storage': {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => {
        values.set(key, value)
      },
      removeItem: async (key) => {
        values.delete(key)
      },
    },
  })
  const writing = session.persistSession({ accessToken: 'test-token', user: { id: 'user' } })
  await started.promise
  const logout = session.clearPersistedSession()
  gate.resolve()
  await Promise.all([writing, logout])
  assert.equal(await session.loadPersistedSession(), null)
  assert.equal(values.size, 0)
})

function apiSetup() {
  const identity = owner(),
    gate = deferred()
  let renewals = 0,
    clears = 0,
    requests = 0
  const auth = {
    accessToken: 'old-token',
    renewDeviceSession: async () => {
      renewals++
      return gate.promise
    },
    clearSession: async () => {
      clears++
    },
  }
  const { api } = loadSource('api/client.ts', {
    '@/utils/env': { env: { apiUrl: 'https://api.example.com', requestTimeoutMs: 30000 } },
    '@/security/offline-owner': identity,
    '@/store/auth-store': { useAuthStore: { getState: () => auth } },
    '@/store/connectivity-store': {
      useConnectivityStore: { getState: () => ({ setApiReachable: () => {} }) },
    },
    '@/store/operational-context-store': {
      useOperationalContextStore: {
        getState: () => ({ unitId: 'unit', contractId: 'contract', reset: () => {} }),
      },
    },
    '@/services/device-session.service': {
      isDeviceCredentialRejected: (error) => error?.response?.status === 401,
    },
  })
  const { AxiosError } = require('axios')
  api.defaults.adapter = async (config) => {
    requests++
    if (!config._authRetry)
      throw new AxiosError('expired', undefined, config, undefined, {
        status: 401,
        config,
        data: {},
      })
    return { data: 'ok', status: 200, config }
  }
  return { api, identity, gate, auth, counts: () => ({ renewals, clears, requests }) }
}

test('simultaneous HTTP 401 responses share a single refresh for the active account', async () => {
  const setup = apiSetup()
  const first = setup.api.get('/a'),
    second = setup.api.get('/b')
  await flush()
  assert.equal(setup.counts().renewals, 1)
  setup.auth.accessToken = 'new-token'
  setup.gate.resolve({ accessToken: 'new-token' })
  assert.deepEqual(
    (await Promise.all([first, second])).map((response) => response.data),
    ['ok', 'ok'],
  )
  assert.equal(setup.counts().clears, 0)
})

test('HTTP refresh completion after an account switch cannot replay a request or clear the new account', async () => {
  for (const session of [null, { accessToken: 'old-renewed' }]) {
    const setup = apiSetup()
    const pending = setup.api.get('/a')
    await flush()
    setup.identity.setOfflineOwner({ id: 'other', tenantId: 'tenant' })
    setup.auth.accessToken = 'other-token'
    setup.gate.resolve(session)
    await assert.rejects(pending, /identidade ativa mudou/)
    assert.equal(setup.counts().requests, 1)
    assert.equal(setup.counts().clears, 0)
  }
})

test('a saved session that cannot be read can be discarded to reach the login screen', async () => {
  const harness = hookHarness()
  let failing = true,
    cleared = 0
  const state = {
    isHydrated: false,
    hydrate: async () => {
      if (failing) throw new Error('SecureStore decrypt failed')
      state.isHydrated = true
    },
    clearSession: async () => {
      cleared++
      failing = false
    },
  }
  const { useAppBootstrap } = loadSource('hooks/use-app-bootstrap.ts', {
    react: harness.hooks,
    '@/database/migrations': { initializeDatabase: async () => {} },
    '@/store/auth-store': { useAuthStore: (selector) => selector(state) },
  })
  harness.render(useAppBootstrap)
  await flush()
  await harness.render(useAppBootstrap).resetSession()
  harness.render(useAppBootstrap)
  await flush()
  assert.equal(harness.render(useAppBootstrap).isReady, true)
  assert.equal(cleared, 1)
})

test('only HTTP 401 from refresh revokes the device session; proxy 403 and outages keep it', () => {
  const { AxiosError } = require('axios')
  const { isDeviceCredentialRejected } = loadSource('services/device-session.service.ts', {
    '@/utils/env': { env: { apiUrl: 'https://api.example.com', requestTimeoutMs: 30000 } },
    '@/services/device-identity.service': {},
  })
  const failure = (status) =>
    new AxiosError('failure', undefined, undefined, undefined, { status, data: {} })
  assert.equal(isDeviceCredentialRejected(failure(401)), true)
  for (const status of [403, 429, 502, 503]) {
    assert.equal(isDeviceCredentialRejected(failure(status)), false, String(status))
  }
  assert.equal(isDeviceCredentialRejected(new AxiosError('offline')), false)
})

test('a session not kept on the device ends after one shift; a kept session does not', async () => {
  const realNow = Date.now
  let now = Date.parse('2026-10-29T19:00:00Z')
  Date.now = () => now
  try {
    const values = new Map(),
      writes = []
    const write = async (key, value) => {
      writes.push(key)
      values.set(key, value)
    }
    const remove = async (key) => {
      values.delete(key)
    }
    const session = loadSource('services/session-storage.ts', {
      'react-native': { Platform: { OS: 'android' } },
      'expo-secure-store': {
        getItemAsync: async (key) => values.get(key) ?? null,
        setItemAsync: write,
        deleteItemAsync: remove,
      },
      '@react-native-async-storage/async-storage': {
        getItem: async (key) => values.get(key) ?? null,
        setItem: write,
        removeItem: remove,
      },
    })
    const login = {
      accessToken: 'test-token',
      user: { id: 'user' },
      deviceCredential: 'test-device',
    }
    const hours = (value) => value * 60 * 60 * 1000

    assert.equal(await session.loadKeepSignedInPreference(), true)
    await session.persistSession(login, { keepSignedIn: false })
    const expiryWrite = writes.findIndex((key) => key.includes('expires_at'))
    assert.ok(
      expiryWrite >= 0 && expiryWrite < writes.findIndex((key) => /token|credential_v1/.test(key)),
    )
    now += hours(11)
    assert.equal(await session.isPersistedSessionExpired(), false)
    // A renovação do access token não estende o turno.
    await session.persistSession({ accessToken: 'renewed', user: { id: 'user' } })
    now += hours(1)
    assert.equal(await session.isPersistedSessionExpired(), true)

    await session.clearPersistedSession()
    assert.equal(await session.isPersistedSessionExpired(), false)
    assert.equal(await session.loadKeepSignedInPreference(), false)

    await session.persistSession(login, { keepSignedIn: true })
    now += hours(24 * 179)
    assert.equal(await session.isPersistedSessionExpired(), false)
    assert.equal((await session.loadPersistedSession()).accessToken, 'test-token')

    values.set('scaffold_mobile_session_expires_at_v1', 'unreadable')
    assert.equal(await session.isPersistedSessionExpired(), true)
  } finally {
    Date.now = realNow
  }
})

function expirySetup({ expired, persisted = null }) {
  const identity = loadSource('security/offline-owner.ts'),
    revoked = [],
    state = { expired, cleared: 0 }
  const context = { activateOwner: () => {}, clearOwner: () => {} }
  const { useAuthStore } = loadSource('store/auth-store.ts', {
    '@/security/offline-owner': identity,
    '@/services/biometric-auth.service': {},
    '@/services/session-storage': {
      isPersistedSessionExpired: async () => state.expired,
      getActiveDeviceCredential: () => null,
      loadRegularDeviceCredential: async () => 'test-device',
      clearPersistedSession: async () => {
        state.cleared++
        state.expired = false
        persisted = null
      },
      isBiometricLoginEnabled: async () => false,
      loadPersistedSession: async () => persisted,
    },
    '@/services/device-session.service': {
      revokeDeviceSession: async (credential) => revoked.push(credential),
    },
    '@/store/operational-context-store': {
      useOperationalContextStore: {
        persist: { rehydrate: async () => {} },
        getState: () => context,
      },
    },
  })
  return { store: useAuthStore, identity, revoked, state }
}

test('startup revokes and clears an expired shift session and tells the login screen why', async () => {
  const user = { id: 'user', tenantId: 'tenant' }
  const setup = expirySetup({ expired: true, persisted: { accessToken: 'old', user } })
  await setup.store.getState().hydrate()
  assert.deepEqual(setup.revoked, ['test-device'])
  assert.equal(setup.state.cleared, 1)
  assert.equal(setup.identity.getOfflineOwner(), null)
  const auth = setup.store.getState()
  assert.equal(auth.user, null)
  assert.equal(auth.sessionExpired, true)
  assert.equal(auth.isHydrated, true)

  setup.state.expired = true
  assert.equal(await setup.store.getState().unlockWithBiometrics(), null)
  assert.equal(setup.state.cleared, 2)
})

test('startup restores a kept session without asking for the password', async () => {
  const user = { id: 'user', tenantId: 'tenant' }
  const setup = expirySetup({ expired: false, persisted: { accessToken: 'kept', user } })
  await setup.store.getState().hydrate()
  assert.equal(setup.revoked.length, 0)
  assert.equal(setup.state.cleared, 0)
  const auth = setup.store.getState()
  assert.equal(auth.accessToken, 'kept')
  assert.equal(auth.sessionExpired, false)
  assert.deepEqual(setup.identity.getOfflineOwner(), { tenantId: 'tenant', userId: 'user' })
})
