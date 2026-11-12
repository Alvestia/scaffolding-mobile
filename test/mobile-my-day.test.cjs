// Days are cut on the phone clock; the field sites run on Brasília time.
process.env.TZ = 'America/Sao_Paulo'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadSource } = require('./helpers/load-source.cjs')
const { hookHarness, nativeMock, findElement } = require('./helpers/hook-harness.cjs')

const day = loadSource('utils/my-day.ts')

const activity = (patch = {}) => ({
  id: 'entry-1',
  clientMutationId: 'mutation-1',
  scaffoldId: 's1',
  scaffoldCode: 'AND-001',
  scaffoldPlace: 'Casa de bombas',
  serviceType: 'MONTAGEM',
  operationType: 'MONTAGEM',
  inputType: 'PERCENTUAL',
  inputValue: 30,
  unit: 'M3',
  startTime: '2026-11-12T11:00:00.000Z', // 08:00 in Brasília
  endTime: '2026-11-12T13:30:00.000Z',
  manHours: 10,
  workOrderCode: 'OS-10',
  approvalStatus: 'DRAFT',
  ...patch,
})

test('the week starts on Monday and future days cannot be chosen', () => {
  assert.equal(day.startOfWeek('2026-11-15'), '2026-11-09', 'Sunday belongs to the week that began on Monday')
  assert.equal(day.startOfWeek('2026-11-09'), '2026-11-09')
  assert.equal(day.startOfWeek('2026-01-01'), '2025-12-29', 'across the turn of the year')

  const week = day.weekDays('2026-11-12', '2026-11-12')
  assert.deepEqual(
    week.map((item) => item.weekday),
    ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'],
  )
  assert.deepEqual(
    week.map((item) => item.dayOfMonth),
    [9, 10, 11, 12, 13, 14, 15],
  )
  assert.equal(week.find((item) => item.isToday).key, '2026-11-12')
  assert.deepEqual(
    week.filter((item) => item.isFuture).map((item) => item.dayOfMonth),
    [13, 14, 15],
  )
})

test('titles, month calendar and the periods asked to the server', () => {
  assert.equal(day.monthTitle('2026-11-12'), 'Novembro de 2026')
  assert.equal(day.dayTitle('2026-11-12', '2026-11-12'), 'Hoje')
  assert.equal(day.dayTitle('2026-11-11', '2026-11-12'), 'Ontem')
  assert.equal(day.dayTitle('2026-11-07', '2026-11-12'), 'Sáb, 07/11')
  assert.equal(day.shiftMonth('2026-01-31', -1), '2025-12-01')

  // November 2026 begins on a Sunday: six empty cells before the 1st.
  const grid = day.monthGrid('2026-11-20')
  assert.equal(grid.length, 6)
  assert.deepEqual(grid[0].slice(0, 7), [null, null, null, null, null, null, '2026-11-01'])
  assert.equal(grid[5][0], '2026-11-30')
  assert.ok(grid.every((row) => row.length === 7))

  // One day of margin on each side: the server cuts days on São Paulo time.
  assert.deepEqual(day.weekRange('2026-11-12'), { from: '2026-11-08', to: '2026-11-16' })
  assert.deepEqual(day.monthRange('2026-11-20'), { from: '2026-10-31', to: '2026-12-01' })
})

test('an entry counts on the day it began, on the phone clock', () => {
  const late = activity({ id: 'late', startTime: '2026-11-13T02:30:00.000Z' }) // 23:30 on the 12th
  assert.equal(day.activityDayKey(late), '2026-11-12')
  assert.equal(day.countByDay([activity(), late]).get('2026-11-12'), 2)
})

test('entries still on the phone join the sent ones without showing twice', () => {
  const sent = [activity({ id: 'remote-1', clientMutationId: 'mutation-1' })]
  const onDevice = [
    activity({ id: 'local-1', clientMutationId: 'mutation-1', approvalStatus: null, syncStatus: 'syncing' }),
    activity({
      id: 'local-2',
      clientMutationId: 'mutation-2',
      startTime: '2026-11-12T10:00:00.000Z',
      approvalStatus: null,
      syncStatus: 'pending',
    }),
  ]
  const merged = day.mergeActivities(sent, onDevice)
  assert.deepEqual(
    merged.map((item) => item.id),
    ['local-2', 'remote-1'],
    'the server copy wins and the list follows the start time',
  )
})

