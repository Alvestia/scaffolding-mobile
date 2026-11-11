import { Ionicons } from '@expo/vector-icons'
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Banner } from '@/components/ui/banner'
import { ExecutionEvidencePicker } from '@/components/execution/execution-evidence-picker'
import { ExecutionComponentAdvanceSection } from '@/components/execution/execution-component-advance-section'
import { ExecutionMeasurementAdjustmentSection } from '@/components/execution/execution-measurement-adjustment-section'
import { NetworkStatusIndicator } from '@/components/app/network-status-indicator'
import { ScaffoldAvailabilityWarning } from '@/components/inspection/scaffold-availability-warning'
import { EmptyState } from '@/components/ui/empty-state'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { SelectionModal, type SelectionOption } from '@/components/ui/selection-modal'
import { colors, radius, spacing } from '@/constants/theme'
import { outboxRepository } from '@/database/repositories/outbox-repository'
import { useCrews } from '@/hooks/use-crews'
import { useQueueServiceDetail } from '@/hooks/use-queue-service-detail'
import { useScaffoldComponents } from '@/hooks/use-scaffold-components'
import { fetchEmployees, getCachedEmployees } from '@/services/employees.service'
import { fetchWorkFunctions, getCachedWorkFunctions } from '@/services/work-functions.service'
import { useAuthStore } from '@/store/auth-store'
import { useConnectivityStore } from '@/store/connectivity-store'
import { useOperationalContextStore } from '@/store/operational-context-store'
import { useSyncStore } from '@/store/sync-store'
import { useQuery } from '@tanstack/react-query'
import {
  ExecutionInputType,
  type CreateExecutionEntryDto,
  type ExecutionComponentAdvanceInput,
  type ExecutionEvidenceDraft,
  type ExecutionFunctionQuantityInput,
  type ExecutionLaborMode,
  type ExecutionMeasurementAdjustmentDraft,
  type QueuedExecutionEntryPayload,
} from '@/types/execution'
import { MeasurementUnit } from '@/types/scaffold-service'
import { OutboxEntityType, SyncStatus } from '@/types/sync'
import {
  formatDate,
  formatTime,
  getDateTimeFieldsFromIso,
  maskDateInput,
  maskTimeInput,
  minutesAgo,
  parseDateInput,
  parseDateTimeInput,
  parseTimeInput,
  toIsoFromDateTime,
} from '@/utils/date'
import {
  calculateMeasuredTotal,
  getMeasurementUnitLabel,
  getVisibleMeasurementDimensions,
  normalizeMeasuredDimensions,
} from '@/utils/execution'
import { buildInheritedComponentAdvances } from '@/utils/component-advances'
import { matchesExecutionBasis } from '@/utils/execution-basis'
import { getErrorMessage } from '@/utils/error'
import { blurActiveElement } from '@/utils/focus'
import { createLocalId } from '@/utils/id'
import { normalizeQueuedExecutionPayload } from '@/utils/queued-execution'

type PickerKey = 'crew' | 'members' | 'functions' | null
type EntryMode = 'PERCENTUAL' | 'QUANTIDADE'
type QuantityMode = 'direct' | 'dimensions'
type ExecutionFormStep = 'ENTRY' | 'FINALIZE'
type DateTimeFieldKey = 'startDate' | 'startTime' | 'endDate' | 'endTime'
type NativePickerState = {
  field: DateTimeFieldKey
  mode: 'date' | 'time'
}

type FormSectionProps = {
  title: string
  subtitle?: string
  children: ReactNode
}

type CompactInputProps = React.ComponentProps<typeof TextInput> & {
  label: string
}

type SelectTriggerProps = {
  label: string
  value?: string | null
  helper?: string | null
  placeholder: string
  onPress: () => void
}

type DateTimeFieldProps = {
  label: string
  dateValue: string
  timeValue: string
  onDateChange: (value: string) => void
  onTimeChange: (value: string) => void
  onPickDate: () => void
  onPickTime: () => void
}

function FormSection({ title, subtitle, children }: FormSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  )
}

function CompactInput({ label, multiline, style, ...props }: CompactInputProps) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor="#8AA0A8"
        multiline={multiline}
        style={[styles.fieldInput, multiline ? styles.fieldInputMultiline : null, style]}
        {...props}
      />
    </View>
  )
}

function SelectTrigger({ label, value, helper, placeholder, onPress }: SelectTriggerProps) {
  return (
    <Pressable
      onPress={() => {
        blurActiveElement()
        onPress()
      }}
      style={({ pressed }) => [styles.selectTrigger, pressed ? styles.selectTriggerPressed : null]}
    >
      <View style={styles.selectTriggerText}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={[styles.selectTriggerValue, !value ? styles.selectTriggerPlaceholder : null]}>
          {value ?? placeholder}
        </Text>
        <Text style={styles.selectTriggerHelper}>{helper ?? 'Toque para selecionar'}</Text>
      </View>
      <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
    </Pressable>
  )
}

function DateTimeField({
  label,
  dateValue,
  timeValue,
  onDateChange,
  onTimeChange,
  onPickDate,
  onPickTime,
}: DateTimeFieldProps) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.dateTimeFieldStack}>
        <View style={styles.dateTimeSingleRow}>
          <View style={[styles.fieldInput, styles.dateTimeInputWrap]}>
            <Ionicons name="calendar-outline" size={15} color={colors.primaryStrong} />
            <TextInput
              value={dateValue}
              onChangeText={(text) => onDateChange(maskDateInput(text))}
              placeholder="dd/mm/aaaa"
              placeholderTextColor="#8AA0A8"
              keyboardType="number-pad"
              style={styles.dateTimeTextInput}
            />
          </View>
          <Pressable
            onPress={onPickDate}
            style={({ pressed }) => [
              styles.dateTimePickerButton,
              pressed ? styles.dateTimeIconButtonPressed : null,
            ]}
          >
            <Ionicons name="calendar-clear-outline" size={16} color={colors.primaryStrong} />
          </Pressable>
        </View>

        <View style={styles.dateTimeSingleRow}>
          <View style={[styles.fieldInput, styles.dateTimeInputWrap]}>
            <Ionicons name="time-outline" size={15} color={colors.primaryStrong} />
            <TextInput
              value={timeValue}
              onChangeText={(text) => onTimeChange(maskTimeInput(text))}
              placeholder="00:00"
              placeholderTextColor="#8AA0A8"
              keyboardType="number-pad"
              style={styles.dateTimeTextInput}
            />
          </View>
          <Pressable
            onPress={onPickTime}
            style={({ pressed }) => [
              styles.dateTimePickerButton,
              pressed ? styles.dateTimeIconButtonPressed : null,
            ]}
          >
            <Ionicons name="alarm-outline" size={16} color={colors.primaryStrong} />
          </Pressable>
        </View>
      </View>
      <Text style={styles.dateTimeHelper}>Digite ou selecione no calendário e relógio.</Text>
    </View>
  )
}

