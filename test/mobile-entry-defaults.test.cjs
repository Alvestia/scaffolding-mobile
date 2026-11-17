const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadSource } = require('./helpers/load-source.cjs')
const { hookHarness, findElement, nativeMock } = require('./helpers/hook-harness.cjs')

const defaults = {
  laborMode: 'FUNCTION_QUANTITY',
  crewId: null,
  functionQuantities: [{ workFunctionId: 'installer', quantity: 3 }],
  shiftId: 'night',
}
const scope = { companyId: 'company', unitId: 'unit', contractId: 'contract' }

test('Home is compact and saves functions, shift and a customized crew restricted to the current contract', () => {
  const harness = hookHarness()
  let saved
  let shifts = [{ id: 'night', name: 'Noturno', startTime: '22:00', endTime: '06:00' }]
  const context = {
    ...scope,
    entryDefaults: null,
    setEntryDefaults: (value) => {
      saved = value
      context.entryDefaults = value
    },
  }
  const mocks = {
    react: harness.hooks,
    'react-native': nativeMock,
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/services/employees.service': {},
    '@tanstack/react-query': {
      useQuery: ({ queryKey }) => ({
        data:
          queryKey[0] === 'execute-employees'
            ? [
                { id: 'one', name: 'Ana', ...scope, active: true },
                { id: 'two', name: 'Bruna', ...scope, active: true },
                { id: 'extra', name: 'Carlos', ...scope, active: true },
                {
                  id: 'foreign',
                  name: 'Outro contrato',
                  ...scope,
                  contractId: 'other',
                  active: true,
                },
                { id: 'inactive', name: 'Inativo', ...scope, active: false },
              ]
            : [{ id: 'installer', name: 'Montador', code: 'M', active: true }],
      }),
    },
    '@/store/operational-context-store': { useOperationalContextStore: () => context },
    '@/store/connectivity-store': {
      useConnectivityStore: (select) => select({ isConnected: false }),
    },
    '@/hooks/use-contract-shifts': {
      useContractShifts: () => ({
        data: shifts,
        isSuccess: true,
      }),
    },
    '@/hooks/use-crews': {
      useCrews: () => ({
        data: [
          {
            id: 'crew',
            name: 'Equipe A',
            ...scope,
            isActive: true,
            members: [{ employeeId: 'one' }, { employeeId: 'two' }],
          },
          { id: 'foreign', name: 'Outro contrato', ...scope, contractId: 'other', isActive: true },
        ],
      }),
    },
    '@/services/work-functions.service': {},
  }
  for (const [file, name] of [
    ['button', 'Button'],
    ['select-field', 'SelectField'],
    ['text-field', 'TextField'],
    ['segmented-control', 'SegmentedControl'],
    ['selection-modal', 'SelectionModal'],
  ])
    mocks[`@/components/ui/${file}`] = { [name]: name }
  const { EntryDefaultsCard } = loadSource('components/home/entry-defaults-card.tsx', mocks)
  const render = () => harness.render(EntryDefaultsCard)
  let tree = render()
  assert.equal(
    findElement(tree, (node) => node.type === 'SegmentedControl'),
    undefined,
  )
  findElement(
    tree,
    (node) => node.props.accessibilityLabel === 'Ajustar padrão dos lançamentos',
  ).props.onPress()
  tree = render()
  const crewModal = findElement(
    tree,
    (node) => node.type === 'SelectionModal' && node.props.title === 'Equipe padrão',
  )
  assert.deepEqual(
    crewModal.props.options.map((item) => item.value),
    ['crew'],
  )
  findElement(tree, (node) => node.type === 'SegmentedControl').props.onChange('FUNCTION_QUANTITY')
  tree = render()
  findElement(
    tree,
    (node) => node.type === 'SelectionModal' && node.props.title === 'Funções padrão',
  ).props.onConfirm(['installer'])
  tree = render()
  findElement(tree, (node) => node.type === 'TextField').props.onChangeText('0')
  tree = render()
  findElement(
    tree,
    (node) => node.type === 'Button' && node.props.children === 'Salvar padrão',
  ).props.onPress()
  assert.equal(saved, undefined)
  tree = render()
  findElement(tree, (node) => node.type === 'TextField').props.onChangeText('4')
  tree = render()
  findElement(
    tree,
    (node) => node.type === 'SelectionModal' && node.props.title === 'Turno padrão',
  ).props.onSelect('night')
  tree = render()
  findElement(
    tree,
    (node) => node.type === 'Button' && node.props.children === 'Salvar padrão',
  ).props.onPress()
  assert.deepEqual(saved, {
    ...defaults,
    functionQuantities: [{ workFunctionId: 'installer', quantity: 4 }],
  })
  tree = render()
  assert.equal(
    findElement(tree, (node) => node.type === 'SegmentedControl'),
    undefined,
  )
  findElement(
    tree,
    (node) => node.props.accessibilityLabel === 'Ajustar padrão dos lançamentos',
  ).props.onPress()
  tree = render()
  findElement(tree, (node) => node.type === 'SegmentedControl').props.onChange('CREW')
  tree = render()
  findElement(
    tree,
    (node) => node.type === 'SelectionModal' && node.props.title === 'Equipe padrão',
  ).props.onSelect('crew')
  tree = render()
  findElement(tree, (node) => node.props.accessibilityLabel === 'Ver integrantes').props.onPress()
  tree = render()
  findElement(tree, (node) => node.props.accessibilityLabel === 'Remover Bruna').props.onPress()
  tree = render()
  const add = findElement(
    tree,
    (node) => node.type === 'SelectionModal' && node.props.title === 'Adicionar integrantes',
  )
  assert.deepEqual(
    add.props.options.map((item) => item.value),
    ['two', 'extra'],
  )
  add.props.onConfirm(['extra'])
  tree = render()
  findElement(
    tree,
    (node) => node.type === 'Button' && node.props.children === 'Salvar padrão',
  ).props.onPress()
  assert.deepEqual(saved.memberEmployeeIds, ['one', 'extra'])
  assert.equal(saved.crewId, 'crew')
  assert.equal(saved.shiftId, 'night')
  tree = render()
  assert.equal(
    findElement(tree, (node) => node.type === 'SegmentedControl'),
    undefined,
  )
  shifts = []
  findElement(
    tree,
    (node) => node.props.accessibilityLabel === 'Ajustar padrão dos lançamentos',
  ).props.onPress()
  tree = render()
  assert.equal(
    findElement(tree, (node) => node.type === 'SelectField' && node.props.label === 'Turno padrão'),
    undefined,
  )
  assert.equal(
    findElement(
      tree,
      (node) => node.type === 'SelectionModal' && node.props.title === 'Turno padrão',
    ),
    undefined,
  )
})

