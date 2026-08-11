import assert from 'node:assert/strict'
import test from 'node:test'
import type { ScaffoldComponent } from '../src/types/scaffold-component.ts'
import { buildInheritedComponentAdvances } from '../src/utils/component-advances.ts'

function component(id: string, quantity: number, remainingQuantity: number): ScaffoldComponent {
  return {
    id,
    scaffoldId: 'scaffold-1',
    lineCode: id,
    name: id,
    quantity,
    executionProgress: {
      MONTAGEM: {
        measuredQuantity: quantity - remainingQuantity,
        remainingQuantity,
        progressPercent: ((quantity - remainingQuantity) / quantity) * 100,
      },
    },
  }
}

test('preselects every component with balance and inherits the scaffold percentage', () => {
  const advances = buildInheritedComponentAdvances(
    [component('full-balance', 10, 10), component('partial-balance', 10, 2)],
    'MONTAGEM',
    'PERCENTUAL',
    50,
  )

  assert.deepEqual(advances, [
    {
      scaffoldComponentId: 'full-balance',
      inputType: 'PERCENTUAL',
      inputValue: 50,
    },
    {
      scaffoldComponentId: 'partial-balance',
      inputType: 'PERCENTUAL',
      inputValue: 20,
    },
  ])
})

test('does not preselect components without an executable balance', () => {
  const advances = buildInheritedComponentAdvances(
    [component('available', 5, 5), component('finished', 5, 0)],
    'MONTAGEM',
    'PERCENTUAL',
    25,
  )

  assert.deepEqual(
    advances.map((advance) => advance.scaffoldComponentId),
    ['available'],
  )
})