export default function ExecuteServicePage() {
  const { serviceId, draftLocalId } = useLocalSearchParams<{
    serviceId: string
    draftLocalId?: string
  }>()
  const user = useAuthStore((state) => state.user)
  const isConnected = useConnectivityStore((state) => state.isConnected)
  const { contractId, unitId } = useOperationalContextStore()
  const runSyncNow = useSyncStore((state) => state.runSyncNow)
  const refreshState = useSyncStore((state) => state.refreshState)
  const [activePicker, setActivePicker] = useState<PickerKey>(null)
  const [nativePickerState, setNativePickerState] = useState<NativePickerState | null>(null)
  const [iosPickerValue, setIosPickerValue] = useState(new Date())
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [rosterExpanded, setRosterExpanded] = useState(false)
  const [formStep, setFormStep] = useState<ExecutionFormStep>('ENTRY')
  const scrollViewRef = useRef<ScrollView>(null)
  const lastCrewRef = useRef<string | null>(null)

  const serviceQuery = useQueueServiceDetail(serviceId ?? null, { contractId, unitId }, isConnected)
  const service = serviceQuery.isError ? undefined : serviceQuery.data
  const scope =
    contractId && unitId
      ? {
          contractId,
          unitId,
        }
      : null

  const [entryMode, setEntryMode] = useState<EntryMode>('PERCENTUAL')
  const [draftBasis, setDraftBasis] = useState<{ version: number; quantity: number | null; unit: string } | null>(null)
  const [quantityMode, setQuantityMode] = useState<QuantityMode>('direct')
  const [percentageValue, setPercentageValue] = useState('')
  const [directInputValue, setDirectInputValue] = useState('')
  const [height, setHeight] = useState('')
  const [width, setWidth] = useState('')
  const [length, setLength] = useState('')
  const [startDate, setStartDate] = useState(formatDate(minutesAgo(30)))
  const [startTime, setStartTime] = useState(formatTime(minutesAgo(30)))
  const [endDate, setEndDate] = useState(formatDate(new Date()))
  const [endTime, setEndTime] = useState(formatTime(new Date()))
  const [notes, setNotes] = useState('')
  const [laborMode, setLaborMode] = useState<ExecutionLaborMode>('UNASSIGNED')
  const [selectedCrewId, setSelectedCrewId] = useState('')
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [functionQuantities, setFunctionQuantities] = useState<ExecutionFunctionQuantityInput[]>([])
  const [componentAdvances, setComponentAdvances] = useState<ExecutionComponentAdvanceInput[]>([])
  const [hasMeasurementAdjustments, setHasMeasurementAdjustments] = useState(false)
  const [measurementAdjustments, setMeasurementAdjustments] = useState<
    ExecutionMeasurementAdjustmentDraft[]
  >([])
  const [evidenceCaption, setEvidenceCaption] = useState('')
  const [evidenceDrafts, setEvidenceDrafts] = useState<ExecutionEvidenceDraft[]>([])
  const hydratedDraftRef = useRef<string | null>(null)
  const componentSelectionContextRef = useRef<string | null>(null)
  const componentSelectionInitializedRef = useRef(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const updateDateTimeField = (field: DateTimeFieldKey, value: Date) => {
    if (field === 'startDate') {
      setStartDate(formatDate(value))
      return
    }

    if (field === 'startTime') {
      setStartTime(formatTime(value))
      return
    }

    if (field === 'endDate') {
      setEndDate(formatDate(value))
      return
    }

    setEndTime(formatTime(value))
  }

  const resolvePickerDate = (field: DateTimeFieldKey) => {
    if (field === 'startDate') {
      return parseDateInput(startDate) ?? minutesAgo(30)
    }

    if (field === 'endDate') {
      return parseDateInput(endDate) ?? new Date()
    }

    if (field === 'startTime') {
      return parseDateTimeInput(startDate, startTime) ?? minutesAgo(30)
    }

    return parseDateTimeInput(endDate, endTime) ?? new Date()
  }

  const handleNativePickerChange = (
    state: NativePickerState,
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (event.type !== 'set' || !selectedDate) {
      return
    }

    updateDateTimeField(state.field, selectedDate)
  }

  const openNativePicker = (field: DateTimeFieldKey, mode: 'date' | 'time') => {
    blurActiveElement()
    const pickerDate = resolvePickerDate(field)

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: pickerDate,
        mode,
        is24Hour: true,
        display: mode === 'date' ? 'calendar' : 'clock',
        onChange: (event, selectedDate) =>
          handleNativePickerChange({ field, mode }, event, selectedDate),
      })
      return
    }

    if (Platform.OS === 'ios') {
      setIosPickerValue(pickerDate)
      setNativePickerState({ field, mode })
    }
  }

  const setStartToNow = () => {
    const now = new Date()
    setStartDate(formatDate(now))
    setStartTime(formatTime(now))
  }

  const setEndToNow = () => {
    const now = new Date()
    setEndDate(formatDate(now))
    setEndTime(formatTime(now))
  }

  const employeesQuery = useQuery({
    queryKey: ['execute-employees', contractId, unitId, isConnected],
    enabled: Boolean(contractId && unitId),
    queryFn: async () => {
      if (!contractId || !unitId) {
        return []
      }

      const employeeScope = { contractId, unitId }

      if (!isConnected) {
        return getCachedEmployees(employeeScope)
      }

      try {
        return await fetchEmployees(employeeScope)
      } catch (error) {
        const cached = await getCachedEmployees(employeeScope)
        if (cached.length > 0) {
          return cached
        }

        throw error
      }
    },
  })

  const workFunctionsQuery = useQuery({
    queryKey: ['execute-work-functions', contractId, unitId, isConnected],
    enabled: Boolean(contractId && unitId),
    queryFn: async () => {
      if (!contractId || !unitId) return []

      const workFunctionScope = { contractId, unitId }
      if (!isConnected) return getCachedWorkFunctions(workFunctionScope)

      try {
        return await fetchWorkFunctions(workFunctionScope)
      } catch (error) {
        const cached = await getCachedWorkFunctions(workFunctionScope)
        if (cached.length > 0) return cached
        throw error
      }
    },
  })

  const crewsQuery = useCrews({ contractId, unitId })
  const scaffoldComponentsQuery = useScaffoldComponents({
    scaffoldId: service?.scaffoldId ?? null,
    operationType:
      service?.type === 'MONTAGEM' || service?.type === 'DESMONTAGEM' ? service.type : null,
  })

  const visibleMeasurementDimensions = useMemo(
    () => getVisibleMeasurementDimensions(service?.plannedUnit ?? MeasurementUnit.UNIDADE),
    [service?.plannedUnit],
  )

  const selectedCrew = useMemo(
    () => (crewsQuery.data ?? []).find((crew) => crew.id === selectedCrewId) ?? null,
    [crewsQuery.data, selectedCrewId],
  )

  const selectedEmployees = useMemo(() => {
    const employeeMap = new Map(
      (employeesQuery.data ?? []).map((employee) => [employee.id, employee]),
    )

    return selectedMemberIds
      .map((employeeId) => employeeMap.get(employeeId))
      .filter((employee): employee is NonNullable<typeof employee> => Boolean(employee))
  }, [employeesQuery.data, selectedMemberIds])

  const availableEmployeeOptions: SelectionOption[] = useMemo(
    () =>
      (employeesQuery.data ?? [])
        .filter((employee) => employee.active !== false && !selectedMemberIds.includes(employee.id))
        .map((employee) => ({
          value: employee.id,
          label: employee.name,
          sublabel: [employee.registrationCode, employee.role].filter(Boolean).join(' • '),
        })),
    [employeesQuery.data, selectedMemberIds],
  )

  const workFunctionOptions: SelectionOption[] = useMemo(
    () =>
      (workFunctionsQuery.data ?? []).map((workFunction) => ({
        value: workFunction.id,
        label: workFunction.name,
        sublabel: workFunction.code,
        caption: workFunction.description ?? undefined,
      })),
    [workFunctionsQuery.data],
  )

  useEffect(() => {
    const contextKey = service ? `${service.id}:${draftLocalId ?? 'new'}` : null
    if (!contextKey || componentSelectionContextRef.current === contextKey) return

    componentSelectionContextRef.current = contextKey
    componentSelectionInitializedRef.current = false
    if (!draftLocalId) setComponentAdvances([])
  }, [draftLocalId, service])

  useEffect(() => {
    if (!service || draftLocalId) {
      return
    }

    setEntryMode(service.plannedUnit === MeasurementUnit.UNIDADE ? 'QUANTIDADE' : 'PERCENTUAL')
  }, [draftLocalId, service])

  useEffect(() => {
    if (!visibleMeasurementDimensions.height && height) {
      setHeight('')
    }

    if (!visibleMeasurementDimensions.width && width) {
      setWidth('')
    }

    if (!visibleMeasurementDimensions.length && length) {
      setLength('')
    }
  }, [
    height,
    length,
    visibleMeasurementDimensions.height,
    visibleMeasurementDimensions.length,
    visibleMeasurementDimensions.width,
    width,
  ])

  useEffect(() => {
    if (!selectedCrewId || lastCrewRef.current === selectedCrewId) {
      return
    }

    const crew = (crewsQuery.data ?? []).find((item) => item.id === selectedCrewId)
    if (!crew) {
      return
    }

    setSelectedMemberIds((crew.members ?? []).map((member) => member.employeeId))
    lastCrewRef.current = selectedCrewId
  }, [crewsQuery.data, selectedCrewId])

  useEffect(() => {
    if (!draftLocalId || hydratedDraftRef.current === draftLocalId) {
      return
    }

    let active = true

    void (async () => {
      const draft = await outboxRepository.getByLocalId(draftLocalId)

      if (!active || !draft || draft.entityType !== OutboxEntityType.EXECUTION_ENTRY) {
        return
      }

      if (draft.remoteId || draft.syncStatus === SyncStatus.SYNCING || draft.syncStatus === SyncStatus.SYNCED) {
        setSubmitError('Este registro já foi enviado ou está em envio. Volte às pendências para retomar a sincronização.')
        return
      }
      const normalizedPayload = normalizeQueuedExecutionPayload(draft.payload)

      if (!normalizedPayload) {
        return
      }

      const payload = normalizedPayload.entry
      setDraftBasis(normalizedPayload.basisSnapshot ?? { version: payload.expectedBasisVersion ?? 0, quantity: null, unit: '' })
      const isPercentual = payload.inputType === ExecutionInputType.PERCENTUAL
      const hydratedStart = getDateTimeFieldsFromIso(payload.startTime)
      const hydratedEnd = getDateTimeFieldsFromIso(payload.endTime)

      setEntryMode(isPercentual ? 'PERCENTUAL' : 'QUANTIDADE')
      setQuantityMode('direct')
      setPercentageValue(isPercentual ? String(payload.inputValue ?? '') : '')
      setDirectInputValue(!isPercentual ? String(payload.inputValue ?? '') : '')
      setHeight('')
      setWidth('')
      setLength('')
      setStartDate(hydratedStart.date)
      setStartTime(hydratedStart.time)
      setEndDate(hydratedEnd.date)
      setEndTime(hydratedEnd.time)
      setNotes(payload.notes ?? '')
      setLaborMode(payload.laborMode ?? (payload.crewId ? 'CREW' : 'UNASSIGNED'))
      setSelectedCrewId(payload.crewId ?? '')
      setSelectedMemberIds(payload.memberEmployeeIds ?? [])
      setFunctionQuantities(payload.functionQuantities ?? [])
      setComponentAdvances(
        payload.scaffoldComponentAdvances ??
          (payload.scaffoldComponentIds ?? []).map((scaffoldComponentId) => ({
            scaffoldComponentId,
            inputType: payload.inputType,
            inputValue: payload.inputValue,
          })),
      )
      componentSelectionInitializedRef.current = true
      setMeasurementAdjustments(normalizedPayload.adjustments ?? [])
      setHasMeasurementAdjustments(Boolean(normalizedPayload.adjustments?.length))
      setEvidenceCaption(normalizedPayload.evidenceCaption ?? '')
      setEvidenceDrafts(normalizedPayload.evidences ?? [])
      hydratedDraftRef.current = draftLocalId
    })()

    return () => {
      active = false
    }
  }, [draftLocalId])

  const calculatedDimensionsValue = useMemo(() => {
    if (!service) {
      return 0
    }

    return calculateMeasuredTotal(
      service.plannedUnit,
      normalizeMeasuredDimensions(service.plannedUnit, {
        height: Number(height || 0),
        width: Number(width || 0),
        length: Number(length || 0),
      }),
    )
  }, [height, length, service, width])

  const resolvedInputType = useMemo(() => {
    if (entryMode === 'PERCENTUAL') {
      return ExecutionInputType.PERCENTUAL
    }

    return ExecutionInputType.QUANTIDADE
  }, [entryMode])

  const resolvedInputValue = useMemo(() => {
    if (entryMode === 'PERCENTUAL') {
      return Number(percentageValue || 0)
    }

    if (quantityMode === 'dimensions') {
      return calculatedDimensionsValue
    }

    return Number(directInputValue || 0)
  }, [calculatedDimensionsValue, directInputValue, entryMode, percentageValue, quantityMode])

  const effectiveQuantity = useMemo(() => {
    if (!service) {
      return 0
    }

    if (entryMode === 'PERCENTUAL') {
      return Number(((service.plannedQuantity * resolvedInputValue) / 100).toFixed(3))
    }

    return Number(resolvedInputValue.toFixed(3))
  }, [entryMode, resolvedInputValue, service])

  const handleEntryModeChange = (value: EntryMode) => {
    setEntryMode(value)
    setComponentAdvances([])
    componentSelectionInitializedRef.current = value === 'QUANTIDADE'
  }

  useEffect(() => {
    if (
      componentSelectionInitializedRef.current ||
      !service ||
      service.scaffoldComponent ||
      draftLocalId ||
      resolvedInputType !== ExecutionInputType.PERCENTUAL ||
      resolvedInputValue <= 0 ||
      scaffoldComponentsQuery.data === undefined ||
      scaffoldComponentsQuery.data.length === 0 ||
      (service.type !== 'MONTAGEM' && service.type !== 'DESMONTAGEM')
    ) {
      return
    }

    setComponentAdvances(
      buildInheritedComponentAdvances(
        scaffoldComponentsQuery.data,
        service.type,
        resolvedInputType,
        resolvedInputValue,
      ),
    )
    componentSelectionInitializedRef.current = true
  }, [draftLocalId, resolvedInputType, resolvedInputValue, scaffoldComponentsQuery.data, service])

  const manHours = useMemo(() => {
    const startDateTime = parseDateTimeInput(startDate, startTime)
    const endDateTime = parseDateTimeInput(endDate, endTime)

    const effectiveCount =
      laborMode === 'CREW'
        ? selectedMemberIds.length
        : laborMode === 'FUNCTION_QUANTITY'
          ? functionQuantities.reduce((total, item) => total + item.quantity, 0)
          : 0

    if (!startDateTime || !endDateTime || effectiveCount <= 0) {
      return 0
    }

    const diffHours = (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60)

    if (diffHours <= 0) {
      return 0
    }

    return Number((diffHours * effectiveCount).toFixed(2))
  }, [
    endDate,
    endTime,
    functionQuantities,
    laborMode,
    selectedMemberIds.length,
    startDate,
    startTime,
  ])

  const getExecutionValidationError = () => {
    if (!service || !scope) {
      return 'Serviço não encontrado para registrar o avanço.'
    }

    if (laborMode === 'CREW' && !selectedCrewId) {
      return 'Selecione a equipe de referência.'
    }

    if (laborMode === 'CREW' && selectedMemberIds.length === 0) {
      return 'Selecione ao menos um integrante para esta execução.'
    }

    if (
      laborMode === 'FUNCTION_QUANTITY' &&
      (functionQuantities.length === 0 ||
        functionQuantities.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1))
    ) {
      return 'Informe ao menos uma função com efetivo inteiro maior que zero.'
    }

    if (service.type !== 'MONTAGEM' && service.type !== 'DESMONTAGEM') {
      return 'Este tipo de serviço ainda não aceita apontamento operacional.'
    }

    if (!parseDateInput(startDate) || !parseDateInput(endDate)) {
      return 'Use o formato DD/MM/AAAA para início e fim da execução.'
    }

    if (!parseTimeInput(startTime) || !parseTimeInput(endTime)) {
      return 'Use o formato HH:mm para início e fim da execução.'
    }

    const parsedStartDateTime = parseDateTimeInput(startDate, startTime)
    const parsedEndDateTime = parseDateTimeInput(endDate, endTime)

    if (!parsedStartDateTime || !parsedEndDateTime) {
      return 'Preencha data e hora válidas para o período da execução.'
    }

    if (parsedEndDateTime.getTime() <= parsedStartDateTime.getTime()) {
      return 'A data/hora final precisa ser posterior ao início da execução.'
    }

    if (entryMode === 'PERCENTUAL' && (resolvedInputValue <= 0 || resolvedInputValue > 100)) {
      return 'O percentual deve ser maior que zero e no máximo 100%.'
    }

    if (entryMode === 'QUANTIDADE' && resolvedInputValue <= 0) {
      return 'A quantidade efetiva precisa ser maior que zero.'
    }

    if (
      componentAdvances.some(
        (advance) =>
          !Number.isFinite(advance.inputValue) ||
          advance.inputValue <= 0 ||
          (advance.inputType === ExecutionInputType.PERCENTUAL && advance.inputValue > 100),
      )
    ) {
      return 'Informe um avanço válido para todos os componentes selecionados.'
    }

    return null
  }

  const goToFinalization = () => {
    const validationError = getExecutionValidationError()
    if (validationError) {
      setSubmitError(validationError)
      return
    }

    setSubmitError(null)
    setFormStep('FINALIZE')
    scrollViewRef.current?.scrollTo({ y: 0, animated: true })
  }

  useEffect(() => {
    if (!draftLocalId && service && !draftBasis) setDraftBasis({ version: service.quantityVersion ?? 0, quantity: service.plannedQuantity, unit: service.plannedUnit })
  }, [draftLocalId, service, draftBasis])
  const basisChanged = Boolean(service && draftBasis && !matchesExecutionBasis(service, draftBasis))
  const confirmBasis = (mode: 'PERCENTAGE' | 'QUANTITY' | 'REVIEW') => {
    if (!service || !draftBasis) return
    if (mode === 'QUANTITY' && draftBasis.quantity != null) {
      const quantity = resolvedInputType === ExecutionInputType.PERCENTUAL ? resolvedInputValue * draftBasis.quantity / 100 : resolvedInputValue
      setEntryMode('QUANTIDADE'); setQuantityMode('direct'); setDirectInputValue(String(Number(quantity.toFixed(6))))
    } else if (mode === 'PERCENTAGE' && draftBasis.quantity) {
      const percentage = resolvedInputType === ExecutionInputType.PERCENTUAL ? resolvedInputValue : resolvedInputValue * 100 / draftBasis.quantity
      setEntryMode('PERCENTUAL'); setPercentageValue(String(Number(percentage.toFixed(6))))
    } else { setEntryMode('QUANTIDADE'); setQuantityMode('direct'); setDirectInputValue(''); setPercentageValue('') }
    setComponentAdvances([])
    setDraftBasis({ version: service.quantityVersion ?? 0, quantity: service.plannedQuantity, unit: service.plannedUnit })
    setSubmitError(null)
  }

  const handleSubmit = async () => {
    if (basisChanged || !draftBasis) { setSubmitError('A base foi revisada. Confira os valores e escolha como tratar este rascunho.'); return }
    if (isSubmitting) {
      return
    }

    const validationError = getExecutionValidationError()
    if (validationError) {
      setSubmitError(validationError)
      return
    }

    if (hasMeasurementAdjustments && measurementAdjustments.length === 0) {
      setSubmitError('Adicione ao menos um ajuste ou marque que não houve ajustes.')
      return
    }

    const invalidAdjustment = measurementAdjustments.find(
      (adjustment) =>
        adjustment.quantity <= 0 ||
        adjustment.reason.trim().length < 3 ||
        (adjustment.scope === 'COMPONENT' && !adjustment.scaffoldComponentId),
    )
    if (hasMeasurementAdjustments && invalidAdjustment) {
      setSubmitError('Preencha escopo, quantidade e motivo de todos os ajustes.')
      return
    }

    if (!service || !scope || (service.type !== 'MONTAGEM' && service.type !== 'DESMONTAGEM')) {
      setSubmitError('Serviço não encontrado para registrar o avanço.')
      return
    }

    try {
      setIsSubmitting(true)
      setSubmitError(null)

      const localId = draftLocalId ?? createLocalId('execution')
      const entryPayload: CreateExecutionEntryDto = {
        scaffoldServiceId: service.id,
        expectedBasisVersion: service.quantityVersion ?? 0,
        operationType: service.type,
        inputType: resolvedInputType,
        inputValue: resolvedInputValue,
        startTime: toIsoFromDateTime(startDate, startTime),
        endTime: toIsoFromDateTime(endDate, endTime),
        notes: notes.trim() || undefined,
        laborMode,
        crewId: laborMode === 'CREW' ? selectedCrewId : undefined,
        memberEmployeeIds:
          laborMode === 'CREW' && selectedMemberIds.length > 0 ? selectedMemberIds : undefined,
        functionQuantities: laborMode === 'FUNCTION_QUANTITY' ? functionQuantities : undefined,
        scaffoldComponentAdvances:
          !service.scaffoldComponent && componentAdvances.length > 0
            ? componentAdvances
            : undefined,
      }

      const payload: QueuedExecutionEntryPayload = {
        basisSnapshot: { version: service.quantityVersion ?? 0, quantity: service.plannedQuantity, unit: service.plannedUnit },
        entry: entryPayload,
        scaffoldId: service.scaffoldId,
        adjustments: hasMeasurementAdjustments ? measurementAdjustments : [],
        evidenceCaption: evidenceCaption.trim() || undefined,
        evidences: evidenceDrafts,
      }

      await outboxRepository.enqueue({
        localId,
        entityType: OutboxEntityType.EXECUTION_ENTRY,
        contractId: scope.contractId,
        unitId: scope.unitId,
        syncStatus: SyncStatus.PENDING,
        payload,
      }, { requireExisting: Boolean(draftLocalId) })
      await refreshState()

      if (isConnected && !draftLocalId) {
        await runSyncNow(scope)
      }

      const outboxItem = await outboxRepository.getByLocalId(localId)
      blurActiveElement()
      router.replace(
        outboxItem ? '/(app)/(tabs)/sync?saved=queued' : '/(app)/(tabs)/queue?saved=synced',
      )
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Não foi possível registrar a execução.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <KeyboardAvoider style={styles.keyboardAvoider}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          <View style={styles.page}>
            <View style={styles.headerRow}>
              <Pressable
                onPress={() => {
                  blurActiveElement()
                  router.back()
                }}
                style={({ pressed }) => [
                  styles.headerIconButton,
                  pressed ? styles.headerIconButtonPressed : null,
                ]}
              >
                <Ionicons name="arrow-back" size={18} color={colors.text} />
              </Pressable>

              <View style={styles.headerTextBlock}>
                <Text style={styles.headerTitle}>
                  {draftLocalId ? 'Corrigir execução' : 'Lançar execução'}
                </Text>
                <Text style={styles.headerSubtitle}>
                  {service?.scaffold?.code ?? 'Apontamento operacional'}
                </Text>
              </View>

              <View style={styles.headerStatusWrap}>
                {draftLocalId ? (
                  <View style={[styles.headerBadge, styles.headerBadgeWarning]}>
                    <Text style={[styles.headerBadgeLabel, styles.headerBadgeLabelWarning]}>
                      Pendente
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <NetworkStatusIndicator />
            <ScaffoldAvailabilityWarning scaffoldId={service?.scaffoldId} />
            {basisChanged && service && <View style={{ gap: 8, padding: 12 }}>
              <Banner tone="warning" title="A quantidade do serviço mudou" description={`Base anterior: ${draftBasis?.quantity ?? 'não registrada'}. Base atual: ${service.plannedQuantity}. Confirme o tratamento do lançamento e confira novamente os componentes.`} />
              {draftBasis?.quantity != null && draftBasis.unit === service.plannedUnit ? <>
                <Pressable accessibilityRole="button" onPress={() => confirmBasis('PERCENTAGE')}><Text>Manter o percentual executado</Text></Pressable>
                <Pressable accessibilityRole="button" onPress={() => confirmBasis('QUANTITY')}><Text>Manter a quantidade executada</Text></Pressable>
              </> : <Pressable accessibilityRole="button" onPress={() => confirmBasis('REVIEW')}><Text>Conferir e informar os valores na nova base</Text></Pressable>}
            </View>}

            {draftLocalId ? (
              <Banner
                tone="warning"
                title="Rascunho em correção"
                description="Depois de salvar, esse lançamento volta para a fila de sincronização."
              />
            ) : null}

            {serviceQuery.isPending && scope ? (
              <View style={styles.emptyShell}>
                <ActivityIndicator color={colors.primaryStrong} />
                <Text>Carregando o serviço...</Text>
              </View>
            ) : !service ? (
              <View style={styles.emptyShell}>
                <EmptyState
                  title={serviceQuery.isError ? 'Não foi possível carregar o serviço' : 'Atividade indisponível'}
                  description={serviceQuery.isError
                    ? getErrorMessage(serviceQuery.error, 'Tente novamente quando a conexão estiver disponível.')
                    : 'Confira o contrato selecionado e atualize a base para abrir este lançamento.'}
                />
                <Pressable accessibilityRole="button" onPress={() => void serviceQuery.refetch()}>
                  <Text>Tentar novamente</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.servicePanel}>
                  <View style={styles.servicePanelTop}>
                    <View style={styles.servicePillRow}>
                      <View style={styles.softPill}>
                        <Text style={styles.softPillLabel}>{service.type}</Text>
                      </View>
                      <View
                        style={[
                          styles.softPill,
                          service.status === 'EM_EXECUCAO'
                            ? styles.softPillSuccess
                            : styles.softPillWarning,
                        ]}
                      >
                        <Text
                          style={[
                            styles.softPillLabel,
                            service.status === 'EM_EXECUCAO'
                              ? styles.softPillLabelSuccess
                              : styles.softPillLabelWarning,
                          ]}
                        >
                          {{ NAO_INICIADO: 'Pendente', EM_EXECUCAO: 'Em andamento', CONCLUIDO: 'Concluído', CANCELLED: 'Cancelado', NOT_EXECUTED: 'Não executado' }[service.status]}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.progressLabel}>{Math.round(service.progress)}%</Text>
                  </View>

                  <Text style={styles.serviceCode} numberOfLines={1}>
                    {service.scaffold?.code ?? 'ANDAIME'} {'->'}{' '}
                    {service.workOrder?.code ?? 'Sem OS'}
                  </Text>
                  <Text style={styles.serviceLine} numberOfLines={1}>
                    {service.scaffoldComponent?.name ??
                      service.scaffold?.description ??
                      'Sem descrição'}
                  </Text>
                  <Text style={styles.serviceDescription} numberOfLines={2}>
                    {service.description ?? 'Sem descrição operacional cadastrada.'}
                  </Text>

                  <View style={styles.metricsRow}>
                    <View style={styles.metricTile}>
                      <Text style={styles.metricTileLabel}>Planejado</Text>
                      <Text style={styles.metricTileValue}>
                        {service.plannedQuantity} {getMeasurementUnitLabel(service.plannedUnit)}
                      </Text>
                    </View>
                    <View style={styles.metricTile}>
                      <Text style={styles.metricTileLabel}>Executado</Text>
                      <Text style={styles.metricTileValue}>
                        {service.executedQuantity} {getMeasurementUnitLabel(service.plannedUnit)}
                      </Text>
                    </View>
                    <View style={styles.metricTile}>
                      <Text style={styles.metricTileLabel}>Efetivo</Text>
                      <Text style={styles.metricTileValue}>
                        {effectiveQuantity || 0} {getMeasurementUnitLabel(service.plannedUnit)}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.stepShell}>
                  <SegmentedControl
                    value={formStep}
                    onChange={(value) => {
                      if (value === 'FINALIZE') {
                        goToFinalization()
                        return
                      }
                      setFormStep('ENTRY')
                      setSubmitError(null)
                    }}
                    options={[
                      { value: 'ENTRY', label: '1. Apontamento' },
                      { value: 'FINALIZE', label: '2. Finalização' },
                    ]}
                  />
                </View>

                {formStep === 'ENTRY' ? (
                  <>
                    <FormSection
                      title="Mão de obra"
                      subtitle="Escolha o formato do apontamento e informe a produção desta execução."
                    >
                      <SegmentedControl
                        value={entryMode}
                        onChange={handleEntryModeChange}
                        options={[
                          { value: 'PERCENTUAL', label: 'Percentual' },
                          { value: 'QUANTIDADE', label: 'Quantidade' },
                        ]}
                      />

                      {entryMode === 'PERCENTUAL' ? (
                        <>
                          <CompactInput
                            label="Percentual executado"
                            placeholder="Ex.: 25"
                            keyboardType="decimal-pad"
                            value={percentageValue}
                            onChangeText={setPercentageValue}
                          />
                          <View style={styles.quickPercentRow}>
                            {[25, 50, 75, 100].map((value) => (
                              <Pressable
                                key={value}
                                onPress={() => setPercentageValue(String(value))}
                                style={({ pressed }) => [
                                  styles.quickPercentButton,
                                  Number(percentageValue) === value
                                    ? styles.quickPercentButtonActive
                                    : null,
                                  pressed ? styles.quickPercentButtonPressed : null,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.quickPercentLabel,
                                    Number(percentageValue) === value
                                      ? styles.quickPercentLabelActive
                                      : null,
                                  ]}
                                >
                                  {value}%
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </>
                      ) : (
                        <>
                          {service.plannedUnit !== MeasurementUnit.UNIDADE ? (
                            <SegmentedControl
                              value={quantityMode}
                              onChange={(value) => setQuantityMode(value)}
                              options={[
                                { value: 'direct', label: 'Lançamento direto' },
                                { value: 'dimensions', label: 'Calcular medidas' },
                              ]}
                            />
                          ) : null}

                          {quantityMode === 'dimensions' &&
                          service.plannedUnit !== MeasurementUnit.UNIDADE ? (
                            <View style={styles.inlineGrid}>
                              {visibleMeasurementDimensions.height ? (
                                <CompactInput
                                  label="Altura"
                                  keyboardType="decimal-pad"
                                  value={height}
                                  onChangeText={setHeight}
                                />
                              ) : null}
                              {visibleMeasurementDimensions.width ? (
                                <CompactInput
                                  label="Largura"
                                  keyboardType="decimal-pad"
                                  value={width}
                                  onChangeText={setWidth}
                                />
                              ) : null}
                              {visibleMeasurementDimensions.length ? (
                                <CompactInput
                                  label="Comprimento"
                                  keyboardType="decimal-pad"
                                  value={length}
                                  onChangeText={setLength}
                                />
                              ) : null}
                            </View>
                          ) : (
                            <CompactInput
                              label={`Quantidade (${getMeasurementUnitLabel(service.plannedUnit)})`}
                              placeholder="Ex.: 4.5"
                              keyboardType="decimal-pad"
                              value={directInputValue}
                              onChangeText={setDirectInputValue}
                            />
                          )}
                        </>
                      )}

                      <View style={styles.resumeInlineCard}>
                        <Text style={styles.resumeInlineLabel}>Quantidade efetiva</Text>
                        <Text style={styles.resumeInlineValue}>
                          {effectiveQuantity || 0} {getMeasurementUnitLabel(service.plannedUnit)}
                        </Text>
                      </View>
                    </FormSection>

                    <FormSection
                      title="Efetivo da execução"
                      subtitle="Escolha a composição apenas para este lançamento, como no sistema web."
                    >
                      <SegmentedControl
                        value={laborMode}
                        onChange={setLaborMode}
                        options={[
                          { value: 'CREW', label: 'Equipe' },
                          { value: 'FUNCTION_QUANTITY', label: 'Efetivo' },
                          { value: 'UNASSIGNED', label: 'Sem efetivo' },
                        ]}
                      />

                      {laborMode === 'CREW' ? (
                        <>
                          <SelectTrigger
                            label="Equipe"
                            value={selectedCrew?.name}
                            placeholder="Selecionar equipe"
                            helper={
                              selectedCrew
                                ? `${selectedCrew.members?.length ?? 0} integrante(s) • ${
                                    selectedCrew.foreman?.name ?? 'Sem encarregado'
                                  }`
                                : 'Escolha a equipe base deste lançamento.'
                            }
                            onPress={() => setActivePicker('crew')}
                          />

                          {selectedCrew ? (
                            <View style={styles.crewCard}>
                              <View style={styles.crewCardText}>
                                <Text style={styles.crewCardTitle}>{selectedCrew.name}</Text>
                                <Text style={styles.crewCardMeta}>
                                  {selectedMemberIds.length} integrante(s) nesta execução
                                </Text>
                                <Text style={styles.crewCardMeta}>
                                  HH estimado: {manHours.toFixed(2)}
                                </Text>
                              </View>

                              <View style={styles.crewActions}>
                                <Pressable
                                  onPress={() => setRosterExpanded((current) => !current)}
                                  style={({ pressed }) => [
                                    styles.ghostButton,
                                    pressed ? styles.ghostButtonPressed : null,
                                  ]}
                                >
                                  <Ionicons
                                    name={rosterExpanded ? 'chevron-up-outline' : 'people-outline'}
                                    size={15}
                                    color={colors.primaryStrong}
                                  />
                                  <Text style={styles.ghostButtonLabel}>Integrantes</Text>
                                </Pressable>

                                <Pressable
                                  onPress={() => setActivePicker('members')}
                                  disabled={!availableEmployeeOptions.length}
                                  style={({ pressed }) => [
                                    styles.circleAction,
                                    !availableEmployeeOptions.length
                                      ? styles.circleActionDisabled
                                      : null,
                                    pressed && availableEmployeeOptions.length
                                      ? styles.circleActionPressed
                                      : null,
                                  ]}
                                >
                                  <Ionicons name="add" size={16} color={colors.white} />
                                </Pressable>
                              </View>
                            </View>
                          ) : null}

                          {rosterExpanded ? (
                            <View style={styles.memberList}>
                              {selectedEmployees.length === 0 ? (
                                <View style={styles.inlineEmptyState}>
                                  <Text style={styles.inlineEmptyTitle}>
                                    Sem integrantes selecionados
                                  </Text>
                                  <Text style={styles.inlineEmptyDescription}>
                                    Adicione pessoas se a composição em campo mudou.
                                  </Text>
                                </View>
                              ) : (
                                selectedEmployees.map((employee) => (
                                  <View key={employee.id} style={styles.memberRow}>
                                    <View style={styles.memberInfo}>
                                      <Text style={styles.memberName}>{employee.name}</Text>
                                      <Text style={styles.memberMeta}>
                                        {[employee.registrationCode, employee.role]
                                          .filter(Boolean)
                                          .join(' • ') || 'Sem detalhes adicionais'}
                                      </Text>
                                    </View>

                                    <Pressable
                                      onPress={() =>
                                        setSelectedMemberIds((current) =>
                                          current.filter((item) => item !== employee.id),
                                        )
                                      }
                                      style={({ pressed }) => [
                                        styles.memberRemoveButton,
                                        pressed ? styles.memberRemoveButtonPressed : null,
                                      ]}
                                    >
                                      <Ionicons name="close" size={14} color={colors.danger} />
                                    </Pressable>
                                  </View>
                                ))
                              )}
                            </View>
                          ) : null}
                        </>
                      ) : null}

                      {laborMode === 'FUNCTION_QUANTITY' ? (
                        <View style={styles.memberList}>
                          {functionQuantities.map((item) => {
                            const workFunction = (workFunctionsQuery.data ?? []).find(
                              (candidate) => candidate.id === item.workFunctionId,
                            )
                            return (
                              <View key={item.workFunctionId} style={styles.memberRow}>
                                <View style={styles.memberInfo}>
                                  <Text style={styles.memberName}>
                                    {workFunction?.name ?? 'Função operacional'}
                                  </Text>
                                  <Text style={styles.memberMeta}>
                                    {workFunction?.code ?? 'Função cadastrada'}
                                  </Text>
                                </View>
                                <TextInput
                                  value={String(item.quantity)}
                                  onChangeText={(value) => {
                                    const quantity = Number(value.replace(/\D/g, '')) || 0
                                    setFunctionQuantities((current) =>
                                      current.map((currentItem) =>
                                        currentItem.workFunctionId === item.workFunctionId
                                          ? { ...currentItem, quantity }
                                          : currentItem,
                                      ),
                                    )
                                  }}
                                  keyboardType="number-pad"
                                  selectTextOnFocus
                                  style={styles.functionQuantityInput}
                                />
                                <Pressable
                                  onPress={() =>
                                    setFunctionQuantities((current) =>
                                      current.filter(
                                        (currentItem) =>
                                          currentItem.workFunctionId !== item.workFunctionId,
                                      ),
                                    )
                                  }
                                  style={({ pressed }) => [
                                    styles.memberRemoveButton,
                                    pressed ? styles.memberRemoveButtonPressed : null,
                                  ]}
                                >
                                  <Ionicons name="close" size={14} color={colors.danger} />
                                </Pressable>
                              </View>
                            )
                          })}

                          <Pressable
                            onPress={() => setActivePicker('functions')}
                            style={({ pressed }) => [
                              styles.ghostButton,
                              pressed ? styles.ghostButtonPressed : null,
                            ]}
                          >
                            <Ionicons name="add" size={15} color={colors.primaryStrong} />
                            <Text style={styles.ghostButtonLabel}>Adicionar funções</Text>
                          </Pressable>
                          <Text style={styles.mutedText}>
                            Efetivo total:{' '}
                            {functionQuantities.reduce((total, item) => total + item.quantity, 0)} •
                            HH estimado: {manHours.toFixed(2)}
                          </Text>
                        </View>
                      ) : null}

                      {laborMode === 'UNASSIGNED' ? (
                        <View style={styles.inlineEmptyState}>
                          <Text style={styles.inlineEmptyTitle}>Execução sem efetivo</Text>
                          <Text style={styles.inlineEmptyDescription}>
                            O avanço será salvo sem equipe, pessoas ou quantitativo por função.
                          </Text>
                        </View>
                      ) : null}
                    </FormSection>

                    {!service.scaffoldComponent &&
                    (service.type === 'MONTAGEM' || service.type === 'DESMONTAGEM') ? (
                      <FormSection
                        title="Componentes"
                        subtitle="Por padrão, os componentes com saldo acompanham o percentual do andaime."
                      >
                        <ExecutionComponentAdvanceSection
                          components={scaffoldComponentsQuery.data ?? []}
                          advances={componentAdvances}
                          operationType={service.type}
                          parentInputType={resolvedInputType}
                          parentInputValue={resolvedInputValue}
                          isLoading={scaffoldComponentsQuery.isLoading}
                          onChange={setComponentAdvances}
                        />
                      </FormSection>
                    ) : null}

                    <FormSection
                      title="Período da atividade"
                      subtitle="Registre a janela exata desta execução."
                    >
                      <View style={styles.inlineGrid}>
                        <View style={styles.timeShortcutBlock}>
                          <DateTimeField
                            label="Início da atividade"
                            dateValue={startDate}
                            timeValue={startTime}
                            onDateChange={setStartDate}
                            onTimeChange={setStartTime}
                            onPickDate={() => openNativePicker('startDate', 'date')}
                            onPickTime={() => openNativePicker('startTime', 'time')}
                          />
                          <Pressable
                            onPress={setStartToNow}
                            style={({ pressed }) => [
                              styles.timeShortcutButton,
                              pressed ? styles.timeShortcutButtonPressed : null,
                            ]}
                          >
                            <Ionicons name="time-outline" size={14} color={colors.primaryStrong} />
                            <Text style={styles.timeShortcutLabel}>Usar agora</Text>
                          </Pressable>
                        </View>
                        <View style={styles.timeShortcutBlock}>
                          <DateTimeField
                            label="Fim da atividade"
                            dateValue={endDate}
                            timeValue={endTime}
                            onDateChange={setEndDate}
                            onTimeChange={setEndTime}
                            onPickDate={() => openNativePicker('endDate', 'date')}
                            onPickTime={() => openNativePicker('endTime', 'time')}
                          />
                          <Pressable
                            onPress={setEndToNow}
                            style={({ pressed }) => [
                              styles.timeShortcutButton,
                              pressed ? styles.timeShortcutButtonPressed : null,
                            ]}
                          >
                            <Ionicons name="time-outline" size={14} color={colors.primaryStrong} />
                            <Text style={styles.timeShortcutLabel}>Usar agora</Text>
                          </Pressable>
                        </View>
                      </View>
                    </FormSection>

                    {submitError ? (
                      <Banner
                        tone="danger"
                        title="Não foi possível salvar"
                        description={submitError}
                      />
                    ) : null}

                    <Pressable
                      onPress={goToFinalization}
                      style={({ pressed }) => [
                        styles.submitButton,
                        pressed ? styles.submitButtonPressed : null,
                      ]}
                    >
                      <Text style={styles.submitButtonLabel}>Revisar e finalizar</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <FormSection
                      title="Resumo do apontamento"
                      subtitle="Revise os dados antes de salvar no aparelho."
                    >
                      <View style={styles.finalSummary}>
                        <View style={styles.finalSummaryRow}>
                          <Text style={styles.finalSummaryLabel}>Entrada</Text>
                          <Text style={styles.finalSummaryValue}>
                            {entryMode === 'PERCENTUAL' ? 'Percentual' : 'Quantidade'}
                          </Text>
                        </View>
                        <View style={styles.finalSummaryRow}>
                          <Text style={styles.finalSummaryLabel}>Valor enviado</Text>
                          <Text style={styles.finalSummaryValue}>{resolvedInputValue || 0}</Text>
                        </View>
                        <View style={styles.finalSummaryRow}>
                          <Text style={styles.finalSummaryLabel}>Quantidade efetiva</Text>
                          <Text style={styles.finalSummaryValue}>{effectiveQuantity || 0}</Text>
                        </View>
                        <View style={styles.finalSummaryRow}>
                          <Text style={styles.finalSummaryLabel}>HH estimado</Text>
                          <Text style={styles.finalSummaryValue}>{manHours.toFixed(2)}</Text>
                        </View>
                        <View style={styles.finalSummaryRow}>
                          <Text style={styles.finalSummaryLabel}>Componentes</Text>
                          <Text style={styles.finalSummaryValue}>{componentAdvances.length}</Text>
                        </View>
                      </View>
                    </FormSection>

                    <FormSection
                      title="Observações"
                      subtitle="Inclua somente informações relevantes para este avanço."
                    >
                      <CompactInput
                        label="Observações da execução"
                        placeholder="Descreva o que precisa ficar registrado."
                        value={notes}
                        onChangeText={setNotes}
                        multiline
                        numberOfLines={5}
                      />
                    </FormSection>

                    <FormSection
                      title="Ajustes de metragem"
                      subtitle="O ajuste ficará vinculado a esta execução."
                    >
                      <ExecutionMeasurementAdjustmentSection
                        plannedUnit={service.plannedUnit}
                        components={scaffoldComponentsQuery.data ?? []}
                        enabled={hasMeasurementAdjustments}
                        adjustments={measurementAdjustments}
                        onEnabledChange={setHasMeasurementAdjustments}
                        onChange={setMeasurementAdjustments}
                      />
                    </FormSection>

                    <FormSection
                      title="Registro fotográfico"
                      subtitle="Anexe as evidências que devem acompanhar este lançamento."
                    >
                      <View style={styles.evidenceShell}>
                        <ExecutionEvidencePicker
                          value={evidenceDrafts}
                          caption={evidenceCaption}
                          onChange={setEvidenceDrafts}
                          onCaptionChange={setEvidenceCaption}
                        />
                      </View>
                    </FormSection>

                    {submitError ? (
                      <Banner
                        tone="danger"
                        title="Não foi possível salvar"
                        description={submitError}
                      />
                    ) : null}

                    <View style={styles.finalActions}>
                      <Pressable
                        onPress={() => {
                          setFormStep('ENTRY')
                          setSubmitError(null)
                          scrollViewRef.current?.scrollTo({ y: 0, animated: true })
                        }}
                        style={({ pressed }) => [
                          styles.backStepButton,
                          pressed ? styles.secondaryActionPressed : null,
                        ]}
                      >
                        <Text style={styles.backStepButtonLabel}>Voltar</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void handleSubmit()}
                        style={({ pressed }) => [
                          styles.submitButton,
                          styles.finalSubmitButton,
                          serviceQuery.isLoading || isSubmitting
                            ? styles.submitButtonDisabled
                            : null,
                          pressed && !serviceQuery.isLoading && !isSubmitting
                            ? styles.submitButtonPressed
                            : null,
                        ]}
                        disabled={serviceQuery.isLoading || isSubmitting}
                      >
                        <Text style={styles.submitButtonLabel}>
                          {serviceQuery.isLoading || isSubmitting
                            ? 'Salvando...'
                            : draftLocalId
                              ? 'Salvar correção'
                              : 'Salvar lançamento'}
                        </Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoider>

      {Platform.OS === 'ios' && nativePickerState ? (
        <Modal
          transparent
          animationType="fade"
          visible
          onRequestClose={() => setNativePickerState(null)}
        >
          <View style={styles.pickerOverlay}>
            <Pressable style={styles.pickerBackdrop} onPress={() => setNativePickerState(null)} />
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>
                  {nativePickerState.mode === 'date' ? 'Selecionar data' : 'Selecionar horário'}
                </Text>
                <Pressable
                  onPress={() => setNativePickerState(null)}
                  style={({ pressed }) => [
                    styles.pickerCloseButton,
                    pressed ? styles.pickerCloseButtonPressed : null,
                  ]}
                >
                  <Text style={styles.pickerCloseButtonLabel}>Concluir</Text>
                </Pressable>
              </View>

              <DateTimePicker
                value={iosPickerValue}
                mode={nativePickerState.mode}
                display="spinner"
                is24Hour
                locale="pt-BR"
                onChange={(event, selectedDate) => {
                  if (event.type !== 'set' || !selectedDate) {
                    return
                  }

                  setIosPickerValue(selectedDate)
                  updateDateTimeField(nativePickerState.field, selectedDate)
                }}
              />
            </View>
          </View>
        </Modal>
      ) : null}

      <SelectionModal
        visible={activePicker === 'crew'}
        title="Selecionar equipe"
        subtitle="A crew de referência já puxa a composição base da execução."
        options={(crewsQuery.data ?? []).map((crew) => ({
          value: crew.id,
          label: crew.name,
          sublabel: `${crew.members?.length ?? 0} integrante(s)`,
          caption: crew.foreman?.name ? `Encarregado: ${crew.foreman.name}` : 'Sem encarregado',
        }))}
        selectedValue={selectedCrewId}
        onSelect={(value) => {
          setSelectedCrewId(value)
          lastCrewRef.current = null
        }}
        onClose={() => setActivePicker(null)}
      />

      <SelectionModal
        visible={activePicker === 'members'}
        title="Adicionar pessoas à execução"
        subtitle="Esses ajustes valem só para este avanço."
        options={availableEmployeeOptions}
        multiple
        selectedValues={[]}
        onConfirm={(values) =>
          setSelectedMemberIds((current) => [...new Set([...current, ...values])])
        }
        onClose={() => setActivePicker(null)}
        confirmLabel="Adicionar ao avanço"
      />

      <SelectionModal
        visible={activePicker === 'functions'}
        title="Funções do efetivo"
        subtitle="Informe depois a quantidade de pessoas em cada função."
        options={workFunctionOptions}
        multiple
        selectedValues={functionQuantities.map((item) => item.workFunctionId)}
        onConfirm={(values) =>
          setFunctionQuantities((current) =>
            values.map(
              (workFunctionId) =>
                current.find((item) => item.workFunctionId === workFunctionId) ?? {
                  workFunctionId,
                  quantity: 1,
                },
            ),
          )
        }
        onClose={() => setActivePicker(null)}
        confirmLabel="Usar funções"
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardAvoider: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl + 160,
  },
  page: {
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconButtonPressed: {
    opacity: 0.82,
  },
  headerTextBlock: {
    flex: 1,
    gap: 1,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
  },
  headerStatusWrap: {
    minWidth: 64,
    alignItems: 'flex-end',
  },
  headerBadge: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderWidth: 1,
  },
  headerBadgeWarning: {
    backgroundColor: '#FFF8EF',
    borderColor: '#E8D2B1',
  },
  headerBadgeLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  headerBadgeLabelWarning: {
    color: colors.warning,
  },
  emptyShell: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  servicePanel: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  servicePanelTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    alignItems: 'center',
  },
  servicePillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    flex: 1,
  },
  softPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D8E6EC',
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  softPillWarning: {
    backgroundColor: '#FFF8EF',
    borderColor: '#E8D2B1',
  },
  softPillSuccess: {
    backgroundColor: '#EEF8F4',
    borderColor: '#CAE3D9',
  },
  softPillLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  softPillLabelWarning: {
    color: colors.warning,
  },
  softPillLabelSuccess: {
    color: colors.success,
  },
  progressLabel: {
    color: colors.primaryStrong,
    fontSize: 12,
    fontWeight: '700',
  },
  serviceCode: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  serviceLine: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  serviceDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricTile: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  metricTileLabel: {
    color: colors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    fontWeight: '700',
  },
  metricTileValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    gap: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  sectionBody: {
    gap: spacing.sm,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
  fieldInput: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 13,
  },
  fieldInputMultiline: {
    minHeight: 108,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    textAlignVertical: 'top',
  },
  quickPercentRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  quickPercentButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickPercentButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  quickPercentButtonPressed: {
    opacity: 0.86,
  },
  quickPercentLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  quickPercentLabelActive: {
    color: colors.primaryStrong,
  },
  timeShortcutBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  timeShortcutButton: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#DCE8EE',
    backgroundColor: '#F6FAFB',
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  timeShortcutButtonPressed: {
    opacity: 0.86,
  },
  timeShortcutLabel: {
    color: colors.primaryStrong,
    fontSize: 11,
    fontWeight: '800',
  },
  dateTimeFieldStack: {
    gap: spacing.xs,
  },
  dateTimeSingleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dateTimeInputWrap: {
    flex: 1,
    minHeight: 46,
    minWidth: 0,
    paddingRight: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dateTimeTextInput: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 13,
    paddingVertical: 0,
  },
  dateTimePickerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateTimeIconButtonPressed: {
    opacity: 0.84,
  },
  dateTimeHelper: {
    color: colors.textMuted,
    fontSize: 10,
  },
  selectTrigger: {
    minHeight: 62,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  selectTriggerPressed: {
    opacity: 0.88,
  },
  selectTriggerText: {
    flex: 1,
    gap: 3,
  },
  selectTriggerValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  selectTriggerPlaceholder: {
    color: '#8AA0A8',
    fontWeight: '500',
  },
  selectTriggerHelper: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  resumeInlineCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  resumeInlineLabel: {
    color: colors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  resumeInlineValue: {
    color: colors.primaryStrong,
    fontSize: 14,
    fontWeight: '700',
  },
  inlineGrid: {
    gap: spacing.sm,
  },
  crewCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  crewCardText: {
    gap: 2,
  },
  crewCardTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  crewCardMeta: {
    color: colors.textMuted,
    fontSize: 11,
  },
  crewActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ghostButton: {
    minHeight: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ghostButtonPressed: {
    opacity: 0.86,
  },
  ghostButtonLabel: {
    color: colors.primaryStrong,
    fontSize: 11,
    fontWeight: '700',
  },
  circleAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleActionPressed: {
    opacity: 0.88,
  },
  circleActionDisabled: {
    opacity: 0.35,
  },
  memberList: {
    gap: spacing.xs,
  },
  memberRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  memberInfo: {
    flex: 1,
    gap: 2,
  },
  memberName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  memberMeta: {
    color: colors.textMuted,
    fontSize: 11,
  },
  memberRemoveButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8C8C1',
    backgroundColor: '#FFF3F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberRemoveButtonPressed: {
    opacity: 0.86,
  },
  functionQuantityInput: {
    width: 58,
    minHeight: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  inlineEmptyState: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    gap: spacing.xs,
  },
  inlineEmptyTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  inlineEmptyDescription: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  compactSummary: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  compactSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  compactSummaryLabel: {
    color: colors.textMuted,
    fontSize: 11,
  },
  compactSummaryValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  secondaryAction: {
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  secondaryActionPressed: {
    opacity: 0.86,
  },
  secondaryActionLabel: {
    color: colors.primaryStrong,
    fontSize: 12,
    fontWeight: '700',
  },
  evidenceShell: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  stepShell: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  finalSummary: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  finalSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  finalSummaryLabel: {
    color: colors.textMuted,
    fontSize: 11,
  },
  finalSummaryValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  submitButton: {
    minHeight: 50,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  finalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backStepButton: {
    minHeight: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  backStepButtonLabel: {
    color: colors.primaryStrong,
    fontSize: 13,
    fontWeight: '700',
  },
  finalSubmitButton: {
    flex: 1,
  },
  submitButtonPressed: {
    opacity: 0.9,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonLabel: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  pickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pickerBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(8, 20, 26, 0.38)',
  },
  pickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  pickerTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  pickerCloseButton: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  pickerCloseButtonPressed: {
    opacity: 0.86,
  },
  pickerCloseButtonLabel: {
    color: colors.primaryStrong,
    fontSize: 12,
    fontWeight: '700',
  },
})