test('the day is shown one card per scaffold, with its totals', () => {
  const activities = [
    activity({ id: 'a', scaffoldId: 's1', manHours: 10 }),
    activity({ id: 'b', scaffoldId: 's2', scaffoldCode: 'AND-002', startTime: '2026-11-12T14:00:00.000Z', manHours: 2.5 }),
    activity({ id: 'c', scaffoldId: 's1', startTime: '2026-11-12T17:00:00.000Z', manHours: null }),
    activity({ id: 'other-day', startTime: '2026-11-10T12:00:00.000Z' }),
  ]
  const scaffolds = day.scaffoldsOfDay(activities, '2026-11-12')
  assert.deepEqual(
    scaffolds.map((item) => [item.scaffoldCode, item.activities.map((entry) => entry.id)]),
    [
      ['AND-001', ['a', 'c']],
      ['AND-002', ['b']],
    ],
  )
  assert.deepEqual(day.dayTotals(scaffolds), { scaffolds: 2, entries: 3, manHours: 12.5 })
})

test('each entry reads as operation, advance, time and status', () => {
  assert.equal(day.operationLabel('DESMONTAGEM'), 'Desmontagem')
  assert.equal(day.advanceLabel(activity()), '30%')
  assert.equal(day.advanceLabel(activity({ inputType: 'QUANTIDADE', inputValue: 12.345, unit: 'M3' })), '12,35 m3')
  assert.equal(day.timeRangeLabel(activity()), '08:00 – 10:30')
  assert.equal(day.timeRangeLabel(activity({ endTime: null })), 'desde 08:00')

  assert.deepEqual(day.activityStatus(activity({ approvalStatus: 'APPROVED' })), { label: 'Aprovado', tone: 'success' })
  assert.deepEqual(day.activityStatus(activity({ approvalStatus: 'RETURNED' })), { label: 'Devolvido', tone: 'danger' })
  assert.equal(day.activityStatus(activity({ approvalStatus: 'DRAFT' })).label, 'Enviado')
  assert.deepEqual(day.activityStatus(activity({ syncStatus: 'pending' })), { label: 'Aguardando envio', tone: 'warning' })
  assert.deepEqual(day.activityStatus(activity({ syncStatus: 'conflict' })), { label: 'Erro no envio', tone: 'danger' })
})

function myDayService({ outbox = [], cached = [], local = [], store = {} } = {}) {
  const gets = []
  const service = loadSource('services/my-day.service.ts', {
    '@/api/client': {
      api: {
        get: async (url, config) => {
          gets.push({ url, config })
          return { data: { items: [], truncated: false } }
        },
      },
    },
    '@/database/repositories/outbox-repository': { outboxRepository: { listAll: async () => outbox } },
    '@/database/repositories/queue-cache-repository': { queueCacheRepository: { listByScope: async () => cached } },
    '@/database/repositories/local-scaffold-service-repository': {
      localScaffoldServiceRepository: { listPendingByScope: async () => local },
    },
    '@/services/reference-cache.service': {
      getReferenceCache: async (key) => store[key] ?? null,
      setReferenceCache: async (key, value) => {
        store[key] = value
      },
    },
    '@/services/offline-crypto.service': {},
    '@/security/offline-owner': {},
  })
  return { service, gets, store }
}

const scope = { contractId: 'c1', unitId: 'u1' }

