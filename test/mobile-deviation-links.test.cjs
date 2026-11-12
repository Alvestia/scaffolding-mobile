const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadSource } = require('./helpers/load-source.cjs')

const links = loadSource('utils/deviation-links.ts', {
  '@/utils/id': { isLocalId: (id) => id.startsWith('local_') },
})

const service = (scaffoldId, code, workOrderId, extra = {}) => ({
  id: `svc-${scaffoldId}-${workOrderId ?? 'none'}`,
  scaffoldId,
  workOrderId,
  scaffold: { id: scaffoldId, code, location: `Local ${code}`, description: null },
  ...extra,
})

test('the scaffolds come from the queue, once each, without the ones only on this phone', () => {
  const scaffolds = links.scaffoldsFromQueue([
    service('s2', 'AND-002', 'os-1'),
    service('s1', 'AND-001', 'os-1'),
    service('s1', 'AND-001', 'os-2'),
    service('s1', 'AND-001', null),
    service('local_9', 'AND-009', 'os-1'),
    { ...service('s3', 'AND-003', 'os-1'), scaffold: null },
  ])
  assert.deepEqual(
    scaffolds.map((item) => item.code),
    ['AND-001', 'AND-002'],
  )
  assert.deepEqual(scaffolds[0].workOrderIds, ['os-1', 'os-2'])
  assert.equal(scaffolds[0].location, 'Local AND-001')
})

test('with a work order chosen only its scaffolds are offered', () => {
  const scaffolds = links.scaffoldsFromQueue([
    service('s1', 'AND-001', 'os-1'),
    service('s2', 'AND-002', 'os-2'),
  ])
  assert.deepEqual(
    links.scaffoldsForWorkOrder(scaffolds, 'os-2').map((item) => item.id),
    ['s2'],
  )
  assert.equal(links.scaffoldsForWorkOrder(scaffolds, '').length, 2)
})

test('only work orders in progress of the contract and unit are offered', () => {
  const scope = { contractId: 'c1', unitId: 'u1' }
  const offered = links.linkableWorkOrders(
    [
      { id: 'open', code: 'OS-1', status: 'OPEN', contractId: 'c1', unitId: 'u1' },
      { id: 'running', code: 'OS-2', status: 'IN_PROGRESS', contractId: 'c1' },
      { id: 'done', code: 'OS-3', status: 'COMPLETED', contractId: 'c1' },
      { id: 'other', code: 'OS-4', status: 'OPEN', contractId: 'c2' },
    ],
    scope,
  )
  assert.deepEqual(
    offered.map((item) => item.id),
    ['open', 'running'],
  )
})

test('the deviation is contract-wide only without work order and without scaffold', () => {
  assert.deepEqual(links.deviationLinkFields({ workOrderId: '', scaffoldId: '' }), {
    isGlobal: true,
    workOrderId: undefined,
    scaffoldId: undefined,
  })
  assert.deepEqual(links.deviationLinkFields({ workOrderId: 'os-1', scaffoldId: '' }), {
    isGlobal: false,
    workOrderId: 'os-1',
    scaffoldId: undefined,
  })
  assert.deepEqual(links.deviationLinkFields({ workOrderId: 'os-1', scaffoldId: 's1' }), {
    isGlobal: false,
    workOrderId: 'os-1',
    scaffoldId: 's1',
  })
  assert.equal(links.deviationLinkFields({ workOrderId: '', scaffoldId: 's1' }).isGlobal, false)
})
