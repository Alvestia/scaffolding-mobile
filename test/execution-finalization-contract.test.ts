import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeQueuedExecutionPayload } from '../src/utils/queued-execution.ts'

test('execution outbox preserves component advances and finalization adjustments', () => {
  const normalized = normalizeQueuedExecutionPayload({
    entry: {
      scaffoldServiceId: 'service-1',
      operationType: 'MONTAGEM',
      inputType: 'PERCENTUAL',
      inputValue: 25,
      startTime: '2026-08-10T10:00:00.000Z',
      endTime: '2026-08-10T11:00:00.000Z',
      laborMode: 'CREW',
      crewId: 'crew-1',
      memberEmployeeIds: ['employee-1'],
      scaffoldComponentAdvances: [
        {
          scaffoldComponentId: 'component-1',
          inputType: 'QUANTIDADE',
          inputValue: 2,
        },
      ],
    },
    scaffoldId: 'scaffold-1',
    adjustments: [
      {
        localId: 'adjustment-1',
        scope: 'COMPONENT',
        scaffoldComponentId: 'component-1',
        measurementUnit: 'UNIDADE',
        type: 'DEDUCTION',
        quantity: 1,
        reason: 'Interferência local',
      },
    ],
  })

  assert.equal(normalized?.scaffoldId, 'scaffold-1')
  assert.deepEqual(normalized?.entry.scaffoldComponentAdvances, [
    {
      scaffoldComponentId: 'component-1',
      inputType: 'QUANTIDADE',
      inputValue: 2,
    },
  ])
  assert.equal(normalized?.adjustments?.[0]?.scaffoldComponentId, 'component-1')
  assert.equal(normalized?.adjustments?.[0]?.type, 'DEDUCTION')
})

test('legacy component selections remain readable as a migration fallback', () => {
  const normalized = normalizeQueuedExecutionPayload({
    scaffoldServiceId: 'service-legacy',
    operationType: 'DESMONTAGEM',
    inputType: 'PERCENTUAL',
    inputValue: 50,
    startTime: '2026-08-10T10:00:00.000Z',
    endTime: '2026-08-10T11:00:00.000Z',
    selectedScaffoldComponentIds: ['component-legacy'],
    crewMemberEmployeeIds: ['employee-legacy'],
  })

  assert.deepEqual(normalized?.entry.scaffoldComponentIds, ['component-legacy'])
  assert.deepEqual(normalized?.entry.memberEmployeeIds, ['employee-legacy'])
  assert.deepEqual(normalized?.adjustments, [])
})
