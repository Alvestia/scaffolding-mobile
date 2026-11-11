const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadSource } = require('./helpers/load-source.cjs')
const { hookHarness, nativeMock } = require('./helpers/hook-harness.cjs')

function scaffoldsService() {
  const posts = []
  const service = loadSource('services/scaffolds.service.ts', {
    '@/api/client': {
      api: {
        post: async (url, body, config) => {
          posts.push({ url, body, config })
          return { data: { id: 'scaffold' } }
        },
      },
    },
    '@/services/reference-cache.service': {},
    '@/security/offline-owner': {},
  })
  return { service, posts }
}

const draft = (patch = {}) => ({
  localId: 'emergency_1',
  companyId: 'company',
  unitId: 'unit',
  contractId: 'contract',
  scaffoldTypeId: 'type',
  measurementUnit: 'M3',
  ...patch,
})

test('a scaffold created in the app is planned with a work order and an emergency without one', async () => {
  const { service, posts } = scaffoldsService()
  await service.createEmergencyScaffold(draft({ workOrderId: 'os-1' }), 'emergency_1')
  await service.createEmergencyScaffold(draft(), 'emergency_2')

  assert.equal(posts[0].url, '/scaffolds')
  assert.equal(posts[0].body.origin, 'PLANEJADO')
  assert.equal(posts[0].body.primaryWorkOrderId, 'os-1')
  assert.equal(posts[1].body.origin, 'CAMPO_EMERGENCIAL')
  // The server recognises app creations by this id and applies the final rule.
  assert.equal(posts[0].body.mobileLocalId, 'emergency_1')
  assert.equal(posts[0].config.headers['Idempotency-Key'], 'emergency_1')
})

function keyboardAvoider() {
  const harness = hookHarness()
  const listeners = {}
  const { KeyboardAvoider, keyboardTop, keyboardOverlap } = loadSource(
    'components/ui/keyboard-avoider.tsx',
    {
      react: { ...harness.hooks, useCallback: (callback) => callback },
      'react-native': {
        ...nativeMock,
        Dimensions: { get: () => ({ height: 800 }) },
        Keyboard: {
          addListener: (name, callback) => {
            listeners[name] = callback
            return { remove: () => delete listeners[name] }
          },
        },
      },
    },
  )
  const render = () => harness.render(KeyboardAvoider, { style: { flex: 1 } })
  const paddingOf = (tree) =>
    tree.props.style.flat().find((entry) => entry && 'paddingBottom' in entry)?.paddingBottom ?? 0
  return { render, paddingOf, listeners, keyboardTop, keyboardOverlap }
}

test('the keyboard edge is read from the event, with its height as a second reading', () => {
  const { keyboardTop, keyboardOverlap } = keyboardAvoider()
  assert.equal(keyboardTop({ screenY: 500, height: 300 }, 800), 500)
  assert.equal(keyboardTop({ screenY: 800, height: 300 }, 800), 500, 'position came back as the screen bottom')
  assert.equal(keyboardTop({ screenY: 500, height: 0 }, 800), 500)
  assert.equal(keyboardOverlap({ y: 100, height: 600 }, 500), 200)
  assert.equal(keyboardOverlap({ y: 0, height: 400 }, 500), 0, 'a view above the keyboard needs no space')
})

test('on Android the screen reserves exactly the space the keyboard covers', () => {
  const { render, paddingOf, listeners } = keyboardAvoider()
  let tree = render()
  assert.equal(paddingOf(tree), 0)
  assert.ok(listeners.keyboardDidShow && listeners.keyboardDidHide, 'Android keyboard events')

  // The view occupies 100..700 on an 800 high screen; the keyboard top is at 500.
  let frame = { y: 100, height: 600 }
  tree.props.ref.current = { measureInWindow: (callback) => callback(0, frame.y, 360, frame.height) }
  listeners.keyboardDidShow({ endCoordinates: { screenY: 500, height: 300 } })
  tree = render()
  assert.equal(paddingOf(tree), 200)

  // The tab bar hides with the keyboard open and the view grows: measured again.
  frame = { y: 100, height: 660 }
  tree.props.onLayout()
  tree = render()
  assert.equal(paddingOf(tree), 260)

  listeners.keyboardDidHide()
  tree = render()
  assert.equal(paddingOf(tree), 0)
  tree.props.onLayout()
  assert.equal(paddingOf(render()), 0, 'no measuring while the keyboard is closed')
})