test('the server is asked for the caller entries of the selected contract', async () => {
  const { service, gets } = myDayService()
  await service.fetchMyExecutionEntries(scope, { from: '2026-11-08', to: '2026-11-16' })
  assert.equal(gets[0].url, '/execution-entries/mine')
  assert.deepEqual(gets[0].config.params, { from: '2026-11-08', to: '2026-11-16' })
  assert.equal(gets[0].config.headers['X-Selected-Contract-Id'], 'c1')
  assert.equal(gets[0].config.headers['X-Selected-Unit-Id'], 'u1')

  const row = {
    id: 'r1',
    clientMutationId: 'm1',
    scaffoldId: 's1',
    scaffoldServiceId: 'svc-1',
    operationType: 'MONTAGEM',
    inputType: 'QUANTIDADE',
    inputValue: 4,
    effectiveQuantity: 4,
    basisUnit: null,
    startTime: '2026-11-12T11:00:00.000Z',
    endTime: '2026-11-12T12:00:00.000Z',
    manHours: 3,
    crewSize: 3,
    approvalStatus: 'PENDING_PLANNER',
    scaffold: { code: 'AND-001', description: 'Descrição', location: null },
    scaffoldService: { type: 'MONTAGEM', plannedUnit: 'M2' },
    workOrder: { code: 'OS-1' },
  }
  const mapped = service.rowToActivity(row)
  assert.equal(mapped.scaffoldPlace, 'Descrição', 'description when there is no location')
  assert.equal(mapped.unit, 'M2', 'planned unit when the entry has no basis unit')
  assert.equal(mapped.workOrderCode, 'OS-1')
  assert.equal(service.rowToActivity({ ...row, startTime: null }), null)
})

test('entries on the phone take the scaffold from the cached queue and keep only this contract', async () => {
  const execution = (localId, patch = {}) => ({
    localId,
    entityType: 'execution_entry',
    contractId: 'c1',
    unitId: 'u1',
    syncStatus: 'pending',
    idempotencyKey: `key-${localId}`,
    payload: {
      entry: {
        scaffoldServiceId: 'svc-1',
        operationType: 'MONTAGEM',
        inputType: 'PERCENTUAL',
        inputValue: 20,
        startTime: '2026-11-12T11:00:00.000Z',
        endTime: '2026-11-12T12:00:00.000Z',
      },
      scaffoldId: 's1',
    },
    ...patch,
  })
  const { service } = myDayService({
    outbox: [
      execution('local-1'),
      execution('other-contract', { contractId: 'c2' }),
      execution('deviation', { entityType: 'operational_deviation' }),
      execution('unknown-service', {
        payload: { entry: { ...execution('x').payload.entry, scaffoldServiceId: 'svc-gone' }, scaffoldId: 's9' },
      }),
    ],
    cached: [
      {
        id: 'svc-1',
        scaffoldId: 's1',
        type: 'MONTAGEM',
        plannedUnit: 'M3',
        scaffold: { id: 's1', code: 'AND-001', location: 'Pátio' },
        workOrder: { id: 'w1', code: 'OS-7' },
      },
    ],
  })

  const activities = await service.listDeviceActivities(scope)
  assert.deepEqual(
    activities.map((item) => [item.id, item.scaffoldCode, item.clientMutationId]),
    [
      ['local-1', 'AND-001', 'key-local-1'],
      ['unknown-service', 'Andaime', 'key-unknown-service'],
    ],
  )
  assert.equal(activities[0].scaffoldPlace, 'Pátio')
  assert.equal(activities[0].workOrderCode, 'OS-7')
  assert.equal(activities[0].syncStatus, 'pending')
  assert.equal(activities[1].scaffoldId, 's9', 'grouped by the scaffold even without the cached queue')
})

