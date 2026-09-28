const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadSource } = require('./helpers/load-source.cjs')
const { hookHarness, findElement, nativeMock } = require('./helpers/hook-harness.cjs')

function executionScreen() {
  const harness = hookHarness()
  let query = { isPending: true }
  let retries = 0
  const mocks = {
    react: harness.hooks,
    'react-native': nativeMock,
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@react-native-community/datetimepicker': { default: 'DateTimePicker' },
    'expo-router': { useLocalSearchParams: () => ({ serviceId: 'remote' }), router: {}, Redirect: 'Redirect' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@tanstack/react-query': { useQuery: () => ({ data: [] }) },
    '@/store/auth-store': { useAuthStore: (select) => select({ user: { id: 'user' } }) },
    '@/store/connectivity-store': { useConnectivityStore: (select) => select({ isConnected: true }) },
    '@/store/operational-context-store': { useOperationalContextStore: () => ({ contractId: 'contract', unitId: 'unit' }) },
    '@/store/sync-store': { useSyncStore: (select) => select({}) },
    '@/database/repositories/outbox-repository': { outboxRepository: {} },
    '@/hooks/use-queue-service-detail': { useQueueServiceDetail: () => ({ ...query, refetch: async () => retries++ }) },
    '@/hooks/use-crews': { useCrews: () => ({ data: [] }) },
    '@/hooks/use-scaffold-components': { useScaffoldComponents: () => ({ data: [] }) },
    '@/services/employees.service': {}, '@/services/work-functions.service': {},
    '@/utils/id': {}, '@/utils/focus': {},
  }
  for (const [file, name] of [
    ['ui/banner', 'Banner'], ['ui/empty-state', 'EmptyState'], ['ui/segmented-control', 'SegmentedControl'],
    ['ui/selection-modal', 'SelectionModal'], ['app/network-status-indicator', 'NetworkStatusIndicator'],
    ['execution/execution-evidence-picker', 'ExecutionEvidencePicker'],
    ['execution/execution-component-advance-section', 'ExecutionComponentAdvanceSection'],
    ['execution/execution-measurement-adjustment-section', 'ExecutionMeasurementAdjustmentSection'],
  ]) mocks[`@/components/${file}`] = { [name]: name }
  const { default: Screen } = loadSource('app/(app)/queue/[serviceId]/execute.tsx', mocks)
  return {
    render: (next) => { if (next) query = next; return harness.render(Screen) },
    retries: () => retries,
  }
}
const initialService = { id: 'remote', scaffoldId: 'scaffold', type: 'MONTAGEM',
  plannedQuantity: 60, plannedUnit: 'M3', quantityVersion: 0,
  executedQuantity: 0, progress: 0, status: 'NAO_INICIADO' }
const byType = (type) => (node) => node.type === type
const byInput = (placeholder) => (node) => node.props.placeholder === placeholder && typeof node.props.onChangeText === 'function'
const byButton = (label) => (node) => node.type === 'Pressable' &&
  findElement(node, (child) => child.type === 'Text' && child.props.children === label)

test('execution detail waits for data, offers retry on failure, and hides stale data after denial', async () => {
  const screen = executionScreen()
  let tree = screen.render()
  assert.ok(findElement(tree, byType('ActivityIndicator')))
  assert.equal(findElement(tree, byType('EmptyState')), undefined)
  tree = screen.render({ isPending: false, isError: true, error: new Error('Sem acesso'), data: initialService })
  const error = findElement(tree, byType('EmptyState'))
  assert.equal(error.props.title, 'Não foi possível carregar o serviço')
  assert.equal(error.props.description, 'Sem acesso')
  assert.equal(findElement(tree, byInput('Ex.: 25')), undefined)
  await findElement(tree, byButton('Tentar novamente')).props.onPress()
  assert.equal(screen.retries(), 1)
  tree = screen.render({ isPending: false, data: initialService })
  assert.equal(findElement(tree, byType('EmptyState')), undefined)
  assert.ok(findElement(tree, byInput('Ex.: 25')))
})

for (const mode of ['quantity', 'percentage']) {
  test(`a web revision requires an explicit ${mode} choice without erasing the typed progress`, () => {
    const screen = executionScreen()
    let tree = screen.render({ isPending: false, data: initialService })
    findElement(tree, byInput('Ex.: 25')).props.onChangeText('50')
    tree = screen.render()
    const revised = { ...initialService, quantityVersion: 1, plannedQuantity: 120 }
    tree = screen.render({ isPending: false, data: revised })
    assert.ok(findElement(tree, (node) => node.type === 'Banner' && node.props.title === 'A quantidade do serviço mudou'))
    assert.equal(findElement(tree, byInput('Ex.: 25')).props.value, '50')
    const label = mode === 'quantity' ? 'Manter a quantidade executada' : 'Manter o percentual executado'
    findElement(tree, byButton(label)).props.onPress()
    tree = screen.render()
    assert.equal(findElement(tree, (node) => node.type === 'Banner' && node.props.title === 'A quantidade do serviço mudou'), undefined)
    const input = mode === 'quantity' ? 'Ex.: 4.5' : 'Ex.: 25'
    assert.equal(findElement(tree, byInput(input)).props.value, mode === 'quantity' ? '30' : '50')
  })
}
