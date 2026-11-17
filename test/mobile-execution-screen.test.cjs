const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadSource } = require('./helpers/load-source.cjs')
const { hookHarness, findElement, nativeMock } = require('./helpers/hook-harness.cjs')

function executionScreen(
  entryDefaults = null,
  { geolocation = { hasLocation: true }, crews = [] } = {},
) {
  const harness = hookHarness()
  let query = { isPending: true }
  let retries = 0
  let submitted
  const mocks = {
    react: harness.hooks,
    'react-native': nativeMock,
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@react-native-community/datetimepicker': { default: 'DateTimePicker' },
    'expo-router': {
      useLocalSearchParams: () => ({ serviceId: 'remote' }),
      router: { replace: () => {} },
      Redirect: 'Redirect',
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@tanstack/react-query': { useQuery: () => ({ data: [] }) },
    '@/store/auth-store': { useAuthStore: (select) => select({ user: { id: 'user' } }) },
    '@/store/connectivity-store': {
      useConnectivityStore: (select) => select({ isConnected: true }),
    },
    '@/store/operational-context-store': {
      useOperationalContextStore: () => ({ contractId: 'contract', unitId: 'unit', entryDefaults }),
    },
    '@/store/sync-store': {
      useSyncStore: (select) =>
        select({ refreshState: async () => {}, runSyncNow: async () => {} }),
    },
    '@/database/repositories/outbox-repository': {
      outboxRepository: {
        enqueue: async (value) => {
          submitted = value
        },
        getByLocalId: async () => submitted,
      },
    },
    '@/hooks/use-queue-service-detail': {
      useQueueServiceDetail: () => ({ ...query, refetch: async () => retries++ }),
    },
    '@/hooks/use-crews': { useCrews: () => ({ data: crews }) },
    '@/hooks/use-scaffold-components': { useScaffoldComponents: () => ({ data: [] }) },
    '@/hooks/use-scaffold-geolocation': {
      useScaffoldGeolocation: () => ({ busy: false, setDraft: () => {}, ...geolocation }),
    },
    '@/components/scaffold/scaffold-geolocation-card': { ScaffoldGeolocationCard: () => null },
    '@/services/employees.service': {},
    '@/services/work-functions.service': {},
    '@/utils/id': { createLocalId: () => 'execution-test' },
    '@/utils/focus': { blurActiveElement: () => {} },
    '@/components/inspection/scaffold-availability-warning': {
      ScaffoldAvailabilityWarning: () => null,
    },
    '@/components/shift/shift-field': { ShiftField: 'ShiftField' },
  }
  for (const [file, name] of [
    ['ui/banner', 'Banner'],
    ['ui/empty-state', 'EmptyState'],
    ['ui/segmented-control', 'SegmentedControl'],
    ['ui/selection-modal', 'SelectionModal'],
    ['app/network-status-indicator', 'NetworkStatusIndicator'],
    ['execution/execution-evidence-picker', 'ExecutionEvidencePicker'],
    ['execution/execution-component-advance-section', 'ExecutionComponentAdvanceSection'],
    ['execution/execution-measurement-adjustment-section', 'ExecutionMeasurementAdjustmentSection'],
  ])
    mocks[`@/components/${file}`] = { [name]: name }
  const { default: Screen } = loadSource('app/(app)/queue/[serviceId]/execute.tsx', mocks)
  return {
    render: (next) => {
      if (next) query = next
      return harness.render(Screen)
    },
    retries: () => retries,
    submitted: () => submitted,
  }
}
const initialService = {
  id: 'remote',
  scaffoldId: 'scaffold',
  type: 'MONTAGEM',
  plannedQuantity: 60,
  plannedUnit: 'M3',
  quantityVersion: 0,
  executedQuantity: 0,
  progress: 0,
  status: 'NAO_INICIADO',
}
const byType = (type) => (node) => node.type === type
const byInput = (placeholder) => (node) =>
  node.props.placeholder === placeholder && typeof node.props.onChangeText === 'function'
const byButton = (label) => (node) =>
  node.type === 'Pressable' &&
  findElement(node, (child) => child.type === 'Text' && child.props.children === label)

test('the execution form queues Home defaults and preserves a manual shift through review and back', async () => {
  const defaults = {
    laborMode: 'FUNCTION_QUANTITY',
    crewId: null,
    functionQuantities: [{ workFunctionId: 'installer', quantity: 3 }],
    shiftId: 'night',
  }
  const screen = executionScreen(defaults)
  let tree = screen.render({ isPending: false, data: initialService })
  assert.equal(findElement(tree, byType('ShiftField')).props.value, 'night')
  findElement(tree, byInput('Ex.: 25')).props.onChangeText('50')
  const shift = findElement(tree, byType('ShiftField'))
  shift.props.onChange('day')
  shift.props.onChosen()
  tree = screen.render()
  findElement(tree, byButton('Revisar e finalizar')).props.onPress()
  tree = screen.render()
  findElement(tree, byButton('Voltar')).props.onPress()
  tree = screen.render()
  assert.equal(findElement(tree, byType('ShiftField')).props.value, 'day')
  assert.equal(findElement(tree, byType('ShiftField')).props.chosen, true)
  findElement(tree, byButton('Revisar e finalizar')).props.onPress()
  tree = screen.render()
  findElement(tree, byButton('Salvar lançamento')).props.onPress()
  await new Promise((resolve) => setImmediate(resolve))
  const entry = screen.submitted()?.payload.entry
  assert.equal(entry.shiftId, 'day')
  assert.equal(entry.laborMode, 'FUNCTION_QUANTITY')
  assert.deepEqual(entry.functionQuantities, defaults.functionQuantities)
  assert.equal(defaults.shiftId, 'night')
})

test('execution detail waits for data, offers retry on failure, and hides stale data after denial', async () => {
  const screen = executionScreen()
  let tree = screen.render()
  assert.ok(findElement(tree, byType('ActivityIndicator')))
  assert.equal(findElement(tree, byType('EmptyState')), undefined)
  tree = screen.render({
    isPending: false,
    isError: true,
    error: new Error('Sem acesso'),
    data: initialService,
  })
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

test('a customized Home crew is submitted without reintroducing removed crew members', async () => {
  const defaults = {
    laborMode: 'CREW',
    crewId: 'crew',
    memberEmployeeIds: ['ana', 'extra'],
    functionQuantities: [],
  }
  const screen = executionScreen(defaults, {
    crews: [
      { id: 'crew', name: 'Equipe A', members: [{ employeeId: 'ana' }, { employeeId: 'removed' }] },
    ],
  })
  let tree = screen.render({ isPending: false, data: initialService })
  findElement(tree, byInput('Ex.: 25')).props.onChangeText('50')
  tree = screen.render()
  findElement(tree, byButton('Revisar e finalizar')).props.onPress()
  tree = screen.render()
  findElement(tree, byButton('Salvar lançamento')).props.onPress()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(screen.submitted().payload.entry.memberEmployeeIds, ['ana', 'extra'])
  assert.deepEqual(defaults.memberEmployeeIds, ['ana', 'extra'])
})

for (const [label, geolocation, serviceType, allowed] of [
  ['missing GPS', {}, 'MONTAGEM', false],
  ['existing scaffold location', { hasLocation: true }, 'MONTAGEM', true],
  ['captured GPS', { value: { latitude: -6.4, longitude: -50.3 } }, 'MONTAGEM', true],
  ['dismantling without GPS', {}, 'DESMONTAGEM', true],
]) {
  test(`execution save handles ${label}`, async () => {
    const screen = executionScreen(null, { geolocation })
    let tree = screen.render({ isPending: false, data: { ...initialService, type: serviceType } })
    findElement(tree, byInput('Ex.: 25')).props.onChangeText('50')
    tree = screen.render()
    findElement(tree, byButton('Revisar e finalizar')).props.onPress()
    tree = screen.render()
    findElement(tree, byButton('Salvar lançamento')).props.onPress()
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(Boolean(screen.submitted()), allowed)
    if (!allowed) {
      tree = screen.render()
      assert.ok(
        findElement(
          tree,
          (node) =>
            node.type === 'Banner' &&
            node.props.description === 'Capture o GPS do andaime antes de salvar a montagem.',
        ),
      )
    }
  })
}

for (const mode of ['quantity', 'percentage']) {
  test(`a web revision requires an explicit ${mode} choice without erasing the typed progress`, () => {
    const screen = executionScreen()
    let tree = screen.render({ isPending: false, data: initialService })
    findElement(tree, byInput('Ex.: 25')).props.onChangeText('50')
    tree = screen.render()
    const revised = { ...initialService, quantityVersion: 1, plannedQuantity: 120 }
    tree = screen.render({ isPending: false, data: revised })
    assert.ok(
      findElement(
        tree,
        (node) => node.type === 'Banner' && node.props.title === 'A quantidade do serviço mudou',
      ),
    )
    assert.equal(findElement(tree, byInput('Ex.: 25')).props.value, '50')
    const label =
      mode === 'quantity' ? 'Manter a quantidade executada' : 'Manter o percentual executado'
    findElement(tree, byButton(label)).props.onPress()
    tree = screen.render()
    assert.equal(
      findElement(
        tree,
        (node) => node.type === 'Banner' && node.props.title === 'A quantidade do serviço mudou',
      ),
      undefined,
    )
    const input = mode === 'quantity' ? 'Ex.: 4.5' : 'Ex.: 25'
    assert.equal(findElement(tree, byInput(input)).props.value, mode === 'quantity' ? '30' : '50')
  })
}
