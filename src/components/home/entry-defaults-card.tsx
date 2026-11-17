import { useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/ui/select-field'
import { TextField } from '@/components/ui/text-field'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { SelectionModal } from '@/components/ui/selection-modal'
import { useCrews } from '@/hooks/use-crews'
import { useContractShifts } from '@/hooks/use-contract-shifts'
import { useOperationalContextStore } from '@/store/operational-context-store'
import { useConnectivityStore } from '@/store/connectivity-store'
import { fetchWorkFunctions, getCachedWorkFunctions } from '@/services/work-functions.service'
import { fetchEmployees, getCachedEmployees } from '@/services/employees.service'
import { canUseOfflineFallback } from '@/utils/offline-fallback'
import { copyEntryDefaults, type EntryDefaults } from '@/types/entry-defaults'
import { colors, radius, spacing } from '@/constants/theme'

const AUTO_SHIFT = '__auto__'
const NO_SHIFT = '__none__'

export function EntryDefaultsCard() {
  const context = useOperationalContextStore()
  const isConnected = useConnectivityStore((state) => state.isConnected)
  const [draft, setDraft] = useState(() => copyEntryDefaults(context.entryDefaults))
  const [expanded, setExpanded] = useState(false)
  const [rosterExpanded, setRosterExpanded] = useState(false)
  const [picker, setPicker] = useState<'crew' | 'members' | 'functions' | 'shift' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const crewsQuery = useCrews(context)
  const shiftsQuery = useContractShifts(context.contractId, context.unitId, isConnected)
  const employeesQuery = useQuery({
    queryKey: ['execute-employees', context.contractId, context.unitId, isConnected],
    enabled: Boolean(
      context.contractId && context.unitId && expanded && draft.laborMode === 'CREW',
    ),
    queryFn: async () => {
      if (!context.contractId || !context.unitId) return []
      const scope = { contractId: context.contractId, unitId: context.unitId }
      if (!isConnected) return getCachedEmployees(scope)
      try {
        return await fetchEmployees(scope)
      } catch (error) {
        if (!canUseOfflineFallback(error)) throw error
        const cached = await getCachedEmployees(scope)
        if (cached.length) return cached
        throw error
      }
    },
  })
  const functionsQuery = useQuery({
    queryKey: ['execute-work-functions', context.contractId, context.unitId, isConnected],
    enabled: Boolean(context.contractId && context.unitId),
    queryFn: async () => {
      if (!context.contractId || !context.unitId) return []
      const scope = { contractId: context.contractId, unitId: context.unitId }
      if (!isConnected) return getCachedWorkFunctions(scope)
      try {
        return await fetchWorkFunctions(scope)
      } catch (error) {
        if (!canUseOfflineFallback(error)) throw error
        const cached = await getCachedWorkFunctions(scope)
        if (cached.length) return cached
        throw error
      }
    },
  })
  const crews = crewsQuery.isError
    ? []
    : (crewsQuery.data ?? []).filter(
        (crew) =>
          crew.isActive && crew.contractId === context.contractId && crew.unitId === context.unitId,
      )
  const functions = functionsQuery.isError
    ? []
    : (functionsQuery.data ?? []).filter((item) => item.active)
  const shifts = shiftsQuery.isError ? [] : (shiftsQuery.data ?? [])
  const selectedCrew = crews.find((crew) => crew.id === draft.crewId)
  const selectedShift = shifts.find((shift) => shift.id === draft.shiftId)
  const employees = employeesQuery.isError
    ? []
    : (employeesQuery.data ?? []).filter(
        (employee) =>
          employee.active !== false &&
          employee.unitId === context.unitId &&
          employee.contractId === context.contractId,
      )
  const memberIds =
    draft.memberEmployeeIds ?? (selectedCrew?.members ?? []).map((member) => member.employeeId)
  const availableEmployees = employees.filter((employee) => !memberIds.includes(employee.id))
  const saved = context.entryDefaults
  const savedCrew = crews.find((crew) => crew.id === saved?.crewId)
  const savedShift = shifts.find((shift) => shift.id === saved?.shiftId)
  const summary = !saved
    ? shifts.length
      ? 'Definir equipe ou efetivo e turno'
      : 'Definir equipe ou efetivo'
    : [
        saved.laborMode === 'CREW'
          ? `${savedCrew?.name ?? 'Equipe'} · ${(saved.memberEmployeeIds ?? savedCrew?.members ?? []).length} pessoas`
          : saved.laborMode === 'FUNCTION_QUANTITY'
            ? `${saved.functionQuantities.reduce((total, item) => total + item.quantity, 0)} pessoas por função`
            : 'Sem efetivo',
        !shifts.length
          ? null
          : saved.shiftId === undefined
            ? 'Turno pelo horário'
            : saved.shiftId === null
              ? 'Sem turno'
              : (savedShift?.name ?? 'Turno salvo'),
      ]
        .filter(Boolean)
        .join(' • ')
  const change = (patch: Partial<EntryDefaults>) => {
    setDraft((current) => ({ ...current, ...patch }))
    setMessage(null)
    setError(null)
  }
  const save = () => {
    if (draft.laborMode === 'CREW' && !selectedCrew) {
      setError('Selecione uma equipe disponível neste contrato.')
      return
    }
    if (
      draft.laborMode === 'CREW' &&
      (!memberIds.length ||
        memberIds.some((id) => !employees.some((employee) => employee.id === id)))
    ) {
      setError(
        'Selecione ao menos um integrante ativo deste contrato. Aguarde o carregamento ou atualize a base se necessário.',
      )
      return
    }
    if (
      draft.laborMode === 'FUNCTION_QUANTITY' &&
      (!draft.functionQuantities.length ||
        draft.functionQuantities.some(
          (item) =>
            !Number.isInteger(item.quantity) ||
            item.quantity < 1 ||
            !functions.some((fn) => fn.id === item.workFunctionId),
        ))
    ) {
      setError('Selecione as funções disponíveis e informe quantidades inteiras maiores que zero.')
      return
    }
    if (shifts.length && draft.shiftId && !selectedShift) {
      setError('Selecione um turno disponível neste contrato.')
      return
    }
    context.setEntryDefaults(
      copyEntryDefaults({
        ...draft,
        shiftId:
          isConnected && shiftsQuery.isSuccess && shifts.length === 0 ? undefined : draft.shiftId,
        crewId: draft.laborMode === 'CREW' ? draft.crewId : null,
        ...(draft.laborMode === 'CREW'
          ? { memberEmployeeIds: [...memberIds] }
          : { memberEmployeeIds: undefined }),
        functionQuantities: draft.laborMode === 'FUNCTION_QUANTITY' ? draft.functionQuantities : [],
      }),
    )
    setError(null)
    setMessage('Padrão salvo para os próximos lançamentos deste contrato.')
    setExpanded(false)
  }

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ajustar padrão dos lançamentos"
        accessibilityState={{ expanded }}
        onPress={() => {
          if (!expanded) {
            setDraft(copyEntryDefaults(context.entryDefaults))
            setRosterExpanded(false)
            setError(null)
            setMessage(null)
          }
          setExpanded((value) => !value)
        }}
        style={styles.summary}
      >
        <Ionicons name="options-outline" size={18} color={colors.primaryStrong} />
        <View style={styles.summaryText}>
          <Text style={styles.title}>Padrão dos lançamentos</Text>
          <Text numberOfLines={2} style={styles.description}>
            {summary}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textMuted}
        />
      </Pressable>
      {message && !expanded ? (
        <Text accessibilityRole="alert" style={styles.message}>
          {message}
        </Text>
      ) : null}
      {expanded ? (
        <View style={styles.editor}>
          <Text style={styles.description}>
            Ajuste a composição{shifts.length ? ' e o turno' : ''} dos próximos lançamentos. Você
            pode alterar em cada atividade ou desvio.
          </Text>
          <SegmentedControl
            value={draft.laborMode}
            onChange={(laborMode) => change({ laborMode })}
            options={[
              { value: 'CREW', label: 'Equipe' },
              { value: 'FUNCTION_QUANTITY', label: 'Funções' },
              { value: 'UNASSIGNED', label: 'Sem efetivo' },
            ]}
          />
          {draft.laborMode === 'CREW' ? (
            <SelectField
              label="Equipe padrão"
              placeholder="Selecionar equipe"
              value={selectedCrew?.name ?? (draft.crewId ? 'Equipe indisponível' : null)}
              helper="A composição ajustada aqui será usada nos próximos lançamentos."
              error={crewsQuery.isError ? 'Não foi possível carregar as equipes.' : undefined}
              onPress={() => setPicker('crew')}
            />
          ) : null}
          {draft.laborMode === 'CREW' && selectedCrew ? (
            <View style={styles.fields}>
              <View style={styles.rosterHeader}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Ver integrantes"
                  accessibilityState={{ expanded: rosterExpanded }}
                  onPress={() => setRosterExpanded((value) => !value)}
                  style={styles.rosterToggle}
                >
                  <Ionicons name="people-outline" size={16} color={colors.primaryStrong} />
                  <Text style={styles.description}>{memberIds.length} integrantes</Text>
                  <Ionicons
                    name={rosterExpanded ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={colors.textMuted}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Adicionar integrantes"
                  disabled={!availableEmployees.length}
                  onPress={() => setPicker('members')}
                  style={[styles.iconButton, !availableEmployees.length && styles.disabled]}
                >
                  <Ionicons name="add" size={18} color={colors.primary} />
                </Pressable>
              </View>
              {employeesQuery.isError ? (
                <Text style={styles.error}>Não foi possível carregar os integrantes.</Text>
              ) : null}
              {rosterExpanded
                ? memberIds.map((id) => {
                    const employee = employees.find((person) => person.id === id)
                    return (
                      <View key={id} style={styles.memberRow}>
                        <View style={styles.summaryText}>
                          <Text style={styles.memberName}>
                            {employee?.name ?? 'Integrante indisponível'}
                          </Text>
                          {employee ? (
                            <Text style={styles.description}>
                              {[employee.registrationCode, employee.role]
                                .filter(Boolean)
                                .join(' • ')}
                            </Text>
                          ) : null}
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remover ${employee?.name ?? 'integrante'}`}
                          onPress={() =>
                            change({
                              memberEmployeeIds: memberIds.filter((member) => member !== id),
                            })
                          }
                          style={styles.iconButton}
                        >
                          <Ionicons name="close" size={16} color={colors.danger} />
                        </Pressable>
                      </View>
                    )
                  })
                : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => change({ memberEmployeeIds: undefined })}
                style={styles.restoreButton}
              >
                <Text style={styles.link}>Restaurar integrantes da equipe</Text>
              </Pressable>
            </View>
          ) : null}
          {draft.laborMode === 'FUNCTION_QUANTITY' ? (
            <View style={styles.fields}>
              <Button variant="secondary" onPress={() => setPicker('functions')}>
                Selecionar funções
              </Button>
              {functionsQuery.isError ? (
                <Text style={styles.error}>Não foi possível carregar as funções.</Text>
              ) : null}
              {draft.functionQuantities.map((item) => (
                <TextField
                  key={item.workFunctionId}
                  label={
                    functions.find((fn) => fn.id === item.workFunctionId)?.name ??
                    'Função indisponível'
                  }
                  keyboardType="number-pad"
                  value={item.quantity ? String(item.quantity) : ''}
                  placeholder="Quantidade de pessoas"
                  onChangeText={(text) =>
                    change({
                      functionQuantities: draft.functionQuantities.map((fn) =>
                        fn.workFunctionId === item.workFunctionId
                          ? { ...fn, quantity: Number(text.replace(/\D/g, '')) }
                          : fn,
                      ),
                    })
                  }
                />
              ))}
            </View>
          ) : null}
          {shifts.length > 0 ? (
            <SelectField
              label="Turno padrão"
              placeholder="Sugerir pelo horário"
              value={
                draft.shiftId === undefined
                  ? 'Sugerir pelo horário'
                  : draft.shiftId === null
                    ? 'Sem turno'
                    : (selectedShift?.name ?? 'Turno indisponível')
              }
              error={shiftsQuery.isError ? 'Não foi possível carregar os turnos.' : undefined}
              onPress={() => setPicker('shift')}
            />
          ) : null}
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          {message ? (
            <Text accessibilityRole="alert" style={styles.description}>
              {message}
            </Text>
          ) : null}
          <Button onPress={save}>Salvar padrão</Button>
          {context.entryDefaults ? (
            <Button
              variant="secondary"
              onPress={() => {
                context.setEntryDefaults(null)
                setDraft(copyEntryDefaults())
                setError(null)
                setExpanded(false)
                setMessage(
                  'Padrão removido. Os próximos lançamentos começam sem efetivo e sugerem turno pelo horário.',
                )
              }}
            >
              Limpar padrão
            </Button>
          ) : null}
        </View>
      ) : null}
      <SelectionModal
        visible={picker === 'crew'}
        title="Equipe padrão"
        options={crews.map((crew) => ({ value: crew.id, label: crew.name }))}
        selectedValue={draft.crewId}
        onSelect={(crewId) => {
          change({ crewId, memberEmployeeIds: undefined })
          setPicker(null)
        }}
        onClose={() => setPicker(null)}
      />
      <SelectionModal
        visible={picker === 'members'}
        title="Adicionar integrantes"
        multiple
        options={availableEmployees.map((employee) => ({
          value: employee.id,
          label: employee.name,
          sublabel: [employee.registrationCode, employee.role].filter(Boolean).join(' • '),
        }))}
        selectedValues={[]}
        confirmLabel="Adicionar à composição"
        onConfirm={(ids) => {
          change({ memberEmployeeIds: [...new Set([...memberIds, ...ids])] })
          setRosterExpanded(true)
          setPicker(null)
        }}
        onClose={() => setPicker(null)}
      />
      <SelectionModal
        visible={picker === 'functions'}
        title="Funções padrão"
        multiple
        options={functions.map((fn) => ({ value: fn.id, label: fn.name, sublabel: fn.code }))}
        selectedValues={draft.functionQuantities.map((fn) => fn.workFunctionId)}
        onConfirm={(ids) => {
          change({
            functionQuantities: ids.map(
              (id) =>
                draft.functionQuantities.find((fn) => fn.workFunctionId === id) ?? {
                  workFunctionId: id,
                  quantity: 1,
                },
            ),
          })
          setPicker(null)
        }}
        onClose={() => setPicker(null)}
      />
      {shifts.length > 0 ? (
        <SelectionModal
          visible={picker === 'shift'}
          title="Turno padrão"
          options={[
            { value: AUTO_SHIFT, label: 'Sugerir pelo horário' },
            { value: NO_SHIFT, label: 'Sem turno' },
            ...shifts.map((shift) => ({
              value: shift.id,
              label: shift.name,
              sublabel: `${shift.startTime}–${shift.endTime}`,
            })),
          ]}
          selectedValue={draft.shiftId === undefined ? AUTO_SHIFT : (draft.shiftId ?? NO_SHIFT)}
          onSelect={(value) => {
            change({
              shiftId: value === AUTO_SHIFT ? undefined : value === NO_SHIFT ? null : value,
            })
            setPicker(null)
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    minHeight: 56,
  },
  summaryText: { flex: 1, gap: 2 },
  editor: { padding: spacing.md, paddingTop: 0, gap: spacing.md },
  message: {
    color: colors.success,
    fontSize: 12,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  rosterHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rosterToggle: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', minHeight: 44 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  memberName: { color: colors.text, fontSize: 13 },
  restoreButton: { minHeight: 44, justifyContent: 'center' },
  link: { color: colors.primaryStrong, fontSize: 12, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  fields: { gap: spacing.sm },
  title: { color: colors.text, fontSize: 13, fontWeight: '600' },
  description: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontSize: 13 },
})
