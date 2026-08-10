import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertOfflineOwnerContext,
  buildOwnedStorageKey,
  captureOfflineOwnerContext,
  setOfflineOwner,
} from '../src/security/offline-owner.ts'

test('a user switch invalidates active sync work and partitions storage', () => {
  setOfflineOwner({ id: 'user-a', tenantId: 'tenant-a' })
  const ownerA = captureOfflineOwnerContext()
  const keyA = buildOwnedStorageKey('outbox')
  assert.doesNotThrow(() => assertOfflineOwnerContext(ownerA))

  setOfflineOwner(null)
  assert.throws(() => assertOfflineOwnerContext(ownerA), /identidade ativa mudou/)

  setOfflineOwner({ id: 'user-b', tenantId: 'tenant-b' })
  const keyB = buildOwnedStorageKey('outbox')
  assert.notEqual(keyA, keyB)
  assert.throws(() => assertOfflineOwnerContext(ownerA), /identidade ativa mudou/)

  setOfflineOwner(null)
})