test('shift is hidden without a catalog and only a confirmed online empty catalog clears a stale choice', () => {
  for (const [isConnected, query, shouldClear] of [
    [true, { data: [], isSuccess: true }, true],
    [true, { isSuccess: false, isPending: true }, false],
    [true, { isSuccess: false, isError: true }, false],
    [false, { data: [], isSuccess: true }, false],
  ]) {
    const harness = hookHarness()
    let value = 'old-shift'
    const { ShiftField } = loadSource('components/shift/shift-field.tsx', {
      react: harness.hooks,
      '@/hooks/use-contract-shifts': { useContractShifts: () => query },
      '@/components/ui/select-field': { SelectField: 'SelectField' },
      '@/components/ui/selection-modal': { SelectionModal: 'SelectionModal' },
    })
    const tree = harness.render(ShiftField, {
      contractId: 'contract',
      unitId: 'unit',
      isConnected,
      startTime: '08:00',
      value,
      chosen: true,
      onChange: (next) => {
        value = next
      },
    })
    assert.equal(tree, null)
    assert.equal(value, shouldClear ? null : 'old-shift')
  }
})

test('entry defaults survive restart and remain isolated by user, unit and contract', async () => {
  const storage = new Map()
  const createStore = () =>
    loadSource('store/operational-context-store.ts', {
      '@/utils/zustand-middleware': require('zustand/middleware'),
      '@react-native-async-storage/async-storage': {
        getItem: async (key) => storage.get(key) ?? null,
        setItem: async (key, value) => {
          storage.set(key, value)
        },
        removeItem: async (key) => {
          storage.delete(key)
        },
      },
    }).useOperationalContextStore
  const store = createStore()
  await store.persist.rehydrate()
  store.getState().activateOwner({ id: 'user', tenantId: 'tenant' })
  store.getState().setScope(scope)
  const input = structuredClone(defaults)
  store.getState().setEntryDefaults(input)
  input.functionQuantities[0].quantity = 99
  assert.deepEqual(store.getState().entryDefaults, defaults)
  store.getState().setScope({ ...scope, contractDescription: 'Updated title' })
  assert.deepEqual(store.getState().entryDefaults, defaults)
  const reopened = createStore()
  await reopened.persist.rehydrate()
  assert.deepEqual(reopened.getState().entryDefaults, defaults)
  reopened.getState().setScope({ ...scope, contractId: 'another' })
  assert.equal(reopened.getState().entryDefaults, null)
  reopened.getState().setEntryDefaults(defaults)
  reopened.getState().setScope({ ...scope, unitId: 'another-unit' })
  assert.equal(reopened.getState().entryDefaults, null)
  reopened.getState().setEntryDefaults(defaults)
  reopened.getState().activateOwner({ id: 'another-user', tenantId: 'tenant' })
  assert.equal(reopened.getState().entryDefaults, null)
  reopened.getState().setEntryDefaults(defaults)
  reopened.getState().clearOwner()
  assert.equal(reopened.getState().entryDefaults, null)
})