test('only the last periods seen are kept for offline use', async () => {
  const { service, store } = myDayService()
  for (let week = 0; week < 10; week += 1) {
    await service.cacheMyActivities(scope, { from: `w${week}`, to: 'end' }, [])
    // Distinct times so the newest ones are the ones kept.
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  const kept = Object.keys(store['my-day:c1:u1'])
  assert.equal(kept.length, 8)
  assert.ok(!kept.includes('w0:end') && !kept.includes('w1:end'))
  assert.ok(await service.getCachedMyActivities(scope, { from: 'w9', to: 'end' }))
  assert.equal(await service.getCachedMyActivities(scope, { from: 'w0', to: 'end' }), null)
})

function myDayHook({ connected = true, fetchError = null, cached = null } = {}) {
  const calls = { cached: [], fetched: 0 }
  const { useMyDay } = loadSource('hooks/use-my-day.ts', {
    '@tanstack/react-query': { useQuery: (options) => options },
    '@/store/auth-store': {
      useAuthStore: (selector) => selector({ accessToken: 'token', isHydrated: true }),
    },
    '@/store/connectivity-store': {
      useConnectivityStore: (selector) => selector({ isConnected: connected }),
    },
    '@/services/my-day.service': {
      listDeviceActivities: async () => [
        activity({ id: 'local', clientMutationId: 'm-local', approvalStatus: null, syncStatus: 'pending' }),
      ],
      fetchMyExecutionEntries: async () => {
        calls.fetched += 1
        if (fetchError) throw fetchError
        return { items: [{ id: 'remote' }], truncated: false }
      },
      rowToActivity: (row) => activity({ id: row.id, clientMutationId: 'm-remote' }),
      cacheMyActivities: async (_scope, _range, activities) => {
        calls.cached.push(activities)
      },
      getCachedMyActivities: async () => cached,
    },
  })
  const query = useMyDay(scope, { from: '2026-11-08', to: '2026-11-16' })
  return { query, calls }
}

test('online, the sent entries are read, kept on the phone and joined with the pending ones', async () => {
  const { query, calls } = myDayHook()
  assert.equal(query.enabled, true)
  const data = await query.queryFn()
  assert.equal(data.live, true)
  assert.deepEqual(
    data.activities.map((item) => item.id).sort(),
    ['local', 'remote'],
  )
  assert.deepEqual(
    calls.cached[0].map((item) => item.id),
    ['remote'],
    'only the sent entries are kept; the phone ones are read from the outbox',
  )
})

test('offline, or with the server down, the kept copy is shown with the pending entries', async () => {
  const kept = { fetchedAt: '2026-11-12T12:00:00.000Z', activities: [activity({ id: 'kept', clientMutationId: 'm-kept' })] }

  const offline = myDayHook({ connected: false, cached: kept })
  const offlineData = await offline.query.queryFn()
  assert.equal(offline.calls.fetched, 0)
  assert.equal(offlineData.live, false)
  assert.equal(offlineData.savedAt, kept.fetchedAt)
  assert.deepEqual(offlineData.activities.map((item) => item.id).sort(), ['kept', 'local'])

  const serverDown = myDayHook({
    fetchError: Object.assign(new Error('Network Error'), { isAxiosError: true }),
  })
  const downData = await serverDown.query.queryFn()
  assert.equal(downData.live, false)
  assert.equal(downData.savedAt, null)
  assert.deepEqual(downData.activities.map((item) => item.id), ['local'])

  const denied = myDayHook({
    fetchError: Object.assign(new Error('Forbidden'), { isAxiosError: true, response: { status: 403 } }),
  })
  await assert.rejects(denied.query.queryFn(), /Forbidden/, 'a refusal is not hidden behind the copy')
})

function renderScreen(activities = []) {
  const harness = hookHarness()
  let refetched = 0
  const Screen = loadSource('app/(app)/(tabs)/my-day.tsx', {
    react: { ...harness.hooks, useCallback: (callback) => callback },
    'react-native': { ...nativeMock, RefreshControl: 'RefreshControl' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { router: { push: () => {} }, useFocusEffect: (callback) => callback() },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/components/app/network-status-indicator': { NetworkStatusIndicator: 'NetworkStatusIndicator' },
    '@/components/my-day/month-picker-modal': { MonthPickerModal: 'MonthPickerModal' },
    '@/components/ui/banner': { Banner: 'Banner' },
    '@/components/ui/empty-state': { EmptyState: 'EmptyState' },
    '@/components/ui/status-badge': { StatusBadge: 'StatusBadge' },
    '@/store/operational-context-store': {
      useOperationalContextStore: () => ({ contractId: 'c1', unitId: 'u1' }),
    },
    '@/hooks/use-my-day': {
      useMyDay: (_scope, _range, options = {}) => ({
        data: options.enabled === false ? undefined : { activities, live: true, savedAt: null, truncated: false },
        isLoading: false,
        isRefetching: false,
        error: null,
        refetch: async () => {
          refetched += 1
        },
      }),
    },
  }).default
  return { render: () => harness.render(Screen), refetched: () => refetched }
}

const texts = (element) => {
  if (element == null || typeof element === 'boolean') return []
  if (typeof element === 'string' || typeof element === 'number') return [String(element)]
  if (Array.isArray(element)) return element.flatMap(texts)
  return texts(element.props?.children)
}
// The selected day is filled with the brand ink.
const isSelected = (card) => card.props.style.some((style) => style && style.backgroundColor === '#2C414A')
const byLabel = (label) => (element) => element.props?.accessibilityLabel === label
const dayCards = (tree) => {
  const strip = []
  const walk = (element) => {
    if (!element || typeof element !== 'object') return
    if (Array.isArray(element)) return element.forEach(walk)
    if (element.type === 'Pressable' && /lançamento/.test(element.props?.accessibilityLabel ?? '')) strip.push(element)
    walk(element.props?.children)
  }
  walk(tree)
  return strip
}

test('the tab opens on today, shows the week as cards and reads again on return', () => {
  const todayKey = day.dateKey(new Date())
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 0).toISOString()
  const screen = renderScreen([
    activity({ id: 'a', startTime: start, endTime: null }),
    activity({ id: 'b', startTime: start, endTime: null, scaffoldId: 's2', scaffoldCode: 'AND-002' }),
  ])
  const tree = screen.render()
  assert.ok(screen.refetched() >= 1, 'read again when the tab gets focus')

  const cards = dayCards(tree)
  assert.equal(cards.length, 7)
  const weekdays = cards.map((card) => texts(card)[0])
  assert.deepEqual(weekdays, ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'])
  const todayCard = cards.find((card) => card.key === todayKey)
  assert.match(todayCard.props.accessibilityLabel, /2 lançamentos$/)
  assert.ok(isSelected(todayCard), 'today starts selected')
  assert.equal(cards.filter(isSelected).length, 1)
  for (const card of cards) {
    assert.equal(Boolean(card.props.disabled), card.key > todayKey, 'only future days are blocked')
  }

  assert.ok(texts(tree).includes('Hoje'))
  assert.ok(texts(tree).includes('AND-001') && texts(tree).includes('AND-002'))
  assert.equal(findElement(tree, byLabel('Próxima semana')).props.disabled, true)
})

test('going back a week opens the same weekday and offers the way back to today', () => {
  const screen = renderScreen()
  let tree = screen.render()
  findElement(tree, byLabel('Semana anterior')).props.onPress()
  tree = screen.render()

  const todayKey = day.dateKey(new Date())
  const lastWeek = day.addDays(todayKey, -7)
  const selected = dayCards(tree).find(isSelected)
  assert.equal(selected.key, lastWeek)
  assert.equal(findElement(tree, byLabel('Próxima semana')).props.disabled, false)
  assert.ok(texts(tree).includes('Voltar para hoje'))
  assert.equal(findElement(tree, (element) => element.type === 'EmptyState').props.title, 'Nenhuma atividade neste dia')
})

test('the month calendar blocks the future and marks the days with entries', () => {
  const { MonthPickerModal } = loadSource('components/my-day/month-picker-modal.tsx', {
    'react-native': nativeMock,
    '@expo/vector-icons': { Ionicons: 'Icon' },
  })
  const tree = MonthPickerModal({
    visible: true,
    monthKey: '2026-11-01',
    selectedKey: '2026-11-12',
    todayKey: '2026-11-12',
    counts: new Map([['2026-11-10', 2]]),
    loading: false,
    onChangeMonth: () => {},
    onSelect: () => {},
    onClose: () => {},
  })
  assert.equal(findElement(tree, byLabel('Próximo mês')).props.disabled, true, 'no month after the current one')

  const days = []
  const walk = (element) => {
    if (!element || typeof element !== 'object') return
    if (Array.isArray(element)) return element.forEach(walk)
    if (element.type === 'Pressable' && /^\d{4}-/.test(element.key ?? '')) days.push(element)
    walk(element.props?.children)
  }
  walk(tree)
  assert.equal(days.length, 30)
  assert.equal(days.find((item) => item.key === '2026-11-13').props.disabled, true)
  assert.equal(days.find((item) => item.key === '2026-11-12').props.disabled, false)
  const dotOf = (key) => {
    const dot = React_children(days.find((item) => item.key === key))[1]
    return dot.props.style.filter(Boolean)
  }
  assert.equal(dotOf('2026-11-10').length, 2, 'a day with entries is marked')
  assert.equal(dotOf('2026-11-11').length, 1)
})

function React_children(element) {
  return require('react').Children.toArray(element.props.children)
}
