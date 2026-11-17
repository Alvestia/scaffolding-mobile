const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadSource } = require('./helpers/load-source.cjs')
const { hookHarness, findElement, nativeMock } = require('./helpers/hook-harness.cjs')

const button = (tree, label) =>
  findElement(
    tree,
    (node) =>
      node.type === 'Pressable' &&
      findElement(node, (child) => child.type === 'Text' && child.props.children === label),
  )

test('Android exit preserves the session; logout is a separate action and navigation respects permissions', () => {
  let exited = 0,
    closed = 0,
    logout = 0,
    navigated
  const { UserMenu } = loadSource('components/home/user-menu.tsx', {
    'react-native': { ...nativeMock, BackHandler: { exitApp: () => exited++ } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-router': {
      router: {
        push: (path) => {
          navigated = path
        },
      },
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) },
  })
  const props = {
    visible: true,
    user: { name: 'Encarregado', permissions: [], roles: [] },
    onClose: () => closed++,
    onLogout: () => logout++,
    onSync() {},
    canSync: false,
  }
  const tree = UserMenu(props)
  assert.equal(button(tree, 'Inspeções'), undefined)
  assert.equal(button(tree, 'Meu dia'), undefined)
  assert.equal(button(tree, 'Atualizar base').props.disabled, true)
  button(tree, 'Sair do aplicativo').props.onPress()
  assert.equal(exited, 1)
  assert.equal(closed, 1)
  assert.equal(logout, 0)
  button(tree, 'Logout').props.onPress()
  assert.equal(logout, 1)
  assert.equal(exited, 1)
  button(tree, 'Unidade e contrato').props.onPress()
  assert.equal(navigated, '/(app)/context/unit')
  const privileged = UserMenu({
    ...props,
    user: { permissions: ['inspection:view', 'execution:create'] },
  })
  assert.ok(button(privileged, 'Inspeções'))
  assert.ok(button(privileged, 'Meu dia'))
})

test('Home opens the menu without logging out and only clears a field session after confirmation', async () => {
  const harness = hookHarness()
  const user = { name: 'Encarregado', accountType: 'FIELD', permissions: [] }
  let confirmation,
    cleared = 0,
    reset = 0,
    revoked = 0,
    destination
  const auth = (select) =>
    select({
      user,
      clearSession: async () => {
        cleared++
      },
    })
  auth.getState = () => ({ user })
  const mocks = {
    react: harness.hooks,
    'react-native': {
      ...nativeMock,
      Alert: {
        alert: (...args) => {
          confirmation = args
        },
      },
    },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-router': {
      router: {
        push: (value) => {
          destination = value
        },
        replace: (value) => {
          destination = value
        },
      },
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/components/app/network-status-indicator': {
      NetworkStatusIndicator: 'NetworkStatusIndicator',
    },
    '@/components/ui/banner': { Banner: 'Banner' },
    '@/components/ui/button': { Button: 'Button' },
    '@/components/home/entry-defaults-card': { EntryDefaultsCard: 'EntryDefaultsCard' },
    '@/components/home/user-menu': { UserMenu: 'UserMenu' },
    '@/constants/brand-assets': { kaeferWordmark: 'logo' },
    '@/hooks/use-execution-queue': { useExecutionQueue: () => ({ data: [] }) },
    '@/providers/app-providers': { queryClient: { clear() {} } },
    '@/store/auth-store': { useAuthStore: auth },
    '@/store/connectivity-store': {
      useConnectivityStore: (select) => select({ isConnected: true }),
    },
    '@/store/operational-context-store': {
      useOperationalContextStore: (select) =>
        select ? select({ reset: () => reset++ }) : { contractId: 'contract', unitId: 'unit' },
    },
    '@/store/sync-store': {
      useSyncStore: (select) =>
        select({ pendingCount: 1, failedCount: 0, lastSyncAt: null, isSyncing: false }),
    },
    '@/services/manual-sync.service': { createInitialManualSyncSteps: () => [] },
    '@/services/session-storage': { getActiveDeviceCredential: () => 'device-test-credential' },
    '@/services/device-session.service': { revokeDeviceSession: () => revoked++ },
    '@/utils/sync-query-cache': {},
  }
  const Home = loadSource('app/(app)/(tabs)/index.tsx', mocks).default
  let tree = harness.render(Home)
  const scroll = findElement(tree, (node) => node.type === 'ScrollView')
  for (const [label, path] of [
    ['Fila de execução', '/(app)/(tabs)/queue'],
    ['Novo andaime', '/(app)/(tabs)/emergency'],
    ['Desvios', '/(app)/(tabs)/deviations'],
  ]) {
    button(scroll, label).props.onPress()
    assert.equal(destination, path)
  }
  assert.equal(button(scroll, 'Inspeções'), undefined)
  user.permissions = ['inspection:view']
  tree = harness.render(Home)
  button(tree, 'Inspeções').props.onPress()
  assert.equal(destination, '/(app)/(tabs)/inspections')
  user.permissions = []
  tree = harness.render(Home)
  assert.equal(button(tree, 'Inspeções'), undefined)
  assert.equal(button(tree, 'Pendências offline'), undefined)
  findElement(
    tree,
    (node) => node.props.accessibilityLabel === 'Abrir menu do usuário',
  ).props.onPress()
  tree = harness.render(Home)
  const menu = findElement(tree, (node) => node.type === 'UserMenu')
  assert.equal(menu.props.visible, true)
  assert.equal(cleared, 0)
  menu.props.onLogout()
  assert.equal(confirmation[0], 'Confirmar logout')
  assert.match(confirmation[1], /novo código de ativação/)
  assert.match(confirmation[1], /sincronize/)
  assert.equal(cleared, 0)
  const actions = confirmation[2]
  assert.equal(actions[0].style, 'cancel')
  actions[0].onPress?.()
  assert.equal(cleared, 0)
  actions[1].onPress()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(cleared, 1)
  assert.equal(reset, 1)
  assert.equal(revoked, 1)
  assert.equal(destination, '/(auth)/login')
})