test('defaults seed new entries, explicit no shift wins, and individual edits never change the saved default', () => {
  const harness = hookHarness()
  const { useEntryPreferences } = loadSource('hooks/use-entry-preferences.ts', {
    react: harness.hooks,
  })
  let saved = structuredClone(defaults),
    options = { contextKey: 'contract', resetKey: 0 }
  const render = () => harness.render(() => useEntryPreferences(saved, options))
  let form = render()
  assert.equal(form.shiftId, 'night')
  assert.equal(form.shiftChosen, true)
  assert.equal(form.functionQuantities[0].quantity, 3)
  form.setFunctionQuantities([{ workFunctionId: 'installer', quantity: 2 }])
  form.setShiftId(null)
  form.setShiftChosen(true)
  saved = { ...defaults, shiftId: 'day' }
  form = render()
  assert.equal(form.shiftId, null)
  assert.equal(form.functionQuantities[0].quantity, 2)
  assert.equal(saved.functionQuantities[0].quantity, 3)
  options = { ...options, resetKey: 1 }
  form = render()
  assert.equal(form.shiftId, 'day')
  assert.equal(form.functionQuantities[0].quantity, 3)
  saved = { ...defaults, shiftId: null }
  form = render()
  assert.equal(form.shiftChosen, true)
  assert.equal(form.shiftId, null)
  saved = null
  options = { contextKey: 'other-contract', resetKey: 1 }
  form = render()
  assert.equal(form.laborMode, 'UNASSIGNED')
  assert.equal(form.shiftChosen, false)
})

test('reopened drafts never receive Home defaults, including asynchronously loaded preferences', () => {
  const harness = hookHarness()
  const { useEntryPreferences } = loadSource('hooks/use-entry-preferences.ts', {
    react: harness.hooks,
  })
  let saved = defaults
  const render = () =>
    harness.render(() => useEntryPreferences(saved, { contextKey: 'draft', draft: true }))
  let form = render()
  assert.equal(form.laborMode, 'UNASSIGNED')
  assert.equal(form.shiftId, null)
  form.setShiftId('draft-shift')
  form.setShiftChosen(true)
  form.setLaborMode('CREW')
  form.setSelectedCrewId('draft-crew')
  form.setSelectedMemberIds(['draft-member'])
  saved = { ...defaults, shiftId: null }
  form = render()
  assert.equal(form.shiftId, 'draft-shift')
  assert.equal(form.selectedCrewId, 'draft-crew')
  assert.deepEqual(form.selectedMemberIds, ['draft-member'])
})

