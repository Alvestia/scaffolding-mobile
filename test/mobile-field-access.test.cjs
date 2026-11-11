const assert = require('node:assert/strict')
const { test } = require('node:test')
const { AxiosError } = require('axios')
const { loadSource } = require('./helpers/load-source.cjs')

const flush = () => new Promise((resolve) => setImmediate(resolve))

function fieldService({ level = 2 } = {}) {
  const posts = []
  const service = loadSource('services/field-access.service.ts', {
    'expo-local-authentication': {
      SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2 },
      getEnrolledLevelAsync: async () => level,
    },
    'react-native': { Platform: { OS: 'android' } },
    '@/api/client': {
      api: {
        post: async (url, body) => {
          posts.push([url, body])
          return { data: { accessToken: 'token', user: { id: 'user', accountType: 'FIELD' } } }
        },
      },
    },
    '@/services/device-identity.service': {
      getDeviceSessionMetadata: async () => ({
        deviceId: 'device_1234567890abcdef',
        deviceName: 'Celular',
        clientVersion: '2.1.0',
      }),
    },
  })
  return { service, posts }
}

test('the activation code is read from the QR Code or typed, in the API format', () => {
  const { service } = fieldService()
  assert.equal(service.parseFieldAccessCode('SCAFFOLD-CAMPO:K7MX-4PQ2'), 'K7MX-4PQ2')
  assert.equal(service.parseFieldAccessCode(' k7mx4pq2 '), 'K7MX-4PQ2')
  assert.equal(service.parseFieldAccessCode('K7MX-4PQO'), null, 'O is not in the alphabet')
  assert.equal(service.parseFieldAccessCode('https://example.com'), null)
  assert.equal(service.maskFieldAccessCode('k7mx4'), 'K7MX-4')
  assert.equal(service.maskFieldAccessCode('k7-mx 4pq2xx'), 'K7MX-4PQ2')
})

test('activation sends the code with this phone and requires a screen lock first', async () => {
  const { service, posts } = fieldService()
  await service.assertDeviceLockAvailable()
  const session = await service.activateFieldAccess('K7MX-4PQ2')
  assert.equal(session.user.accountType, 'FIELD')
  assert.equal(posts[0][0], '/auth/field/activate')
  assert.deepEqual(posts[0][1], {
    code: 'K7MX-4PQ2',
    deviceId: 'device_1234567890abcdef',
    deviceName: 'Celular',
    clientVersion: '2.1.0',
  })

  const unlocked = fieldService({ level: 0 })
  await assert.rejects(unlocked.service.assertDeviceLockAvailable(), /bloqueio de tela/)
})

test('the app locks on every start and again after five minutes away', () => {
  const { useAppLockStore, RELOCK_AFTER_MS } = loadSource('store/app-lock-store.ts')
  const store = useAppLockStore.getState
  assert.equal(store().unlocked, false, 'cold start is locked')
  store().unlock()
  assert.equal(store().unlocked, true)

  const realNow = Date.now
  try {
    let now = 1_000_000
    Date.now = () => now
    store().markBackground()
    now += RELOCK_AFTER_MS - 1_000
    store().resume()
    assert.equal(store().unlocked, true, 'a quick photo does not lock')

    store().markBackground()
    now += RELOCK_AFTER_MS + 1_000
    store().resume()
    assert.equal(store().unlocked, false, 'a long absence locks')
  } finally {
    Date.now = realNow
  }
})

test('the notice counts the records left unsent on the phone', () => {
  const notice = loadSource('security/access-ended-notice.ts')
  assert.match(notice.fieldAccessEndedNotice(), /acesso deste celular foi encerrado/)
  assert.doesNotMatch(notice.fieldAccessEndedNotice(), /não foram enviados/)
  notice.setUnsentRecordsCounter(() => 3)
  assert.match(notice.fieldAccessEndedNotice(), /3 registro\(s\)/)
})

test('a field phone refused by the server is signed out and told why', async () => {
  for (const accountType of ['FIELD', 'CORPORATE']) {
    const owner = loadSource('security/offline-owner.ts')
    owner.setOfflineOwner({ id: 'user', tenantId: 'tenant' })
    let clears = 0
    let notice
    const auth = {
      accessToken: 'old-token',
      user: { id: 'user', accountType },
      renewDeviceSession: async () => {
        throw new AxiosError('revoked', undefined, undefined, undefined, { status: 401, data: {} })
      },
      clearSession: async () => {
        clears++
      },
      noteAccessEnded: (text) => {
        notice = text
      },
    }
    const { api } = loadSource('api/client.ts', {
      '@/utils/env': { env: { apiUrl: 'https://api.example.com', requestTimeoutMs: 30000 } },
      '@/security/offline-owner': owner,
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
    api.defaults.adapter = async (config) => {
      throw new AxiosError('expired', undefined, config, undefined, {
        status: 401,
        config,
        data: {},
      })
    }
    await assert.rejects(api.get('/a'))
    await flush()
    assert.equal(clears, 1)
    if (accountType === 'FIELD') assert.match(notice, /acesso deste celular foi encerrado/)
    else assert.equal(notice, undefined, 'corporate users keep the usual login screen')
  }
})
