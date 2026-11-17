const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadSource } = require('./helpers/load-source.cjs')
const { hookHarness, findElement, nativeMock } = require('./helpers/hook-harness.cjs')

test('GPS uses the shared button and never offers a bypass; existing positions are preserved', () => {
  let captured = 0
  const { ScaffoldGeolocationCard } = loadSource(
    'components/scaffold/scaffold-geolocation-card.tsx',
    {
      'react-native': nativeMock,
      '@/components/ui/button': { Button: 'Button' },
    },
  )
  const location = { hasLocation: false, busy: false, capture: () => captured++ }
  let tree = ScaffoldGeolocationCard({ location })
  const button = findElement(tree, (node) => node.type === 'Button')
  assert.equal(button.props.children, 'Capturar GPS')
  button.props.onPress()
  assert.equal(captured, 1)
  tree = ScaffoldGeolocationCard({ location: { ...location, hasLocation: true } })
  assert.equal(
    findElement(tree, (node) => node.type === 'Button'),
    undefined,
  )
  for (const state of [
    {},
    { error: 'Sem permissão' },
    { busy: true },
    { value: { latitude: 0, longitude: 0 } },
  ]) {
    tree = ScaffoldGeolocationCard({ location: { ...location, ...state } })
    assert.equal(
      findElement(tree, (node) => node.type === 'Pressable'),
      undefined,
    )
    assert.equal(
      findElement(
        tree,
        (node) => node.type === 'Text' && node.props.children === 'Continuar sem GPS',
      ),
      undefined,
    )
  }
})

test('new scaffold cannot be saved without GPS and queues the captured point offline', async () => {
  const harness = hookHarness()
  let submitted
  const location = { hasLocation: false, busy: false, reset() {} }
  const mocks = {
    react: harness.hooks,
    'react-native': { ...nativeMock, Switch: 'Switch' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@react-native-community/datetimepicker': { default: 'DateTimePicker' },
    'expo-router': { useFocusEffect() {}, router: { replace() {}, push() {} } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/hooks/use-scaffold-geolocation': { useScaffoldGeolocation: () => location },
    '@/hooks/use-latest-scaffold': { useLatestScaffold: () => ({ refetch() {} }) },
    '@/store/connectivity-store': {
      useConnectivityStore: (select) => select({ isConnected: false }),
    },
    '@/store/operational-context-store': {
      useOperationalContextStore: () => ({
        companyId: 'company',
        unitId: 'unit',
        contractId: 'contract',
      }),
    },
    '@/store/sync-store': {
      useSyncStore: (select) => select({ outboxItems: [], refreshState: async () => {} }),
    },
    '@/database/repositories/outbox-repository': {
      outboxRepository: {
        enqueue: async (value) => {
          submitted = value
        },
      },
    },
    '@/database/repositories/local-scaffold-service-repository': {
      localScaffoldServiceRepository: { insert: async () => {} },
    },
    '@/services/scaffolds.service': {},
    '@/utils/id': { createLocalId: () => 'local-test' },
    '@/utils/focus': { blurActiveElement() {} },
  }
  for (const [file, name] of [
    ['areas', 'Areas'],
    ['projects', 'Projects'],
    ['scaffold-types', 'ScaffoldTypes'],
    ['work-orders', 'WorkOrders'],
  ]) {
    mocks[`@/hooks/use-${file}`] = { [`use${name}`]: () => ({ data: [] }) }
  }
  for (const [file, name] of [
    ['scaffold/scaffold-geolocation-card', 'ScaffoldGeolocationCard'],
    ['scaffold/component-draft-modal', 'ComponentDraftModal'],
    ['app/network-status-indicator', 'NetworkStatusIndicator'],
    ['ui/keyboard-avoider', 'KeyboardAvoider'],
    ['ui/banner', 'Banner'],
    ['ui/segmented-control', 'SegmentedControl'],
    ['ui/selection-modal', 'SelectionModal'],
  ])
    mocks[`@/components/${file}`] = { [name]: name }
  const Screen = loadSource('app/(app)/(tabs)/emergency.tsx', mocks).default
  const render = () => harness.render(Screen)
  const save = (tree) =>
    findElement(
      tree,
      (node) =>
        node.type === 'Pressable' &&
        findElement(
          node,
          (child) => child.type === 'Text' && child.props.children === 'Cadastrar andaime',
        ),
    ).props.onPress()
  let tree = render()
  findElement(
    tree,
    (node) => node.type === 'SelectionModal' && node.props.title === 'Tipo de andaime',
  ).props.onSelect('type')
  for (const label of ['Altura', 'Largura', 'Comprimento']) {
    findElement(tree, (node) => node.props.label === label).props.onChangeText('2')
  }
  tree = render()
  save(tree)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(submitted, undefined)
  tree = render()
  assert.ok(
    findElement(
      tree,
      (node) =>
        node.type === 'Banner' &&
        node.props.description === 'Capture o GPS do andaime antes de cadastrar.',
    ),
  )
  location.value = { latitude: -6.4, longitude: -50.3, accuracyMeters: 5 }
  tree = render()
  save(tree)
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(submitted?.payload.geolocation, location.value)
  assert.equal(submitted?.payload.scaffoldTypeId, 'type')
})
