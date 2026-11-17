/* global __dirname */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { loadSource } = require('./helpers/load-source.cjs')

function load(file) {
  const module = { exports: {} }
  const { outputText } = ts.transpileModule(
    fs.readFileSync(path.resolve(__dirname, '../src', file), 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    },
  )
  new Function('require', 'module', 'exports', outputText)(require, module, module.exports)
  return module.exports
}

const { suggestShiftId } = load('utils/shift-time.ts')
const shifts = [
  { id: 'adm', startTime: '07:00', endTime: '17:00' },
  { id: 'night', startTime: '22:00', endTime: '06:00' },
]

test('the app suggests the shift by the start time, like the API', () => {
  assert.equal(suggestShiftId(shifts, '08:30'), 'adm')
  assert.equal(suggestShiftId(shifts, '23:15'), 'night')
  assert.equal(suggestShiftId(shifts, '05:00'), 'night')
  assert.equal(suggestShiftId(shifts, '19:00'), null)
  assert.equal(suggestShiftId([], '08:30'), null)
})

test('activity and deviation forms send the shift, still optional', () => {
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '../src', file), 'utf8')
  const execute = read('app/(app)/queue/[serviceId]/execute.tsx')
  const deviations = read('app/(app)/(tabs)/deviations.tsx')
  for (const screen of [execute, deviations]) {
    assert.match(screen, /<ShiftField/)
    assert.match(screen, /\n\s+shiftId,\n/)
  }
  assert.match(read('types/execution.ts'), /shiftId\?: string \| null/)
})

test('shift survives serialized drafts, editing and HTTP submission; legacy automatic and explicit none remain distinct', async () => {
  const { normalizeQueuedExecutionPayload } = loadSource('utils/queued-execution.ts')
  const posts = []
  const { createExecutionEntry } = loadSource('services/execution-entries.service.ts', {
    '@/api/client': {
      api: {
        post: async (url, payload) => {
          posts.push({ url, payload: JSON.parse(JSON.stringify(payload)) })
          return { data: { id: 'remote' } }
        },
      },
    },
  })
  for (const shiftId of ['night-shift', null, undefined]) {
    for (const wrapped of [false, true]) {
      const entry = { scaffoldServiceId: 'service', shiftId }
      const stored = JSON.parse(JSON.stringify(wrapped ? { entry } : entry))
      const restored = normalizeQueuedExecutionPayload(stored)
      assert.equal(restored.entry.shiftId, shiftId)
      const forSync = normalizeQueuedExecutionPayload(restored)
      await createExecutionEntry(forSync.entry, 'mutation')
      assert.equal(posts.at(-1).payload.shiftId, shiftId)
      assert.equal(posts.at(-1).url, '/execution-entries')
      assert.equal(posts.at(-1).payload.clientMutationId, 'mutation')
    }
  }
})
