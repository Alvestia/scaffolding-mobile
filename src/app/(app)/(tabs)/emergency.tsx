import { Ionicons } from '@expo/vector-icons'
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { router, useFocusEffect } from 'expo-router'
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Banner } from '@/components/ui/banner'
import { ComponentDraftModal } from '@/components/scaffold/component-draft-modal'
import { NetworkStatusIndicator } from '@/components/app/network-status-indicator'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { SelectionModal, type SelectionOption } from '@/components/ui/selection-modal'
import { colors, radius, spacing } from '@/constants/theme'
import { outboxRepository } from '@/database/repositories/outbox-repository'
import { localScaffoldServiceRepository } from '@/database/repositories/local-scaffold-service-repository'
import { useAreas } from '@/hooks/use-areas'
import { useLatestScaffold } from '@/hooks/use-latest-scaffold'
import { useProjects } from '@/hooks/use-projects'
import { useScaffoldTypes } from '@/hooks/use-scaffold-types'
import { useWorkOrders } from '@/hooks/use-work-orders'
import {
  cacheLatestScaffoldFromCreation,
  createEmergencyScaffold,
  isScaffoldBatchResponse,
} from '@/services/scaffolds.service'
import { useConnectivityStore } from '@/store/connectivity-store'
import { useOperationalContextStore } from '@/store/operational-context-store'
import { useSyncStore } from '@/store/sync-store'
import type { EmergencyScaffoldComponentDraft, EmergencyScaffoldDraft } from '@/types/execution'
import type { LocalScaffoldService } from '@/types/local-scaffold'
import { MeasurementUnit, ScaffoldServiceType } from '@/types/scaffold-service'
import { OutboxEntityType, SyncStatus } from '@/types/sync'
import {
  dateInputToIsoDate,
  formatDate,
  formatShortDateTime,
  maskDateInput,
  parseDateInput,
} from '@/utils/date'
import {
  calculateMeasuredTotal,
  getMeasurementUnitLabel,
  getVisibleMeasurementDimensions,
  normalizeMeasuredDimensions,
} from '@/utils/execution'
import { getErrorMessage } from '@/utils/error'
import { blurActiveElement } from '@/utils/focus'
import { createLocalId } from '@/utils/id'

function buildLocalServiceStubs(
  localScaffoldId: string,
  payload: EmergencyScaffoldDraft,
  calculatedTotal: number,
): Omit<LocalScaffoldService, 'createdAt' | 'updatedAt' | 'remoteId'>[] {
  const stubs: Omit<LocalScaffoldService, 'createdAt' | 'updatedAt' | 'remoteId'>[] = []

  if (payload.autoCreateServices) {
    stubs.push({
      localId: createLocalId('svc'),
      localScaffoldId,
      type: ScaffoldServiceType.MONTAGEM,
      plannedUnit: payload.measurementUnit,
      plannedQuantity: calculatedTotal > 0 ? calculatedTotal : null,
      description: payload.description ?? null,
      scaffoldCode: payload.code ?? null,
      scaffoldDescription: payload.description ?? null,
      contractId: payload.contractId,
      unitId: payload.unitId,
      syncStatus: SyncStatus.PENDING,
    })
  }

  if (payload.createDismantlingService) {
    stubs.push({
      localId: createLocalId('svc'),
      localScaffoldId,
      type: ScaffoldServiceType.DESMONTAGEM,
      plannedUnit: payload.measurementUnit,
      plannedQuantity: calculatedTotal > 0 ? calculatedTotal : null,
      description: payload.description ?? null,
      scaffoldCode: payload.code ?? null,
      scaffoldDescription: payload.description ?? null,
      contractId: payload.contractId,
      unitId: payload.unitId,
      syncStatus: SyncStatus.PENDING,
    })
  }

  return stubs
}

type PickerKey = 'scaffoldType' | 'workOrder' | 'project' | 'area' | null
type DateFieldKey = 'assemblyStart' | 'assemblyEnd' | 'disassemblyStart' | 'disassemblyEnd'
type NativeDatePickerState = { field: DateFieldKey }

type SectionProps = {
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
  disabled?: boolean
}

type DatePickerFieldProps = {
  label: string
  value: string
  onChangeText: (value: string) => void
  onPickDate: () => void
}

function DatePickerField({ label, value, onChangeText, onPickDate }: DatePickerFieldProps) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.datePickerRow}>
        <View style={[styles.fieldInput, styles.datePickerInputWrap]}>
          <Ionicons name="calendar-outline" size={15} color={colors.primaryStrong} />
          <TextInput
            value={value}
            onChangeText={(text) => onChangeText(maskDateInput(text))}
            placeholder="dd/mm/aaaa"
            placeholderTextColor="#8AA0A8"
            keyboardType="number-pad"
            style={styles.datePickerTextInput}
          />
        </View>
        <Pressable
          onPress={onPickDate}
          style={({ pressed }) => [
            styles.datePickerButton,
            pressed ? styles.datePickerButtonPressed : null,
          ]}
        >
          <Ionicons name="calendar-clear-outline" size={16} color={colors.primaryStrong} />
        </Pressable>
      </View>
    </View>
  )
}

function Section({ title, subtitle, children }: SectionProps) {
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

function SelectTrigger({
  label,
  value,
  helper,
  placeholder,
  onPress,
  disabled,
}: SelectTriggerProps) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        blurActiveElement()
        onPress()
      }}
      style={({ pressed }) => [
        styles.selectTrigger,
        disabled ? styles.selectTriggerDisabled : null,
        pressed && !disabled ? styles.selectTriggerPressed : null,
      ]}
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

