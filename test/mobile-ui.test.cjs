const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadSource } = require('./helpers/load-source.cjs')
const { hookHarness, findElement, nativeMock } = require('./helpers/hook-harness.cjs')
const byType = (type) => (element) => element.type === type

test('single selection keeps typed search through renders and selects the only result', () => {
  const harness = hookHarness()
  let selected
  let closed = 0
  let dismissed = 0
  const { SelectionModal } = loadSource('components/ui/selection-modal.tsx', {
    react: harness.hooks,
    'react-native': nativeMock,
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) },
    '@/utils/focus': { blurActiveElement: () => dismissed++ },
  })
  const props = {
    visible: true,
    title: 'OS',
    options: [
      { value: 'one', label: 'OS-001' },
      { value: 'two', label: 'OS-002' },
    ],
    onClose: () => closed++,
    onSelect: (value) => {
      selected = value
    },
  }
  let tree = harness.render(SelectionModal, props)
  findElement(tree, byType('TextInput')).props.onChangeText('002')
  tree = harness.render(SelectionModal, { ...props, options: [...props.options] })
  assert.equal(findElement(tree, byType('TextInput')).props.value, '002')
  const list = findElement(tree, byType('FlatList'))
  assert.equal(list.props.data.length, 1)
  assert.equal(list.props.keyboardShouldPersistTaps, 'handled')
  assert.equal(findElement(tree, byType('KeyboardAvoidingView')).props.behavior, 'height')
  list.props.renderItem({ item: list.props.data[0] }).props.onPress()
  assert.equal(selected, 'two')
  assert.equal(closed, 1)
  assert.ok(dismissed > 0)
  harness.render(SelectionModal, { ...props, visible: false })
  tree = harness.render(SelectionModal, props)
  assert.equal(findElement(tree, byType('TextInput')).props.value, '')
})

test('multiple selection preserves draft and search when the parent supplies a new values array', () => {
  const harness = hookHarness()
  let confirmed
  const { SelectionModal } = loadSource('components/ui/selection-modal.tsx', {
    react: harness.hooks,
    'react-native': nativeMock,
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/utils/focus': { blurActiveElement() {} },
    '@/components/ui/button': { Button: 'Button' },
  })
  const props = {
    visible: true,
    multiple: true,
    title: 'Equipe',
    selectedValues: ['one'],
    options: [
      { value: 'one', label: 'Ana' },
      { value: 'two', label: 'Bruna' },
    ],
    onClose() {},
    onConfirm: (values) => {
      confirmed = values
    },
  }
  let tree = harness.render(SelectionModal, props)
  findElement(tree, byType('TextInput')).props.onChangeText('Bruna')
  tree = harness.render(SelectionModal, props)
  const list = findElement(tree, byType('FlatList'))
  list.props.renderItem({ item: props.options[1] }).props.onPress()
  tree = harness.render(SelectionModal, { ...props, selectedValues: ['one'] })
  assert.equal(findElement(tree, byType('TextInput')).props.value, 'Bruna')
  const confirm = findElement(
    tree,
    (element) => element.type === 'Button' && element.props.children === 'Aplicar selecao',
  )
  confirm.props.onPress()
  assert.deepEqual(confirmed, ['one', 'two'])
})

test('native navigation dismisses the device keyboard', () => {
  let dismissed = 0
  const { blurActiveElement } = loadSource('utils/focus.ts', {
    'react-native': { Platform: { OS: 'android' }, Keyboard: { dismiss: () => dismissed++ } },
  })
  blurActiveElement()
  assert.equal(dismissed, 1)
})

for (const failure of [null, 'download', 'refresh']) {
  test(`home closes progress after ${failure ?? 'successful update'} and keeps failures dismissible`, async () => {
    const harness = hookHarness()
    let finish
    let refreshed = false
    const operation = new Promise((resolve) => {
      finish = resolve
    })
    const mocks = {
      react: harness.hooks,
      'react-native': nativeMock,
      '@expo/vector-icons': { Ionicons: 'Icon' },
      'expo-router': { router: {} },
      'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
      '@/components/app/network-status-indicator': {
        NetworkStatusIndicator: 'NetworkStatusIndicator',
      },
      '@/components/ui/banner': { Banner: 'Banner' },
      '@/components/ui/button': { Button: 'Button' },
      '@/constants/brand-assets': { kaeferWordmark: 'logo' },
      '@/hooks/use-execution-queue': {
        useExecutionQueue: () => ({ data: [{ id: 'one' }], isLoading: false, isFetching: false }),
      },
      '@/providers/app-providers': { queryClient: {} },
      '@/store/auth-store': { useAuthStore: (select) => select({}) },
      '@/store/connectivity-store': {
        useConnectivityStore: (select) => select({ isConnected: true }),
      },
      '@/store/operational-context-store': {
        useOperationalContextStore: (select) =>
          select ? select({}) : { contractId: 'contract', unitId: 'unit' },
      },
      '@/store/sync-store': {
        useSyncStore: (select) =>
          select({
            pendingCount: 0,
            failedCount: 0,
            lastSyncAt: null,
            isSyncing: false,
            runManualSyncNow: async () => {
              await operation
              if (failure === 'download') throw new Error('Falha de rede')
            },
          }),
      },
      '@/services/manual-sync.service': {
        createInitialManualSyncSteps: () => [
          { key: 'outbox', label: 'Pendências', status: 'pending', progress: 0 },
        ],
      },
      '@/services/session-storage': { getActiveDeviceCredential() {} },
      '@/services/device-session.service': { revokeDeviceSession() {} },
      '@/utils/sync-query-cache': {
        invalidateSyncedQueries: async () => {
          refreshed = true
          if (failure === 'refresh') throw new Error('Falha ao atualizar a tela')
        },
      },
    }
    mocks['@/components/home/user-menu'] = { UserMenu: 'UserMenu' }
    mocks['@/components/home/entry-defaults-card'] = { EntryDefaultsCard: 'EntryDefaultsCard' }
    const Home = loadSource('app/(app)/(tabs)/index.tsx', mocks).default
    let tree = harness.render(Home)
    const update = findElement(
      tree,
      (element) =>
        element.type === 'Pressable' &&
        Boolean(
          findElement(
            element,
            (child) => child.type === 'Text' && child.props.children === 'Atualizar',
          ),
        ),
    )
    assert.ok(update)
    const pending = update.props.onPress()
    tree = harness.render(Home)
    assert.ok(
      findElement(
        tree,
        (element) => element.type === 'Text' && element.props.children === 'Atualização da base',
      ),
    )
    finish()
    await pending
    tree = harness.render(Home)
    assert.equal(
      findElement(
        tree,
        (element) => element.type === 'Text' && element.props.children === 'Atualização da base',
      ),
      undefined,
    )
    assert.equal(refreshed, failure !== 'download')
    const error = findElement(
      tree,
      (element) => element.type === 'Banner' && element.props.tone === 'danger',
    )
    assert.equal(Boolean(error), Boolean(failure))
    if (error) {
      error.props.action.props.onPress()
      tree = harness.render(Home)
      assert.equal(
        findElement(
          tree,
          (element) => element.type === 'Banner' && element.props.tone === 'danger',
        ),
        undefined,
      )
    }
  })
}
