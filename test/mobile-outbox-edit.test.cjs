const assert = require('node:assert/strict')
const { test } = require('node:test')
const { DatabaseSync } = require('node:sqlite')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { loadSource } = require('./helpers/load-source.cjs')

test('SQLite outbox preserves accepted/syncing records and never recreates a vanished draft', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-sqlite-startup-'))
  const databasePath = path.join(directory, 'test.db')
  const sql = new DatabaseSync(databasePath)
  const adapt = (connection) => ({
    execAsync: async (query) => connection.exec(query),
    getFirstAsync: async (query, params = []) => connection.prepare(query).get(...params),
    getAllAsync: async (query, params = []) => connection.prepare(query).all(...params),
    runAsync: async (query, params = []) => connection.prepare(query).run(...params),
    withExclusiveTransactionAsync: async (fn) => {
      // Expo opens a separate connection for exclusive transactions, including migrations.
      const transaction = new DatabaseSync(databasePath)
      try {
        transaction.exec('BEGIN')
        await fn(adapt(transaction))
        transaction.exec('COMMIT')
      } catch (error) {
        transaction.exec('ROLLBACK')
        throw error
      } finally {
        transaction.close()
      }
    },
  })
  const db = adapt(sql)
  let queue = Promise.resolve()
  const native = {
    getDatabase: async () => db,
    withNativeDatabaseLock: (fn) => {
      const next = queue.then(() => fn(db))
      queue = next.catch(() => {})
      return next
    },
  }
  const identity = loadSource('security/offline-owner.ts')
  identity.setOfflineOwner({ id: 'user', tenantId: 'tenant' })
  const mocks = {
    'react-native': { Platform: { OS: 'android' } },
    '@/database/client': native,
    '@/security/offline-owner': identity,
    '@/database/web-storage': {},
    '@/services/offline-crypto.service': {
      encryptOfflinePayload: async (value) => JSON.stringify(value),
      decryptOfflinePayload: async (value) => JSON.parse(value),
    },
  }
  try {
    const { initializeDatabase } = loadSource('database/migrations.ts', mocks)
    await initializeDatabase()
    assert.equal(sql.prepare('PRAGMA user_version').get().user_version, 3)
    const { outboxRepository: repo } = loadSource(
      'database/repositories/outbox-repository.ts',
      mocks,
    )
    const item = {
      localId: 'execution-1',
      entityType: 'EXECUTION_ENTRY',
      contractId: 'contract',
      unitId: 'unit',
      syncStatus: 'pending',
      payload: { notes: 'original', evidences: ['photo'] },
    }
    await repo.enqueue(item)
    const original = sql.prepare('SELECT * FROM outbox_items').get()
    await initializeDatabase()
    assert.deepEqual(sql.prepare('SELECT * FROM outbox_items').get(), original)
    sql.prepare("UPDATE outbox_items SET remote_id = 'accepted', sync_status = 'failed'").run()
    await assert.rejects(
      repo.enqueue({ ...item, payload: { notes: 'edited' } }, { requireExisting: true }),
      /já foi enviado/,
    )
    assert.equal(sql.prepare('SELECT payload FROM outbox_items').get().payload, original.payload)
    sql.prepare("UPDATE outbox_items SET remote_id = NULL, sync_status = 'syncing'").run()
    await assert.rejects(repo.enqueue(item), /está em envio/)
    sql.prepare("UPDATE outbox_items SET sync_status = 'conflict'").run()
    await repo.enqueue({ ...item, payload: { notes: 'corrected' } }, { requireExisting: true })
    const corrected = sql.prepare('SELECT * FROM outbox_items').get()
    assert.equal(corrected.created_at, original.created_at)
    assert.equal(corrected.idempotency_key, original.idempotency_key)
    assert.equal(JSON.parse(corrected.payload).notes, 'corrected')
    sql.prepare('DELETE FROM outbox_items').run()
    await assert.rejects(repo.enqueue(item, { requireExisting: true }), /não está mais disponível/)
    assert.equal(sql.prepare('SELECT count(*) AS count FROM outbox_items').get().count, 0)
  } finally {
    sql.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
