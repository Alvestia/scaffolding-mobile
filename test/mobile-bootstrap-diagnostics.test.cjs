const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadSource } = require('./helpers/load-source.cjs')
const { hookHarness } = require('./helpers/hook-harness.cjs')
const flush = () => new Promise((resolve) => setImmediate(resolve))

test('startup diagnostics classify native/SQLite errors without leaking raw details', async () => {
  const { runStartupStep, getStartupDiagnostic } = loadSource('services/startup-diagnostics.ts')
  const cases = [
    ["Cannot find native module 'ExpoSQLite'", 'native_module'],
    ['java.lang.NoSuchMethodError', 'native_linkage'],
    ['java.lang.UnsatisfiedLinkError', 'native_linkage'],
    ['java.lang.NullPointerException', 'native_handle'],
    ['database is locked', 'database_busy'],
    ['database disk image is malformed', 'database_corrupt'],
    ['database or disk is full', 'storage_full'],
    ['unable to open database file', 'database_io'],
    ['no such column: sensitive_column', 'sqlite_error'],
    ['SecureStore unavailable', 'secure_storage'],
    ['unexpected failure', 'unknown'],
  ]
  for (const [message, reason] of cases) {
    const original = new Error(
      `${message}; SELECT secret FROM records; /private/user/db; token=secret`,
    )
    await assert.rejects(
      runStartupStep('sqlite_schema', () =>
        runStartupStep('sqlite_open', async () => {
          throw original
        }),
      ),
      (error) => {
        const diagnostic = getStartupDiagnostic(error, 'sqlite_schema')
        assert.equal(diagnostic.stage, 'sqlite_open')
        assert.equal(diagnostic.reason, reason)
        assert.equal(error.cause, original)
        assert.doesNotMatch(JSON.stringify(diagnostic), /secret|private|SELECT|sensitive_column/)
        return true
      },
    )
  }
  const cyclic = { code: 'SQLITE_BUSY' }
  cyclic.cause = cyclic
  assert.equal(getStartupDiagnostic(cyclic, 'sqlite_schema').reason, 'database_busy')
  assert.equal(getStartupDiagnostic(null, 'session').reason, 'unknown')
})

test('failed SQLite configuration closes the handle and permits a fresh retry', async () => {
  let opens = 0,
    closes = 0
  const original = new Error('SQLITE_IOERR: /private/path')
  const healthy = { execAsync: async () => {} }
  const client = loadSource('database/client.ts', {
    'react-native': { Platform: { OS: 'android' } },
    'expo-sqlite': {
      openDatabaseAsync: async () => {
        opens++
        return opens === 1
          ? {
              execAsync: async () => {
                throw original
              },
              closeAsync: async () => {
                closes++
              },
            }
          : healthy
      },
    },
  })
  await assert.rejects(client.getDatabase(), (error) => {
    assert.equal(error.stage, 'sqlite_configure')
    assert.equal(error.cause, original)
    return true
  })
  assert.equal(closes, 1)
  assert.equal(await client.getDatabase(), healthy)
  assert.equal(opens, 2)
})

test('bootstrap reports a safe support reference and does not bypass failed migrations', async (t) => {
  const logs = []
  t.mock.method(console, 'error', (...args) => logs.push(args))
  const harness = hookHarness()
  let hydrated = 0
  const auth = {
    isHydrated: false,
    hydrate: async () => {
      hydrated++
    },
    clearSession: async () => {
      throw new Error('must not clear session')
    },
  }
  const { useAppBootstrap } = loadSource('hooks/use-app-bootstrap.ts', {
    react: harness.hooks,
    '@/database/migrations': {
      initializeDatabase: async () => {
        throw new Error('SQLITE_ERROR SELECT secret FROM private_records')
      },
    },
    '@/store/auth-store': {
      useAuthStore: (select) => select(auth),
    },
  })
  harness.render(useAppBootstrap)
  await flush()
  const failed = harness.render(useAppBootstrap)
  assert.equal(failed.isReady, false)
  assert.equal(failed.canResetSession, false)
  assert.equal(hydrated, 0)
  assert.match(failed.error, /START-SQLITE_SCHEMA-SQLITE_ERROR/)
  assert.match(failed.error, /preservados/)
  assert.equal(logs.length, 1)
  assert.deepEqual(JSON.parse(logs[0][1]), {
    event: 'app_bootstrap_failed',
    stage: 'sqlite_schema',
    reason: 'sqlite_error',
    reference: 'START-SQLITE_SCHEMA-SQLITE_ERROR',
  })
  assert.doesNotMatch(failed.error + JSON.stringify(logs), /SELECT|secret|private_records/)
})