test('a mounted pristine tab receives new Home defaults but a filled form is preserved', () => {
  const harness = hookHarness()
  const { useEntryPreferences } = loadSource('hooks/use-entry-preferences.ts', {
    react: harness.hooks,
  })
  let saved = null,
    pristine = true
  const render = () =>
    harness.render(() => useEntryPreferences(saved, { contextKey: 'contract', pristine }))
  render()
  saved = defaults
  assert.equal(render().shiftId, 'night')
  pristine = false
  saved = { ...defaults, shiftId: 'day' }
  assert.equal(render().shiftId, 'night')
})

test('custom members survive edits, new entries and draft restoration without mutating Home preferences', () => {
  const harness = hookHarness()
  const { useEntryPreferences } = loadSource('hooks/use-entry-preferences.ts', {
    react: harness.hooks,
  })
  const saved = {
    ...defaults,
    laborMode: 'CREW',
    crewId: 'crew',
    memberEmployeeIds: ['one', 'extra'],
  }
  let resetKey = 0
  const render = () =>
    harness.render(() => useEntryPreferences(saved, { contextKey: 'contract', resetKey }))
  let form = render()
  assert.deepEqual(form.selectedMemberIds, ['one', 'extra'])
  form.markEdited()
  form.setSelectedMemberIds(['extra'])
  form = render()
  assert.deepEqual(form.selectedMemberIds, ['extra'])
  assert.deepEqual(saved.memberEmployeeIds, ['one', 'extra'])
  resetKey++
  form = render()
  assert.deepEqual(form.selectedMemberIds, ['one', 'extra'])
  form.setSelectedCrewId('other-crew')
  form = render()
  assert.equal(form.membersChosen, false)
  assert.deepEqual(form.selectedMemberIds, [])
  form.setSelectedMemberIds(['other-member'])
  assert.deepEqual(render().selectedMemberIds, ['other-member'])
})

test('a chosen shift survives remounting the field and late draft hydration', () => {
  const shifts = [
    { id: 'day', name: 'Day', startTime: '07:00', endTime: '17:00' },
    { id: 'night', name: 'Night', startTime: '22:00', endTime: '06:00' },
  ]
  for (const selected of ['night', null]) {
    const harness = hookHarness()
    let value = selected,
      chosen = true,
      writes = 0
    const { ShiftField } = loadSource('components/shift/shift-field.tsx', {
      react: harness.hooks,
      '@/hooks/use-contract-shifts': { useContractShifts: () => ({ data: shifts }) },
      '@/components/ui/select-field': { SelectField: 'SelectField' },
      '@/components/ui/selection-modal': { SelectionModal: 'SelectionModal' },
    })
    const render = () =>
      harness.render(ShiftField, {
        contractId: 'contract',
        unitId: 'unit',
        isConnected: true,
        startTime: '08:00',
        value,
        chosen,
        onChange: (next) => {
          value = next
          writes++
        },
        onChosen: () => {
          chosen = true
        },
      })
    render()
    assert.equal(writes, 0, 'a chosen shift must not be replaced by the time suggestion')
    const modal = findElement(render(), (node) => node.type === 'SelectionModal')
    modal.props.onSelect('night')
    assert.equal(value, 'night')
    assert.equal(chosen, true)
    render()
    chosen = false
    render()
    assert.equal(value, 'day', 'clearing Home defaults restores automatic shift suggestions')
    chosen = true
    value = selected
    writes = 0
    render()
    assert.equal(writes, 0, 'a late loaded draft choice must win in the same render')
  }
})
