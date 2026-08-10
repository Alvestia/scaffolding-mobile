import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('outbox v2 migration remains additive and recovers interrupted leases', async () => {
  const migration = await readFile(
    'src/database/migrations.ts',
    'utf8',
  )

  for (const column of [
    'idempotency_key',
    'next_attempt_at',
    'locked_at',
    'lease_until',
    'lease_owner',
    'last_error_code',
  ]) {
    assert.match(migration, new RegExp(`'${column}'`))
  }
  assert.match(migration, /ALTER TABLE outbox_items ADD COLUMN \$\{name\}/)
  assert.match(migration, /SET idempotency_key = local_id/)
  assert.match(migration, /WHERE sync_status = 'syncing'/)
  assert.match(migration, /PRAGMA user_version = 2/)
  assert.doesNotMatch(migration, /DROP TABLE outbox_items/)
})