export default function EmergencyPage() {
  const isConnected = useConnectivityStore((state) => state.isConnected)
  const {
    companyId,
    companyName,
    contractId,
    contractCode,
    contractDescription,
    contractPlantName,
    unitId,
    unitCode,
    unitName,
    crewId,
    crewName,
  } = useOperationalContextStore()
  const runSyncNow = useSyncStore((state) => state.runSyncNow)
  const refreshState = useSyncStore((state) => state.refreshState)
  const outboxItems = useSyncStore((state) => state.outboxItems)
  const [activePicker, setActivePicker] = useState<PickerKey>(null)
  const [codeMode, setCodeMode] = useState<'auto' | 'manual'>('auto')
  const [scaffoldTypeId, setScaffoldTypeId] = useState('')
  const [workOrderId, setWorkOrderId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [areaId, setAreaId] = useState('')
  const [code, setCode] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [measurementUnit, setMeasurementUnit] = useState<MeasurementUnit>(MeasurementUnit.M3)
  const [height, setHeight] = useState('')
  const [width, setWidth] = useState('')
  const [length, setLength] = useState('')
  const [autoCreateServices, setAutoCreateServices] = useState(true)
  const [createDismantlingService, setCreateDismantlingService] = useState(true)
  const [assemblyForecastStartDate, setAssemblyForecastStartDate] = useState(formatDate(new Date()))
  const [assemblyForecastEndDate, setAssemblyForecastEndDate] = useState(formatDate(new Date()))
  const [disassemblyForecastStartDate, setDisassemblyForecastStartDate] = useState(
    formatDate(new Date()),
  )
  const [disassemblyForecastEndDate, setDisassemblyForecastEndDate] = useState(
    formatDate(new Date()),
  )
  const [nativeDatePickerState, setNativeDatePickerState] = useState<NativeDatePickerState | null>(
    null,
  )
  const [iosDatePickerValue, setIosDatePickerValue] = useState(new Date())
  const [draftComponents, setDraftComponents] = useState<EmergencyScaffoldComponentDraft[]>([])
  const [componentModalVisible, setComponentModalVisible] = useState(false)
  const [editingComponentIndex, setEditingComponentIndex] = useState<number | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const resetEmergencyForm = useCallback(() => {
    setActivePicker(null)
    setCodeMode('auto')
    setScaffoldTypeId('')
    setWorkOrderId('')
    setProjectId('')
    setAreaId('')
    setCode('')
    setQuantity('1')
    setDescription('')
    setLocation('')
    setMeasurementUnit(MeasurementUnit.M3)
    setHeight('')
    setWidth('')
    setLength('')
    setAutoCreateServices(true)
    setCreateDismantlingService(true)
    setAssemblyForecastStartDate(formatDate(new Date()))
    setAssemblyForecastEndDate(formatDate(new Date()))
    setDisassemblyForecastStartDate(formatDate(new Date()))
    setDisassemblyForecastEndDate(formatDate(new Date()))
    setNativeDatePickerState(null)
    setIosDatePickerValue(new Date())
    setDraftComponents([])
    setComponentModalVisible(false)
    setEditingComponentIndex(null)
    setSubmitError(null)
  }, [])

  const scope =
    contractId && unitId
      ? {
          contractId,
          unitId,
        }
      : null

  const latestScaffoldQuery = useLatestScaffold({ contractId, unitId })
  const refetchLatestScaffold = latestScaffoldQuery.refetch

  useFocusEffect(
    useCallback(() => {
      if (!contractId || !unitId) {
        return
      }

      void refetchLatestScaffold()
    }, [contractId, refetchLatestScaffold, unitId]),
  )

  const latestPendingScaffold = useMemo(() => {
    if (!contractId || !unitId) {
      return null
    }

    return outboxItems
      .filter(
        (item) =>
          item.entityType === OutboxEntityType.EMERGENCY_SCAFFOLD &&
          item.contractId === contractId &&
          item.unitId === unitId &&
          item.syncStatus !== SyncStatus.SYNCED,
      )
      .reduce<
        (typeof outboxItems)[number] | null
      >((latest, current) => (!latest || current.createdAt >= latest.createdAt ? current : latest), null)
  }, [contractId, outboxItems, unitId])

  const latestPendingPayload = latestPendingScaffold?.payload as EmergencyScaffoldDraft | undefined

  const scaffoldTypesQuery = useScaffoldTypes()
  const projectsQuery = useProjects()
  const areasQuery = useAreas({
    companyId,
    unitId,
    contractId,
    projectId: projectId || undefined,
  })
  const workOrdersQuery = useWorkOrders({
    contractId,
    unitId,
    projectId: projectId || undefined,
  })

  const selectedScaffoldType = useMemo(
    () => (scaffoldTypesQuery.data ?? []).find((item) => item.id === scaffoldTypeId) ?? null,
    [scaffoldTypeId, scaffoldTypesQuery.data],
  )

  const selectedProject = useMemo(
    () => (projectsQuery.data ?? []).find((item) => item.id === projectId) ?? null,
    [projectId, projectsQuery.data],
  )

  const selectedArea = useMemo(
    () => (areasQuery.data ?? []).find((item) => item.id === areaId) ?? null,
    [areaId, areasQuery.data],
  )

  const selectedWorkOrder = useMemo(
    () => (workOrdersQuery.data ?? []).find((item) => item.id === workOrderId) ?? null,
    [workOrderId, workOrdersQuery.data],
  )

  const compatibleWorkOrders = useMemo(
    () =>
      (workOrdersQuery.data ?? []).filter((item) => {
        if (item.status !== 'OPEN' && item.status !== 'IN_PROGRESS') {
          return false
        }

        if (item.contractId && item.contractId !== contractId) {
          return false
        }

        if (item.unitId && item.unitId !== unitId) {
          return false
        }

        if (createDismantlingService) {
          return ['GENERIC', 'MONTAGEM', 'DESMONTAGEM'].includes(item.type ?? '')
        }

        return item.type === 'GENERIC' || item.type === 'MONTAGEM'
      }),
    [contractId, createDismantlingService, unitId, workOrdersQuery.data],
  )

  const calculatedTotal = useMemo(
    () =>
      calculateMeasuredTotal(measurementUnit, {
        height: Number(height || 0),
        width: Number(width || 0),
        length: Number(length || 0),
      }),
    [height, length, measurementUnit, width],
  )

  const requestedQuantity = Number(quantity || 1)
  const serviceSummary = useMemo(() => {
    if (!autoCreateServices && !workOrderId) {
      return 'Sem serviços automáticos.'
    }

    if (createDismantlingService) {
      return 'Montagem e desmontagem serão criadas.'
    }

    return 'Serviço de montagem será criado.'
  }, [autoCreateServices, createDismantlingService, workOrderId])

  const workOrderLinkSummary = useMemo(() => {
    if (!selectedWorkOrder) {
      return 'Sem OS vinculada.'
    }

    if (selectedWorkOrder.type === 'GENERIC') {
      return 'OS genérica será vinculada aos serviços compatíveis.'
    }

    return `OS será vinculada ao serviço de ${selectedWorkOrder.type?.toLowerCase()}.`
  }, [selectedWorkOrder])

  const componentBeingEdited =
    editingComponentIndex !== null ? (draftComponents[editingComponentIndex] ?? null) : null

  const visibleMeasurementDimensions = useMemo(
    () => getVisibleMeasurementDimensions(measurementUnit),
    [measurementUnit],
  )

  const scaffoldTypeOptions: SelectionOption[] = (scaffoldTypesQuery.data ?? []).map((item) => ({
    value: item.id,
    label: item.name,
    sublabel: item.code,
    caption: item.description ?? undefined,
  }))

  const projectOptions: SelectionOption[] = (projectsQuery.data ?? []).map((item) => ({
    value: item.id,
    label: item.name,
    sublabel: item.code ?? undefined,
  }))

  const areaOptions: SelectionOption[] = (areasQuery.data ?? []).map((item) => ({
    value: item.id,
    label: item.name,
    sublabel: item.code ?? undefined,
  }))

  const workOrderOptions: SelectionOption[] = compatibleWorkOrders.map((item) => ({
    value: item.id,
    label: item.code,
    sublabel: [item.type, item.status].filter(Boolean).join(' • '),
    caption: item.project?.name ?? undefined,
  }))

  useEffect(() => {
    if (!workOrderId) {
      return
    }

    if (!compatibleWorkOrders.some((item) => item.id === workOrderId)) {
      setWorkOrderId('')
    }
  }, [compatibleWorkOrders, workOrderId])

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

  const handleSaveComponentDraft = (value: EmergencyScaffoldComponentDraft) => {
    setDraftComponents((current) => {
      if (editingComponentIndex === null) {
        return [...current, value]
      }

      return current.map((item, index) => (index === editingComponentIndex ? value : item))
    })

    setEditingComponentIndex(null)
    setComponentModalVisible(false)
  }

  const dateFieldValue = (field: DateFieldKey) => {
    if (field === 'assemblyStart') return assemblyForecastStartDate
    if (field === 'assemblyEnd') return assemblyForecastEndDate
    if (field === 'disassemblyStart') return disassemblyForecastStartDate
    return disassemblyForecastEndDate
  }

  const updateDateField = (field: DateFieldKey, value: Date) => {
    const formatted = formatDate(value)
    if (field === 'assemblyStart') {
      setAssemblyForecastStartDate(formatted)
      return
    }
    if (field === 'assemblyEnd') {
      setAssemblyForecastEndDate(formatted)
      return
    }
    if (field === 'disassemblyStart') {
      setDisassemblyForecastStartDate(formatted)
      return
    }
    setDisassemblyForecastEndDate(formatted)
  }

  const handleDatePickerChange = (
    field: DateFieldKey,
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (event.type !== 'set' || !selectedDate) {
      return
    }
    updateDateField(field, selectedDate)
  }

  const openDatePicker = (field: DateFieldKey) => {
    blurActiveElement()
    const current = parseDateInput(dateFieldValue(field)) ?? new Date()

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        is24Hour: true,
        display: 'calendar',
        onChange: (event, selectedDate) => handleDatePickerChange(field, event, selectedDate),
      })
      return
    }

    if (Platform.OS === 'ios') {
      setIosDatePickerValue(current)
      setNativeDatePickerState({ field })
    }
  }

  const navigateToScaffoldQueue = (scaffoldId?: string | null) => {
    const target = scaffoldId
      ? `/(app)/(tabs)/queue?scaffoldId=${encodeURIComponent(scaffoldId)}&saved=emergency-created`
      : '/(app)/(tabs)/queue?saved=emergency-created'

    blurActiveElement()
    router.replace(target as never)
  }

  const askForAdvance = (scaffoldId?: string | null, createdCount = 1) => {
    const message =
      createdCount > 1
        ? `${createdCount} andaimes cadastrados com sucesso. Deseja ir agora para a fila e lançar a execução dos serviços criados?`
        : 'Andaime cadastrado com sucesso. Deseja ir agora para a fila e lançar a execução dos serviços criados?'

    if (Platform.OS === 'web') {
      const accepted = globalThis.confirm ? globalThis.confirm(message) : true
      if (accepted) {
        navigateToScaffoldQueue(scaffoldId)
        return
      }

      router.replace('/(app)/(tabs)' as never)
      return
    }

    Alert.alert(createdCount > 1 ? 'Andaimes criados' : 'Andaime criado', message, [
      {
        text: 'Depois',
        style: 'cancel',
        onPress: () => router.replace('/(app)/(tabs)' as never),
      },
      {
        text: 'Lançar agora',
        onPress: () => navigateToScaffoldQueue(scaffoldId),
      },
    ])
  }

  const askForAdvanceOffline = (createdCount = 1) => {
    const message =
      createdCount > 1
        ? `${createdCount} andaimes salvos localmente. Os serviços já estão disponíveis na fila. Deseja lançar a execução agora? Os dados serão enviados automaticamente quando a conexão for restabelecida.`
        : 'Andaime salvo localmente. Os serviços já estão disponíveis na fila. Deseja lançar a execução agora? Os dados serão enviados automaticamente quando a conexão for restabelecida.'

    if (Platform.OS === 'web') {
      const accepted = globalThis.confirm ? globalThis.confirm(message) : false
      if (accepted) {
        router.replace('/(app)/(tabs)/queue?saved=queued-local' as never)
        return
      }
      router.replace('/(app)/(tabs)/sync?saved=queued' as never)
      return
    }

    Alert.alert(createdCount > 1 ? 'Andaimes salvos offline' : 'Andaime salvo offline', message, [
      {
        text: 'Ver pendências',
        style: 'cancel',
        onPress: () => router.replace('/(app)/(tabs)/sync?saved=queued' as never),
      },
      {
        text: 'Lançar agora',
        onPress: () => router.replace('/(app)/(tabs)/queue?saved=queued-local' as never),
      },
    ])
  }

  const handleSubmit = async () => {
    if (isSubmitting) {
      return
    }

    if (!scope || !companyId || !crewId) {
      setSubmitError(
        'Defina unidade, contrato e equipe antes de criar um andaime emergencial.',
      )
      return
    }

    if (!scaffoldTypeId) {
      setSubmitError('Selecione o tipo de andaime.')
      return
    }

    const requestedQuantity = Number(quantity || 1)
    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > 100) {
      setSubmitError('Informe uma quantidade de andaimes entre 1 e 100.')
      return
    }

    const manualCode = code.trim()
    if (codeMode === 'manual' && !manualCode) {
      setSubmitError('Informe o código base do andaime ou use código automático.')
      return
    }

    if ((autoCreateServices || workOrderId) && calculatedTotal <= 0) {
      setSubmitError('Informe uma medição válida para criar serviços ou vincular uma OS.')
      return
    }

    if (autoCreateServices) {
      const start = parseDateInput(assemblyForecastStartDate)
      const end = parseDateInput(assemblyForecastEndDate)
      if (!start || !end) {
        setSubmitError('Informe datas válidas para a montagem (dd/mm/aaaa).')
        return
      }
      if (end < start) {
        setSubmitError('A previsão final da montagem não pode ser anterior à inicial.')
        return
      }
    }

    if (createDismantlingService) {
      const start = parseDateInput(disassemblyForecastStartDate)
      const end = parseDateInput(disassemblyForecastEndDate)
      if (!start || !end) {
        setSubmitError('Informe datas válidas para a desmontagem (dd/mm/aaaa).')
        return
      }
      if (end < start) {
        setSubmitError('A previsão final da desmontagem não pode ser anterior à inicial.')
        return
      }
    }

    try {
      setIsSubmitting(true)
      setSubmitError(null)

      const normalizedDimensions = normalizeMeasuredDimensions(measurementUnit, {
        height: height ? Number(height) : undefined,
        width: width ? Number(width) : undefined,
        length: length ? Number(length) : undefined,
      })

      const localId = createLocalId('emergency')
      const payload = {
        localId,
        code: codeMode === 'manual' ? manualCode : undefined,
        quantity: requestedQuantity,
        scaffoldTypeId,
        companyId,
        unitId: scope.unitId,
        contractId: scope.contractId,
        workOrderId: workOrderId || undefined,
        projectId: projectId || undefined,
        areaId: areaId || undefined,
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        measurementUnit,
        height: normalizedDimensions.height,
        width: normalizedDimensions.width,
        length: normalizedDimensions.length,
        volumeM3: measurementUnit === MeasurementUnit.M3 ? calculatedTotal : undefined,
        areaM2: measurementUnit === MeasurementUnit.M2 ? calculatedTotal : undefined,
        linearM: measurementUnit === MeasurementUnit.LINEAR_M ? calculatedTotal : undefined,
        autoCreateServices: autoCreateServices || Boolean(workOrderId),
        createDismantlingService,
        assemblyForecastStartDate: autoCreateServices
          ? (dateInputToIsoDate(assemblyForecastStartDate) ?? undefined)
          : undefined,
        assemblyForecastEndDate: autoCreateServices
          ? (dateInputToIsoDate(assemblyForecastEndDate) ?? undefined)
          : undefined,
        disassemblyForecastStartDate: createDismantlingService
          ? (dateInputToIsoDate(disassemblyForecastStartDate) ?? undefined)
          : undefined,
        disassemblyForecastEndDate: createDismantlingService
          ? (dateInputToIsoDate(disassemblyForecastEndDate) ?? undefined)
          : undefined,
        components: draftComponents.length > 0 ? draftComponents : undefined,
      }

      if (!isConnected) {
        const localStubs: Omit<LocalScaffoldService, 'createdAt' | 'updatedAt' | 'remoteId'>[] = []

        for (let index = 0; index < requestedQuantity; index += 1) {
          const itemLocalId = createLocalId('emergency')
          const itemPayload = {
            ...payload,
            localId: itemLocalId,
            quantity: 1,
            code:
              codeMode === 'manual'
                ? requestedQuantity > 1
                  ? `${manualCode}-${String(index + 1).padStart(2, '0')}`
                  : manualCode
                : undefined,
          }

          await outboxRepository.enqueue({
            localId: itemLocalId,
            entityType: OutboxEntityType.EMERGENCY_SCAFFOLD,
            contractId: scope.contractId,
            unitId: scope.unitId,
            syncStatus: SyncStatus.PENDING,
            payload: itemPayload,
          })

          localStubs.push(...buildLocalServiceStubs(itemLocalId, itemPayload, calculatedTotal))
        }

        // Cria stubs locais dos serviços dos andaimes para que o usuário possa
        // registrar avanços offline imediatamente, sem aguardar a sincronização.
        for (const stub of localStubs) {
          await localScaffoldServiceRepository.insert(stub)
        }

        await refreshState()

        if (localStubs.length > 0) {
          resetEmergencyForm()
          askForAdvanceOffline(requestedQuantity)
          return
        }

        resetEmergencyForm()
        router.replace('/(app)/(tabs)/sync?saved=queued' as never)
        return
      }

      const createdItems = []
      for (let index = 0; index < requestedQuantity; index += 1) {
        const itemLocalId = createLocalId('emergency')
        const created = await createEmergencyScaffold({
          ...payload,
          localId: itemLocalId,
          quantity: 1,
          code:
            codeMode === 'manual'
              ? requestedQuantity > 1
                ? `${manualCode}-${String(index + 1).padStart(2, '0')}`
                : manualCode
              : undefined,
        }, itemLocalId)
        createdItems.push(isScaffoldBatchResponse(created) ? created.items[0] : created)
      }
      const scaffold =
        createdItems.length === 1
          ? createdItems[0]
          : { count: createdItems.length, items: createdItems }

      try {
        await cacheLatestScaffoldFromCreation(scope, scaffold)
      } catch {
        // O cadastro remoto foi concluído; falhas no cache local não devem invalidá-lo.
      }

      try {
        await refreshState()
        await runSyncNow(scope)
      } catch {
        // O cadastro ja foi concluido; se a sincronizacao da fila falhar, ainda seguimos para a fila.
      }

      const createdScaffolds = isScaffoldBatchResponse(scaffold) ? scaffold.items : [scaffold]
      const createdCount = isScaffoldBatchResponse(scaffold) ? scaffold.count : 1
      const singleScaffoldId = createdCount === 1 ? createdScaffolds[0]?.id : undefined
      const hasCreatedServices = createdScaffolds.some(
        (item) => (item.scaffoldServices?.length ?? 0) > 0,
      )

      if (hasCreatedServices) {
        resetEmergencyForm()
        askForAdvance(singleScaffoldId, createdCount)
        return
      }

      resetEmergencyForm()
      navigateToScaffoldQueue(singleScaffoldId)
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Não foi possível registrar o andaime emergencial.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          <View style={styles.page}>
            <View style={styles.headerRow}>
              <View style={styles.headerTextBlock}>
                <Text style={styles.headerTitle}>Andaime emergencial</Text>
                <Text style={styles.headerSubtitle}>
                  Cadastre primeiro. Depois decidimos se seguimos direto para a fila de execução.
                </Text>
              </View>
            </View>

            <NetworkStatusIndicator />

            {!scope || !crewId ? (
              <View style={styles.contextMissingCard}>
                <Text style={styles.contextMissingTitle}>Prepare a jornada antes</Text>
                <Text style={styles.contextMissingDescription}>
                  O cadastro emergencial precisa de unidade, contrato e equipe definidos.
                </Text>
                <Pressable
                  onPress={() => {
                    blurActiveElement()
                    router.push(
                      (contractId && unitId
                        ? '/(app)/context/setup'
                        : '/(app)/context/unit') as never,
                    )
                  }}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed ? styles.primaryButtonPressed : null,
                  ]}
                >
                  <Text style={styles.primaryButtonLabel}>Preparar jornada</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.contextCard}>
                  <Text style={styles.contextCardLabel}>Base operacional</Text>
                  <Text style={styles.contextCardTitle}>
                    {contractDescription ?? contractCode ?? 'Contrato operacional'}
                  </Text>
                  <Text style={styles.contextCardMeta}>
                    {[
                      unitCode && unitName ? `${unitCode} - ${unitName}` : unitName,
                      crewName,
                    ]
                      .filter(Boolean)
                      .join(' • ')}
                  </Text>
                  {contractPlantName || companyName ? (
                    <Text style={styles.contextCardSecondary}>
                      {[contractPlantName, companyName].filter(Boolean).join(' • ')}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.latestPlateCard}>
                  <View style={styles.latestPlateHeader}>
                    <View style={styles.latestPlateTitleRow}>
                      <View style={styles.latestPlateIcon}>
                        <Ionicons name="pricetag-outline" size={15} color={colors.primaryStrong} />
                      </View>
                      <View style={styles.latestPlateTitleBlock}>
                        <Text style={styles.latestPlateLabel}>Última placa registrada</Text>
                        <Text style={styles.latestPlateScope}>Referência deste contrato</Text>
                      </View>
                    </View>

                    <Pressable
                      disabled={!isConnected || latestScaffoldQuery.isFetching}
                      onPress={() => void refetchLatestScaffold()}
                      style={({ pressed }) => [
                        styles.latestPlateRefresh,
                        !isConnected || latestScaffoldQuery.isFetching
                          ? styles.latestPlateRefreshDisabled
                          : null,
                        pressed && isConnected && !latestScaffoldQuery.isFetching
                          ? styles.latestPlateRefreshPressed
                          : null,
                      ]}
                    >
                      <Ionicons
                        name={latestScaffoldQuery.isFetching ? 'sync-outline' : 'refresh-outline'}
                        size={15}
                        color={isConnected ? colors.primaryStrong : colors.textMuted}
                      />
                    </Pressable>
                  </View>

                  {latestScaffoldQuery.data?.snapshot.scaffold ? (
                    <>
                      <Text style={styles.latestPlateCode}>
                        {latestScaffoldQuery.data.snapshot.scaffold.code}
                      </Text>
                      <Text style={styles.latestPlateMeta}>
                        {latestScaffoldQuery.data.source === 'remote'
                          ? `Atualizada em ${formatShortDateTime(latestScaffoldQuery.data.snapshot.refreshedAt)}`
                          : `${isConnected ? 'Última informação salva' : 'Disponível offline'} • sincronizada em ${formatShortDateTime(latestScaffoldQuery.data.snapshot.refreshedAt)}`}
                      </Text>
                    </>
                  ) : latestScaffoldQuery.data?.snapshot ? (
                    <>
                      <Text style={styles.latestPlateEmpty}>Nenhum andaime registrado</Text>
                      <Text style={styles.latestPlateMeta}>
                        {latestScaffoldQuery.data.source === 'remote'
                          ? 'Consulta atualizada para este contrato.'
                          : 'Resultado da última sincronização disponível no aparelho.'}
                      </Text>
                    </>
                  ) : latestScaffoldQuery.isLoading || latestScaffoldQuery.isFetching ? (
                    <Text style={styles.latestPlateEmpty}>Consultando última placa...</Text>
                  ) : (
                    <>
                      <Text style={styles.latestPlateEmpty}>Informação indisponível</Text>
                      <Text style={styles.latestPlateMeta}>
                        {isConnected
                          ? 'Não foi possível consultar a última placa agora.'
                          : 'Conecte-se para carregar a primeira referência deste contrato.'}
                      </Text>
                    </>
                  )}

                  {latestPendingScaffold ? (
                    <View style={styles.pendingPlateCard}>
                      <Ionicons
                        name={latestPendingPayload?.code ? 'cloud-offline-outline' : 'time-outline'}
                        size={15}
                        color="#9A5A12"
                      />
                      <View style={styles.pendingPlateTextBlock}>
                        <Text style={styles.pendingPlateLabel}>
                          {latestPendingPayload?.code
                            ? `Placa local pendente: ${latestPendingPayload.code}`
                            : 'Cadastro automático aguardando sincronização'}
                        </Text>
                        <Text style={styles.pendingPlateMeta}>
                          {latestPendingScaffold.syncStatus === SyncStatus.FAILED
                            ? 'A sincronização falhou. Abra Pendências para revisar.'
                            : latestPendingPayload?.code
                              ? 'Ainda não confirmada pelo servidor.'
                              : 'A placa será atribuída pelo servidor quando houver conexão.'}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </View>

                <Section
                  title="Identificação"
                  subtitle="Defina o tipo do andaime e os vínculos mais úteis desde o cadastro."
                >
                  <SelectTrigger
                    label="Tipo de andaime"
                    value={selectedScaffoldType?.name ?? null}
                    placeholder="Selecionar tipo"
                    helper={selectedScaffoldType?.code ?? 'Obrigatório'}
                    onPress={() => setActivePicker('scaffoldType')}
                  />

                  <SelectTrigger
                    label="Ordem de serviço"
                    value={selectedWorkOrder?.code ?? null}
                    placeholder="Opcional"
                    helper={
                      selectedWorkOrder
                        ? [selectedWorkOrder.type, selectedWorkOrder.status]
                            .filter(Boolean)
                            .join(' • ')
                        : 'Vincule se já houver OS.'
                    }
                    onPress={() => setActivePicker('workOrder')}
                  />

                  <SelectTrigger
                    label="Projeto"
                    value={selectedProject?.name ?? null}
                    placeholder="Opcional"
                    helper={selectedProject?.code ?? 'Ajuda a filtrar e localizar'}
                    onPress={() => setActivePicker('project')}
                  />

                  <SelectTrigger
                    label="Área"
                    value={selectedArea?.name ?? null}
                    placeholder="Opcional"
                    helper={selectedArea?.code ?? 'Refina a localização do andaime'}
                    onPress={() => setActivePicker('area')}
                    disabled={!areasQuery.data?.length}
                  />

                  <SegmentedControl
                    value={codeMode}
                    onChange={setCodeMode}
                    options={[
                      { value: 'auto', label: 'Código automático' },
                      { value: 'manual', label: 'Informar código' },
                    ]}
                  />

                  {codeMode === 'manual' ? (
                    <CompactInput
                      label="Código do andaime"
                      placeholder={
                        Number(quantity || 1) > 1 ? 'Ex.: AND-2026-00021' : 'Ex.: AND-2026-00021'
                      }
                      value={code}
                      onChangeText={setCode}
                    />
                  ) : null}

                  <CompactInput
                    label="Quantidade de andaimes"
                    placeholder="1"
                    keyboardType="number-pad"
                    value={quantity}
                    onChangeText={(value) => {
                      const digits = value.replace(/\D/g, '').slice(0, 3)
                      setQuantity(digits)
                    }}
                  />

                  <Text style={styles.helperText}>
                    {Number(quantity || 1) > 1
                      ? codeMode === 'manual'
                        ? 'O código manual será usado como base: -01, -02, -03...'
                        : 'Serão criados registros independentes com códigos automáticos.'
                      : 'Use 1 para cadastrar apenas este andaime.'}
                  </Text>

                  <CompactInput
                    label="Descrição"
                    placeholder="Descreva rapidamente a necessidade do andaime."
                    value={description}
                    onChangeText={setDescription}
                  />

                  <CompactInput
                    label="Local"
                    placeholder="Ex.: Área quente, linha B, nível 03"
                    value={location}
                    onChangeText={setLocation}
                  />
                </Section>

                <Section
                  title="Medição e serviços"
                  subtitle="Defina a unidade de medição e se os serviços devem nascer automaticamente."
                >
                  <SegmentedControl
                    value={measurementUnit}
                    onChange={setMeasurementUnit}
                    options={[
                      { value: MeasurementUnit.M3, label: 'm³' },
                      { value: MeasurementUnit.M2, label: 'm²' },
                      { value: MeasurementUnit.LINEAR_M, label: 'Linear' },
                    ]}
                  />

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

                  <View style={styles.measureCard}>
                    <Text style={styles.measureCardLabel}>Total calculado</Text>
                    <Text style={styles.measureCardValue}>
                      {calculatedTotal || 0} {getMeasurementUnitLabel(measurementUnit)}
                    </Text>
                  </View>

                  <View style={styles.switchCard}>
                    <View style={styles.switchText}>
                      <Text style={styles.switchTitle}>Criar serviços automaticamente</Text>
                      <Text style={styles.switchDescription}>
                        Montagem e, se desejar, desmontagem já nascem no cadastro.
                      </Text>
                    </View>
                    <Switch
                      value={autoCreateServices}
                      onValueChange={(value) => {
                        setAutoCreateServices(value)
                        if (!value) {
                          setCreateDismantlingService(false)
                        }
                      }}
                    />
                  </View>

                  {autoCreateServices ? (
                    <>
                      <View style={styles.inlineGrid}>
                        <DatePickerField
                          label="Montagem - início previsto"
                          value={assemblyForecastStartDate}
                          onChangeText={setAssemblyForecastStartDate}
                          onPickDate={() => openDatePicker('assemblyStart')}
                        />
                        <DatePickerField
                          label="Montagem - fim previsto"
                          value={assemblyForecastEndDate}
                          onChangeText={setAssemblyForecastEndDate}
                          onPickDate={() => openDatePicker('assemblyEnd')}
                        />
                      </View>

                      <View style={styles.switchCard}>
                        <View style={styles.switchText}>
                          <Text style={styles.switchTitle}>Criar desmontagem futura</Text>
                          <Text style={styles.switchDescription}>
                            Abra também o serviço futuro de desmontagem planejada.
                          </Text>
                        </View>
                        <Switch
                          value={createDismantlingService}
                          onValueChange={setCreateDismantlingService}
                        />
                      </View>

                      {createDismantlingService ? (
                        <View style={styles.inlineGrid}>
                          <DatePickerField
                            label="Desmontagem - início previsto"
                            value={disassemblyForecastStartDate}
                            onChangeText={setDisassemblyForecastStartDate}
                            onPickDate={() => openDatePicker('disassemblyStart')}
                          />
                          <DatePickerField
                            label="Desmontagem - fim previsto"
                            value={disassemblyForecastEndDate}
                            onChangeText={setDisassemblyForecastEndDate}
                            onPickDate={() => openDatePicker('disassemblyEnd')}
                          />
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.helperText}>
                      Sem serviços automáticos, o cadastro cria apenas o andaime.
                    </Text>
                  )}
                </Section>

                <Section
                  title="Lotes de componentes"
                  subtitle="Monte a estrutura inicial do andaime para sair mais organizado desde o começo."
                >
                  <View style={styles.componentSummaryCard}>
                    <Text style={styles.componentSummaryLabel}>Lotes cadastrados</Text>
                    <Text style={styles.componentSummaryValue}>{draftComponents.length}</Text>
                  </View>

                  {draftComponents.length === 0 ? (
                    <View style={styles.inlineEmptyState}>
                      <Text style={styles.inlineEmptyTitle}>Nenhum lote cadastrado</Text>
                      <Text style={styles.inlineEmptyDescription}>
                        Você pode seguir sem lotes ou estruturar o andaime agora.
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.componentList}>
                      {draftComponents.map((component, index) => (
                        <View key={`${component.name}-${index}`} style={styles.componentRow}>
                          <View style={styles.componentInfo}>
                            <Text style={styles.componentName}>{component.name}</Text>
                            <Text style={styles.componentMeta}>
                              {[
                                component.category,
                                component.measurementUnit,
                                component.plannedQuantity,
                              ]
                                .filter(Boolean)
                                .join(' • ')}
                            </Text>
                          </View>

                          <View style={styles.componentActions}>
                            <Pressable
                              onPress={() => {
                                setEditingComponentIndex(index)
                                setComponentModalVisible(true)
                              }}
                              style={({ pressed }) => [
                                styles.ghostButton,
                                pressed ? styles.ghostButtonPressed : null,
                              ]}
                            >
                              <Ionicons
                                name="create-outline"
                                size={14}
                                color={colors.primaryStrong}
                              />
                              <Text style={styles.ghostButtonLabel}>Editar</Text>
                            </Pressable>

                            <Pressable
                              onPress={() =>
                                setDraftComponents((current) =>
                                  current.filter((_, currentIndex) => currentIndex !== index),
                                )
                              }
                              style={({ pressed }) => [
                                styles.removeButton,
                                pressed ? styles.removeButtonPressed : null,
                              ]}
                            >
                              <Ionicons name="trash-outline" size={14} color={colors.danger} />
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  <Pressable
                    onPress={() => {
                      setEditingComponentIndex(null)
                      setComponentModalVisible(true)
                    }}
                    style={({ pressed }) => [
                      styles.secondaryAction,
                      pressed ? styles.secondaryActionPressed : null,
                    ]}
                  >
                    <Text style={styles.secondaryActionLabel}>Adicionar lote de componente</Text>
                    <Ionicons name="add" size={16} color={colors.primaryStrong} />
                  </Pressable>
                </Section>

                <Section
                  title="Próximo passo"
                  subtitle="Depois de cadastrar, perguntamos se você já quer seguir direto para a fila e lançar a execução."
                >
                  <View style={styles.creationSummaryCard}>
                    <View style={styles.creationSummaryRow}>
                      <Text style={styles.creationSummaryLabel}>Quantidade</Text>
                      <Text style={styles.creationSummaryValue}>
                        {Number.isFinite(requestedQuantity) ? requestedQuantity : 1}
                      </Text>
                    </View>
                    <View style={styles.creationSummaryRow}>
                      <Text style={styles.creationSummaryLabel}>Serviços</Text>
                      <Text style={styles.creationSummaryText}>{serviceSummary}</Text>
                    </View>
                    <View style={styles.creationSummaryRow}>
                      <Text style={styles.creationSummaryLabel}>OS</Text>
                      <Text style={styles.creationSummaryText}>{workOrderLinkSummary}</Text>
                    </View>
                  </View>

                  <View style={styles.nextStepCard}>
                    <Ionicons name="flash-outline" size={18} color={colors.primaryStrong} />
                    <Text style={styles.nextStepText}>
                      Se os serviços forem criados agora, o app já pode abrir a fila filtrada nesse
                      novo andaime.
                    </Text>
                  </View>
                </Section>

                {submitError ? (
                  <Banner tone="danger" title="Não foi possível salvar" description={submitError} />
                ) : null}

                <Pressable
                  onPress={() => void handleSubmit()}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    isSubmitting ? styles.primaryButtonDisabled : null,
                    pressed && !isSubmitting ? styles.primaryButtonPressed : null,
                  ]}
                  disabled={isSubmitting}
                >
                  <Text style={styles.primaryButtonLabel}>
                    {isSubmitting ? 'Cadastrando...' : 'Cadastrar andaime emergencial'}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {Platform.OS === 'ios' && nativeDatePickerState ? (
        <Modal
          transparent
          animationType="fade"
          visible
          onRequestClose={() => setNativeDatePickerState(null)}
        >
          <View style={styles.pickerOverlay}>
            <Pressable
              style={styles.pickerBackdrop}
              onPress={() => setNativeDatePickerState(null)}
            />
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>Selecionar data</Text>
                <Pressable
                  onPress={() => setNativeDatePickerState(null)}
                  style={({ pressed }) => [
                    styles.pickerCloseButton,
                    pressed ? styles.pickerCloseButtonPressed : null,
                  ]}
                >
                  <Text style={styles.pickerCloseButtonLabel}>Concluir</Text>
                </Pressable>
              </View>

              <DateTimePicker
                value={iosDatePickerValue}
                mode="date"
                display="spinner"
                is24Hour
                locale="pt-BR"
                onChange={(event, selectedDate) => {
                  if (event.type !== 'set' || !selectedDate) {
                    return
                  }
                  setIosDatePickerValue(selectedDate)
                  updateDateField(nativeDatePickerState.field, selectedDate)
                }}
              />
            </View>
          </View>
        </Modal>
      ) : null}

      <SelectionModal
        visible={activePicker === 'scaffoldType'}
        title="Tipo de andaime"
        subtitle="Defina a tipologia principal deste emergencial."
        options={scaffoldTypeOptions}
        selectedValue={scaffoldTypeId}
        onSelect={setScaffoldTypeId}
        onClose={() => setActivePicker(null)}
      />

      <SelectionModal
        visible={activePicker === 'workOrder'}
        title="Ordem de serviço"
        subtitle="A lista mostra apenas OS abertas/em andamento compatíveis com este contexto."
        options={workOrderOptions}
        selectedValue={workOrderId}
        onSelect={(value) => {
          setWorkOrderId(value)
          if (value) {
            setAutoCreateServices(true)
          }
        }}
        onClose={() => setActivePicker(null)}
      />

      <SelectionModal
        visible={activePicker === 'project'}
        title="Projeto"
        subtitle="Projeto é opcional, mas ajuda a organizar áreas e relatórios."
        options={projectOptions}
        selectedValue={projectId}
        onSelect={(value) => {
          setProjectId(value)
          setAreaId('')
        }}
        onClose={() => setActivePicker(null)}
      />

      <SelectionModal
        visible={activePicker === 'area'}
        title="Área"
        subtitle="Selecione a área operacional quando ela já existir no sistema."
        options={areaOptions}
        selectedValue={areaId}
        onSelect={setAreaId}
        onClose={() => setActivePicker(null)}
      />

      <ComponentDraftModal
        visible={componentModalVisible}
        initialValue={componentBeingEdited}
        onClose={() => {
          setComponentModalVisible(false)
          setEditingComponentIndex(null)
        }}
        onSave={handleSaveComponentDraft}
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
  headerTextBlock: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  contextMissingCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  contextMissingTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  contextMissingDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  contextCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: 4,
  },
  contextCardLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  contextCardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  contextCardMeta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  contextCardSecondary: {
    color: colors.textMuted,
    fontSize: 11,
  },
  latestPlateCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#CFE0E5',
    backgroundColor: '#F4F9FA',
    padding: spacing.md,
    gap: spacing.sm,
  },
  latestPlateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  latestPlateTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  latestPlateIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  latestPlateTitleBlock: {
    flex: 1,
    gap: 1,
  },
  latestPlateLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  latestPlateScope: {
    color: colors.textMuted,
    fontSize: 10,
  },
  latestPlateRefresh: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  latestPlateRefreshPressed: {
    opacity: 0.82,
  },
  latestPlateRefreshDisabled: {
    opacity: 0.55,
  },
  latestPlateCode: {
    color: colors.primaryStrong,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  latestPlateEmpty: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  latestPlateMeta: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 15,
  },
  pendingPlateCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E8D2AE',
    backgroundColor: '#FFF8EC',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  pendingPlateTextBlock: {
    flex: 1,
    gap: 2,
  },
  pendingPlateLabel: {
    color: '#7A4710',
    fontSize: 11,
    fontWeight: '700',
  },
  pendingPlateMeta: {
    color: '#956329',
    fontSize: 10,
    lineHeight: 14,
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
    minHeight: 104,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    textAlignVertical: 'top',
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
  selectTriggerDisabled: {
    opacity: 0.5,
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
  inlineGrid: {
    gap: spacing.sm,
  },
  measureCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  measureCardLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  measureCardValue: {
    color: colors.primaryStrong,
    fontSize: 14,
    fontWeight: '700',
  },
  switchCard: {
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
  switchText: {
    flex: 1,
    gap: 2,
  },
  switchTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  switchDescription: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  helperText: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  creationSummaryCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#DCE8EE',
    backgroundColor: '#F6FAFB',
    padding: spacing.md,
    gap: spacing.sm,
  },
  creationSummaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  creationSummaryLabel: {
    width: 82,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  creationSummaryValue: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  creationSummaryText: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  componentSummaryCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  componentSummaryLabel: {
    color: colors.textMuted,
    fontSize: 11,
  },
  componentSummaryValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
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
  componentList: {
    gap: spacing.sm,
  },
  componentRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  componentInfo: {
    gap: 2,
  },
  componentName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  componentMeta: {
    color: colors.textMuted,
    fontSize: 11,
  },
  componentActions: {
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
  removeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E8C8C1',
    backgroundColor: '#FFF3F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonPressed: {
    opacity: 0.86,
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
  nextStepCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  nextStepText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 17,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonLabel: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  datePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  datePickerInputWrap: {
    flex: 1,
    minHeight: 46,
    minWidth: 0,
    paddingRight: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  datePickerTextInput: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 13,
    paddingVertical: 0,
  },
  datePickerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePickerButtonPressed: {
    opacity: 0.84,
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
