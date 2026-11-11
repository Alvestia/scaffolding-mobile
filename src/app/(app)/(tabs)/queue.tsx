import { Ionicons } from '@expo/vector-icons'
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Banner } from '@/components/ui/banner'
import { NetworkStatusIndicator } from '@/components/app/network-status-indicator'
import { AvailabilityBadge } from '@/components/inspection/availability-badge'
import { SelectionModal, type SelectionOption } from '@/components/ui/selection-modal'
import { colors, radius, spacing } from '@/constants/theme'
import { useExecutionQueue } from '@/hooks/use-execution-queue'
import { useAvailabilityMap, usePendingInspectionWork } from '@/hooks/use-inspections'
import type { QueueServiceItem } from '@/types/scaffold-service'
import { useConnectivityStore } from '@/store/connectivity-store'
import { useOperationalContextStore } from '@/store/operational-context-store'
import { useSyncStore } from '@/store/sync-store'
import {
  dateInputToIsoDate,
  formatBusinessDate,
  formatDate,
  maskDateInput,
  parseDateInput,
} from '@/utils/date'
import { getErrorMessage } from '@/utils/error'
import { blurActiveElement } from '@/utils/focus'
import { isLocalId } from '@/utils/id'

type QueueMode = 'backlog' | 'cronograma'
type StatusFilter = 'ALL' | 'NAO_INICIADO' | 'EM_EXECUCAO' | 'CONCLUIDO'
type QuickFilter = 'ALL' | 'PENDING' | 'RUNNING' | 'LOCAL'
type DateFieldKey = 'startDate' | 'endDate'
type NativePickerState = { field: DateFieldKey }

const STATUS_OPTIONS: SelectionOption[] = [
  { value: 'ALL', label: 'Todos', sublabel: 'Sem filtro por status' },
  { value: 'NAO_INICIADO', label: 'Não iniciado' },
  { value: 'EM_EXECUCAO', label: 'Em execução' },
  { value: 'CONCLUIDO', label: 'Concluído' },
]

const STATUS_LABELS: Record<StatusFilter, string> = {
  ALL: 'Todos',
  NAO_INICIADO: 'Não iniciado',
  EM_EXECUCAO: 'Em execução',
  CONCLUIDO: 'Concluído',
}

const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'RUNNING', label: 'Em execução' },
  { value: 'LOCAL', label: 'Locais' },
]

function formatQueueDate(value?: string | null) {
  return formatBusinessDate(value) ?? '--/--/----'
}

function getChronologicalDate(item: QueueServiceItem) {
  return item.startForecast ?? item.endForecast ?? null
}

function getCategoryLabel(item: QueueServiceItem) {
  return item.scaffoldComponent?.category ?? 'OPERACAO'
}

function getOperationTypeLabel(item: QueueServiceItem) {
  switch (item.type) {
    case 'MONTAGEM':
      return 'Montagem'
    case 'DESMONTAGEM':
      return 'Desmontagem'
    case 'MODIFICACAO':
      return 'Modificacao'
    default:
      return item.type
  }
}

function getStatusLabel(item: QueueServiceItem) {
  return item.status === 'EM_EXECUCAO' ? 'Em andamento' : 'Pendente'
}

function getStatusTone(item: QueueServiceItem) {
  return item.status === 'EM_EXECUCAO' ? styles.statusSuccess : styles.statusWarning
}

/** Released scaffolds and those out of use (being assembled, dismantled) need no warning. */
function shouldWarnAvailability(
  availability: { status: string; overdue: boolean } | undefined,
  localInterdiction: boolean,
) {
  if (localInterdiction) return true
  if (!availability || availability.status === 'NOT_APPLICABLE') return false
  return availability.status !== 'RELEASED' || availability.overdue
}

export default function QueuePage() {
  const router = useRouter()
  const { saved, scaffoldId } = useLocalSearchParams<{ saved?: string; scaffoldId?: string }>()
  const isConnected = useConnectivityStore((state) => state.isConnected)
  const runSyncNow = useSyncStore((state) => state.runSyncNow)
  const isSyncing = useSyncStore((state) => state.isSyncing)
  const {
    contractId,
    unitId,
    unitCode,
    unitName,
    contractCode,
    contractDescription,
    contractPlantName,
  } = useOperationalContextStore()
  const [mode, setMode] = useState<QueueMode | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('ALL')
  const [plateFilter, setPlateFilter] = useState('')
  const [workOrderFilter, setWorkOrderFilter] = useState('ALL')
  const [areaFilter, setAreaFilter] = useState('ALL')
  const [statusPickerOpen, setStatusPickerOpen] = useState(false)
  const [workOrderPickerOpen, setWorkOrderPickerOpen] = useState(false)
  const [areaPickerOpen, setAreaPickerOpen] = useState(false)
  const [nativePickerState, setNativePickerState] = useState<NativePickerState | null>(null)
  const [iosPickerValue, setIosPickerValue] = useState(new Date())

  const isCronogramaActive = mode === 'cronograma'

  const queueFilters = useMemo(() => {
    if (!isCronogramaActive) {
      return undefined
    }

    const filters: {
      statuses?: string[]
      startForecast?: string
      endForecast?: string
    } = {}

    if (statusFilter !== 'ALL') {
      filters.statuses = [statusFilter]
    }

    const startIso = dateInputToIsoDate(startDate)
    if (startIso) {
      filters.startForecast = startIso
    }

    const endIso = dateInputToIsoDate(endDate)
    if (endIso) {
      filters.endForecast = endIso
    }

    return Object.keys(filters).length > 0 ? filters : undefined
  }, [endDate, isCronogramaActive, startDate, statusFilter])

  const queueQuery = useExecutionQueue({ contractId, unitId }, queueFilters)
  // Warns who executes when the scaffold is interdicted or not released by inspection.
  const availabilityMap = useAvailabilityMap({ contractId, unitId })
  const pendingInspectionWork = usePendingInspectionWork()

  const scope = useMemo(
    () =>
      contractId && unitId
        ? {
            contractId,
            unitId,
          }
        : null,
    [contractId, unitId],
  )

  const refetchRef = useRef(queueQuery.refetch)
  refetchRef.current = queueQuery.refetch

  useFocusEffect(
    useCallback(() => {
      if (!scope) {
        return
      }
      void refetchRef.current()
    }, [scope]),
  )

  const items = useMemo(() => queueQuery.data ?? [], [queueQuery.data])
  const workOrderOptions = useMemo<SelectionOption[]>(() => {
    const options = new Map<string, SelectionOption>()
    for (const item of items) {
      if (item.workOrder) {
        options.set(item.workOrder.id, {
          value: item.workOrder.id,
          label: item.workOrder.code,
        })
      }
    }

    return [
      { value: 'ALL', label: 'Todas as ordens de serviço' },
      ...[...options.values()].sort((left, right) => left.label.localeCompare(right.label)),
    ]
  }, [items])
  const areaOptions = useMemo<SelectionOption[]>(() => {
    const options = new Map<string, SelectionOption>()
    for (const item of items) {
      const area = item.scaffold?.area ?? item.scaffold?.areaRef ?? item.workOrder?.areaRef
      if (area) {
        options.set(area.id, {
          value: area.id,
          label: area.name,
          sublabel: area.code ?? undefined,
        })
      }
    }

    return [
      { value: 'ALL', label: 'Todas as áreas' },
      ...[...options.values()].sort((left, right) => left.label.localeCompare(right.label)),
    ]
  }, [items])
  const selectedWorkOrderLabel =
    workOrderOptions.find((option) => option.value === workOrderFilter)?.label ??
    'Todas as ordens de serviço'
  const selectedAreaLabel =
    areaOptions.find((option) => option.value === areaFilter)?.label ?? 'Todas as áreas'
  const activeMode: QueueMode = mode ?? (items.length > 0 ? 'backlog' : 'cronograma')
  const canRefreshQueue = Boolean(scope && isConnected && !isSyncing && !queueQuery.isFetching)

  const visibleItems = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase()
    const normalizedPlate = plateFilter.trim().toLowerCase()
    const scopedItems = scaffoldId ? items.filter((item) => item.scaffoldId === scaffoldId) : items

    const specificFilteredItems = scopedItems.filter((item) => {
      if (normalizedPlate && !item.scaffold?.code?.toLowerCase().includes(normalizedPlate)) {
        return false
      }

      if (
        workOrderFilter !== 'ALL' &&
        item.workOrderId !== workOrderFilter &&
        item.workOrder?.id !== workOrderFilter
      ) {
        return false
      }

      const itemAreaId =
        item.scaffold?.areaId ??
        item.scaffold?.area?.id ??
        item.scaffold?.areaRef?.id ??
        item.workOrder?.areaId ??
        item.workOrder?.areaRef?.id
      if (areaFilter !== 'ALL' && itemAreaId !== areaFilter) {
        return false
      }

      return true
    })

    const quickFilteredItems = specificFilteredItems.filter((item) => {
      if (quickFilter === 'PENDING') {
        return item.status === 'NAO_INICIADO'
      }

      if (quickFilter === 'RUNNING') {
        return item.status === 'EM_EXECUCAO'
      }

      if (quickFilter === 'LOCAL') {
        return isLocalId(item.id) || isLocalId(item.scaffoldId)
      }

      return true
    })

    const source = [...quickFilteredItems].sort((left, right) => {
      if (activeMode === 'cronograma') {
        return (getChronologicalDate(left) ?? '').localeCompare(getChronologicalDate(right) ?? '')
      }

      if (left.status === right.status) {
        return (left.scaffold?.code ?? '').localeCompare(right.scaffold?.code ?? '')
      }

      return left.status === 'EM_EXECUCAO' ? -1 : 1
    })

    if (!normalizedSearch) {
      return source
    }

    return source.filter((item) =>
      [
        item.scaffold?.code,
        item.workOrder?.code,
        item.description,
        item.scaffold?.description,
        item.scaffoldComponent?.name,
        item.scaffoldComponent?.category,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch),
    )
  }, [
    activeMode,
    areaFilter,
    items,
    plateFilter,
    quickFilter,
    scaffoldId,
    searchValue,
    workOrderFilter,
  ])

  const scaffoldCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of visibleItems) {
      counts.set(item.scaffoldId, (counts.get(item.scaffoldId) ?? 0) + 1)
    }
    return counts
  }, [visibleItems])

  const setFilterDateFromPicker = (field: DateFieldKey, date: Date) => {
    if (field === 'startDate') {
      setStartDate(formatDate(date))
      return
    }
    setEndDate(formatDate(date))
  }

  const openDatePicker = (field: DateFieldKey) => {
    blurActiveElement()
    const current = field === 'startDate' ? startDate : endDate
    const pickerDate = parseDateInput(current) ?? new Date()

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: pickerDate,
        mode: 'date',
        is24Hour: true,
        display: 'calendar',
        onChange: (event: DateTimePickerEvent, selectedDate?: Date) => {
          if (event.type !== 'set' || !selectedDate) return
          setFilterDateFromPicker(field, selectedDate)
        },
      })
      return
    }

    if (Platform.OS === 'ios') {
      setIosPickerValue(pickerDate)
      setNativePickerState({ field })
    }
  }

  if (!scope) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.page}>
          <View style={styles.emptyContextCard}>
            <Text style={styles.emptyContextTitle}>Escolha o contexto primeiro</Text>
            <Text style={styles.emptyContextDescription}>
              A fila de execucao aparece depois que unidade e contrato forem definidos.
            </Text>
            <Pressable
              onPress={() => router.push('/(app)/context/unit' as never)}
              style={({ pressed }) => [
                styles.primaryContextButton,
                pressed ? styles.primaryContextButtonPressed : null,
              ]}
            >
              <Text style={styles.primaryContextButtonLabel}>Selecionar contexto</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        style={styles.page}
      >
        <FlatList
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          data={queueQuery.isLoading || queueQuery.error ? [] : visibleItems}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.contentContainer}
          renderItem={({ item, index }) => (
            <View>
              {index === 0 || visibleItems[index - 1]?.scaffoldId !== item.scaffoldId ? (
                <View style={styles.groupHeader}>
                  <View style={styles.groupHeaderText}>
                    <Text style={styles.groupTitle}>{item.scaffold?.code ?? 'Andaime local'}</Text>
                    {shouldWarnAvailability(
                      availabilityMap.byScaffold.get(item.scaffoldId),
                      pendingInspectionWork.interdictions.has(item.scaffoldId),
                    ) ? (
                      <AvailabilityBadge
                        availability={
                          availabilityMap.byScaffold.get(item.scaffoldId) ?? {
                            status: 'INTERDICTED',
                            overdue: false,
                          }
                        }
                        localInterdiction={pendingInspectionWork.interdictions.has(item.scaffoldId)}
                        compact
                      />
                    ) : null}
                    <Text style={styles.groupSubtitle} numberOfLines={1}>
                      {[
                        item.scaffold?.scaffoldType?.name,
                        item.scaffold?.location,
                        item.scaffold?.description,
                      ]
                        .filter(Boolean)
                        .join(' • ') || 'Atividades do andaime'}
                    </Text>
                  </View>
                  <View style={styles.groupCountPill}>
                    <Text style={styles.groupCountLabel}>
                      {scaffoldCounts.get(item.scaffoldId) ?? 0}
                    </Text>
                  </View>
                </View>
              ) : null}

              <View style={styles.taskCard}>
                <Pressable
                  onPress={() => router.push(`/(app)/queue/${item.id}` as never)}
                  style={({ pressed }) => [
                    styles.taskCardBody,
                    pressed ? styles.taskCardBodyPressed : null,
                  ]}
                >
                  <View style={styles.taskCardTop}>
                    <View style={styles.categoryWrap}>
                      <Ionicons name="albums-outline" size={13} color={colors.textMuted} />
                      <Text style={styles.categoryLabel}>{getCategoryLabel(item)}</Text>
                    </View>
                    <View style={[styles.statusPill, getStatusTone(item)]}>
                      <View style={styles.statusDot} />
                      <Text style={styles.statusLabel}>{getStatusLabel(item)}</Text>
                    </View>
                  </View>

                  {isLocalId(item.id) ? (
                    <View style={styles.offlineItemBadge}>
                      <Ionicons name="cloud-offline-outline" size={11} color="#B85C00" />
                      <Text style={styles.offlineItemBadgeLabel}>
                        Offline — aguardando sincronização
                      </Text>
                    </View>
                  ) : null}

                  <Text style={styles.codeLine} numberOfLines={1}>
                    {item.scaffold?.code ?? 'ANDAIME'} {'->'} {item.workOrder?.code ?? 'Sem OS'}
                  </Text>

                  <Text style={styles.itemLabel} numberOfLines={1}>
                    {item.scaffoldComponent?.name ?? `Item ${index + 1}`}
                  </Text>

                  <Text style={styles.operationTypeLine} numberOfLines={1}>
                    {getOperationTypeLabel(item)}
                  </Text>

                  {item.scaffold?.scaffoldType?.name || item.scaffold?.location ? (
                    <Text style={styles.scaffoldMetaLine} numberOfLines={1}>
                      {item.scaffold?.scaffoldType?.name
                        ? `Tipo: ${item.scaffold.scaffoldType.name}`
                        : ''}
                      {item.scaffold?.scaffoldType?.name && item.scaffold?.location ? '  •  ' : ''}
                      {item.scaffold?.location ? `Local: ${item.scaffold.location}` : ''}
                    </Text>
                  ) : null}

                  <Text style={styles.descriptionLine} numberOfLines={2}>
                    {(
                      item.description ??
                      item.scaffold?.description ??
                      'Sem descricao operacional'
                    ).toUpperCase()}
                  </Text>

                  <View style={styles.taskFooter}>
                    <View style={styles.metaPill}>
                      <Ionicons name="people-outline" size={13} color={colors.textMuted} />
                      <Text style={styles.metaPillLabel}>Efetivo no lançamento</Text>
                    </View>

                    <View style={styles.metaPill}>
                      <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
                      <Text style={styles.metaPillLabel}>
                        {formatQueueDate(item.endForecast ?? item.startForecast)}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => router.push(`/(app)/queue/${item.id}/execute` as never)}
                      style={({ pressed }) => [
                        styles.inlineActionButton,
                        pressed ? styles.inlineActionButtonPressed : null,
                      ]}
                    >
                      <Ionicons name="arrow-forward" size={16} color={colors.white} />
                    </Pressable>
                  </View>
                </Pressable>
              </View>
            </View>
          )}
          ListHeaderComponent={
            <>
              <View style={styles.headerRow}>
                <View style={styles.titleBlock}>
                  <Text style={styles.pageTitle}>Fila de execucao</Text>
                  <Text style={styles.pageSubtitle}>
                    {contractCode
                      ? `${contractCode} • ${unitCode ?? 'UN'}`
                      : (unitName ?? 'Contrato operacional')}
                  </Text>
                </View>

                <NetworkStatusIndicator />
                <Pressable
                  onPress={() => setSearchOpen((current) => !current)}
                  style={({ pressed }) => [
                    styles.headerIconButton,
                    pressed ? styles.headerIconButtonPressed : null,
                  ]}
                >
                  <Ionicons
                    name={searchOpen ? 'close-outline' : 'search-outline'}
                    size={20}
                    color={colors.text}
                  />
                </Pressable>
              </View>

              {saved === 'synced' ? (
                <View style={styles.successPill}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                  <Text style={styles.successPillLabel}>Apontamento enviado com sucesso</Text>
                </View>
              ) : null}

              {saved === 'emergency-created' ? (
                <View style={styles.successPill}>
                  <Ionicons name="flash-outline" size={14} color={colors.success} />
                  <Text style={styles.successPillLabel}>
                    Andaime criado. Escolha o serviço para lançar a execução.
                  </Text>
                </View>
              ) : null}

              {saved === 'queued-local' ? (
                <View style={styles.offlineQueuePill}>
                  <Ionicons name="cloud-offline-outline" size={14} color="#B85C00" />
                  <Text style={styles.offlineQueuePillLabel}>
                    Andaime salvo offline. Serviços disponíveis para lançamento.
                  </Text>
                </View>
              ) : null}

              <Pressable
                onPress={() => router.push('/(app)/context/unit' as never)}
                style={({ pressed }) => [
                  styles.scopeCard,
                  pressed ? styles.scopeCardPressed : null,
                ]}
              >
                <View style={styles.scopeTextBlock}>
                  <Text style={styles.scopeLabel}>Contrato selecionado</Text>
                  <Text numberOfLines={1} style={styles.scopeValue}>
                    {contractDescription ?? contractCode ?? 'Contrato operacional'}
                  </Text>
                  <Text numberOfLines={1} style={styles.scopeMeta}>
                    {[
                      contractPlantName,
                      unitCode && unitName ? `${unitCode} - ${unitName}` : unitName,
                    ]
                      .filter(Boolean)
                      .join(' • ')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>

              <View style={styles.segmentRow}>
                <Pressable
                  onPress={() => setMode('backlog')}
                  style={({ pressed }) => [
                    styles.segmentButton,
                    activeMode === 'backlog' ? styles.segmentButtonActive : null,
                    pressed ? styles.segmentButtonPressed : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentButtonLabel,
                      activeMode === 'backlog' ? styles.segmentButtonLabelActive : null,
                    ]}
                  >
                    Backlog
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setMode('cronograma')}
                  style={({ pressed }) => [
                    styles.segmentButton,
                    activeMode === 'cronograma' ? styles.segmentButtonActive : null,
                    pressed ? styles.segmentButtonPressed : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentButtonLabel,
                      activeMode === 'cronograma' ? styles.segmentButtonLabelActive : null,
                    ]}
                  >
                    Cronograma
                  </Text>
                </Pressable>
              </View>

              {searchOpen ? (
                <View style={styles.searchShell}>
                  <Ionicons name="search-outline" size={16} color={colors.textMuted} />
                  <TextInput
                    value={searchValue}
                    onChangeText={setSearchValue}
                    placeholder="Buscar codigo, item ou descricao"
                    placeholderTextColor="#A6B4BC"
                    style={styles.searchInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              ) : null}

              <View style={styles.quickFilterRow}>
                {QUICK_FILTERS.map((filter) => (
                  <Pressable
                    key={filter.value}
                    onPress={() => setQuickFilter(filter.value)}
                    style={({ pressed }) => [
                      styles.quickFilterButton,
                      quickFilter === filter.value ? styles.quickFilterButtonActive : null,
                      pressed ? styles.quickFilterButtonPressed : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.quickFilterLabel,
                        quickFilter === filter.value ? styles.quickFilterLabelActive : null,
                      ]}
                    >
                      {filter.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.specificFilterShell}>
                <View style={styles.filterDateInputWrap}>
                  <Ionicons name="pricetag-outline" size={14} color={colors.textMuted} />
                  <TextInput
                    value={plateFilter}
                    onChangeText={setPlateFilter}
                    placeholder="Filtrar pela placa do andaime"
                    placeholderTextColor="#A6B4BC"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    style={styles.filterDateInput}
                  />
                </View>

                <Pressable
                  onPress={() => {
                    blurActiveElement()
                    setWorkOrderPickerOpen(true)
                  }}
                  style={({ pressed }) => [
                    styles.filterSelect,
                    pressed ? styles.filterIconButtonPressed : null,
                  ]}
                >
                  <Text style={styles.filterFieldValue} numberOfLines={1}>
                    OS: {selectedWorkOrderLabel}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                </Pressable>

                <Pressable
                  onPress={() => {
                    blurActiveElement()
                    setAreaPickerOpen(true)
                  }}
                  style={({ pressed }) => [
                    styles.filterSelect,
                    pressed ? styles.filterIconButtonPressed : null,
                  ]}
                >
                  <Text style={styles.filterFieldValue} numberOfLines={1}>
                    Área: {selectedAreaLabel}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                </Pressable>

                {plateFilter || workOrderFilter !== 'ALL' || areaFilter !== 'ALL' ? (
                  <Pressable
                    onPress={() => {
                      setPlateFilter('')
                      setWorkOrderFilter('ALL')
                      setAreaFilter('ALL')
                    }}
                    style={({ pressed }) => [
                      styles.filterClearButton,
                      pressed ? styles.filterIconButtonPressed : null,
                    ]}
                  >
                    <Ionicons name="close-circle-outline" size={14} color={colors.primaryStrong} />
                    <Text style={styles.filterClearLabel}>Limpar placa, OS e área</Text>
                  </Pressable>
                ) : null}
              </View>

              {activeMode === 'cronograma' ? (
                <View style={styles.filterShell}>
                  <View style={styles.filterDateRow}>
                    <View style={[styles.filterDateInputWrap, styles.filterDateFlex]}>
                      <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
                      <TextInput
                        value={startDate}
                        onChangeText={(text) => setStartDate(maskDateInput(text))}
                        placeholder="Previsão de início"
                        placeholderTextColor="#A6B4BC"
                        keyboardType="number-pad"
                        style={styles.filterDateInput}
                      />
                    </View>
                    <Pressable
                      onPress={() => openDatePicker('startDate')}
                      style={({ pressed }) => [
                        styles.filterIconButton,
                        pressed ? styles.filterIconButtonPressed : null,
                      ]}
                    >
                      <Ionicons
                        name="calendar-clear-outline"
                        size={16}
                        color={colors.primaryStrong}
                      />
                    </Pressable>
                  </View>

                  <View style={styles.filterDateRow}>
                    <View style={[styles.filterDateInputWrap, styles.filterDateFlex]}>
                      <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
                      <TextInput
                        value={endDate}
                        onChangeText={(text) => setEndDate(maskDateInput(text))}
                        placeholder="Previsão de término"
                        placeholderTextColor="#A6B4BC"
                        keyboardType="number-pad"
                        style={styles.filterDateInput}
                      />
                    </View>
                    <Pressable
                      onPress={() => openDatePicker('endDate')}
                      style={({ pressed }) => [
                        styles.filterIconButton,
                        pressed ? styles.filterIconButtonPressed : null,
                      ]}
                    >
                      <Ionicons
                        name="calendar-clear-outline"
                        size={16}
                        color={colors.primaryStrong}
                      />
                    </Pressable>
                  </View>

                  <Pressable
                    onPress={() => {
                      blurActiveElement()
                      setStatusPickerOpen(true)
                    }}
                    style={({ pressed }) => [
                      styles.filterSelect,
                      pressed ? styles.filterIconButtonPressed : null,
                    ]}
                  >
                    <Text style={styles.filterFieldValue}>
                      Status: {STATUS_LABELS[statusFilter]}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                  </Pressable>

                  {startDate || endDate || statusFilter !== 'ALL' ? (
                    <Pressable
                      onPress={() => {
                        setStartDate('')
                        setEndDate('')
                        setStatusFilter('ALL')
                      }}
                      style={({ pressed }) => [
                        styles.filterClearButton,
                        pressed ? styles.filterIconButtonPressed : null,
                      ]}
                    >
                      <Ionicons
                        name="close-circle-outline"
                        size={14}
                        color={colors.primaryStrong}
                      />
                      <Text style={styles.filterClearLabel}>Limpar filtros</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {queueQuery.isLoading ? (
                <View style={styles.loadingCard}>
                  <Ionicons name="sync-outline" size={20} color={colors.primaryStrong} />
                  <Text style={styles.loadingTitle}>Carregando fila</Text>
                  <Text style={styles.loadingDescription}>
                    Estamos montando a lista operacional deste contrato.
                  </Text>
                </View>
              ) : null}

              {queueQuery.error ? (
                <Banner
                  tone="danger"
                  title="Nao foi possivel carregar a fila"
                  description={getErrorMessage(queueQuery.error, 'Tente sincronizar novamente.')}
                />
              ) : null}
            </>
          }
          ListEmptyComponent={
            queueQuery.isLoading || queueQuery.error ? null : (
              <View style={styles.emptyStateWrap}>
                <View style={styles.emptyHandle} />
                <View style={styles.emptyCircle}>
                  <Ionicons name="reader-outline" size={28} color={colors.textMuted} />
                </View>
                <Text style={styles.emptyTitle}>Sem itens</Text>
                <Text style={styles.emptyDescription}>Nenhum item na lista</Text>
                {!isConnected ? (
                  <Text style={styles.emptyHint}>Sem internet e sem dados locais desta fila.</Text>
                ) : null}
              </View>
            )
          }
        />

        <Pressable
          onPress={() => {
            if (!canRefreshQueue || !scope) {
              return
            }

            void runSyncNow(scope).then(() => queueQuery.refetch())
          }}
          disabled={!canRefreshQueue}
          style={({ pressed }) => [
            styles.refreshPill,
            !canRefreshQueue ? styles.refreshPillDisabled : null,
            pressed && canRefreshQueue ? styles.refreshPillPressed : null,
          ]}
        >
          <Ionicons
            name={isSyncing || queueQuery.isFetching ? 'sync-outline' : 'refresh-outline'}
            size={14}
            color={canRefreshQueue ? colors.primaryStrong : colors.textMuted}
          />
          <Text
            style={[
              styles.refreshPillLabel,
              !canRefreshQueue ? styles.refreshPillLabelDisabled : null,
            ]}
          >
            {!isConnected ? 'Offline' : 'Atualizar'}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>

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
                <Text style={styles.pickerTitle}>Selecionar data</Text>
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
                mode="date"
                display="spinner"
                is24Hour
                locale="pt-BR"
                onChange={(event, selectedDate) => {
                  if (event.type !== 'set' || !selectedDate) return
                  setIosPickerValue(selectedDate)
                  setFilterDateFromPicker(nativePickerState.field, selectedDate)
                }}
              />
            </View>
          </View>
        </Modal>
      ) : null}

      <SelectionModal
        visible={statusPickerOpen}
        title="Status do serviço"
        subtitle="Filtre o cronograma por situação."
        options={STATUS_OPTIONS}
        selectedValue={statusFilter}
        onSelect={(value) => setStatusFilter(value as StatusFilter)}
        onClose={() => setStatusPickerOpen(false)}
      />

      <SelectionModal
        visible={workOrderPickerOpen}
        title="Ordem de serviço"
        subtitle="A lista vem da fila disponível neste contrato, inclusive offline."
        options={workOrderOptions}
        selectedValue={workOrderFilter}
        onSelect={setWorkOrderFilter}
        onClose={() => setWorkOrderPickerOpen(false)}
      />

      <SelectionModal
        visible={areaPickerOpen}
        title="Área operacional"
        subtitle="Filtre os andaimes pela área cadastrada."
        options={areaOptions}
        selectedValue={areaFilter}
        onSelect={setAreaFilter}
        onClose={() => setAreaPickerOpen(false)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },
  page: {
    flex: 1,
    backgroundColor: colors.white,
  },
  contentContainer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 220,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  pageTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '600',
  },
  pageSubtitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  headerIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconButtonPressed: {
    backgroundColor: '#F3F7F8',
  },
  successPill: {
    minHeight: 34,
    borderRadius: 999,
    backgroundColor: '#F1FBF5',
    borderWidth: 1,
    borderColor: '#CFEAD8',
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  successPillLabel: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '700',
  },
  offlineQueuePill: {
    minHeight: 34,
    borderRadius: 999,
    backgroundColor: '#FFF4E8',
    borderWidth: 1,
    borderColor: '#F2D9B8',
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  offlineQueuePillLabel: {
    color: '#B85C00',
    fontSize: 11,
    fontWeight: '700',
  },
  offlineItemBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#FFF4E8',
    borderWidth: 1,
    borderColor: '#F2D9B8',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  offlineItemBadgeLabel: {
    color: '#B85C00',
    fontSize: 10,
    fontWeight: '700',
  },
  scopeCard: {
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E7ECEF',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scopeCardPressed: {
    backgroundColor: '#FBFCFD',
  },
  scopeTextBlock: {
    flex: 1,
    gap: 2,
  },
  scopeLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  scopeValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  scopeMeta: {
    color: colors.textMuted,
    fontSize: 11,
  },
  segmentRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  segmentButton: {
    minWidth: 96,
    minHeight: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
  },
  segmentButtonPressed: {
    opacity: 0.92,
  },
  segmentButtonLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  segmentButtonLabelActive: {
    color: colors.white,
  },
  searchShell: {
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E4EAEE',
    backgroundColor: '#FBFCFD',
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    paddingVertical: spacing.sm,
  },
  quickFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  quickFilterButton: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2EAEE',
    backgroundColor: '#FBFCFD',
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickFilterButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  quickFilterButtonPressed: {
    opacity: 0.86,
  },
  quickFilterLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  quickFilterLabelActive: {
    color: colors.primaryStrong,
  },
  filterShell: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  specificFilterShell: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E7ECEF',
    backgroundColor: '#FBFCFD',
  },
  filterField: {
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E7ECEF',
    backgroundColor: colors.white,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  filterSelect: {
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E7ECEF',
    backgroundColor: colors.white,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterFieldValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
  },
  filterDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  filterDateFlex: {
    flex: 1,
  },
  filterDateInputWrap: {
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E7ECEF',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  filterDateInput: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    paddingVertical: 0,
  },
  filterIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#E7ECEF',
    backgroundColor: '#F3F8FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterIconButtonPressed: {
    opacity: 0.86,
  },
  filterClearButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  filterClearLabel: {
    color: colors.primaryStrong,
    fontSize: 11,
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
    backgroundColor: colors.white,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
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
    backgroundColor: '#F3F8FA',
  },
  pickerCloseButtonPressed: {
    opacity: 0.86,
  },
  pickerCloseButtonLabel: {
    color: colors.primaryStrong,
    fontSize: 12,
    fontWeight: '700',
  },
  loadingCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#E5ECEF',
    backgroundColor: '#FBFCFD',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  loadingTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  loadingDescription: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  taskCard: {
    marginBottom: spacing.sm,
  },
  groupHeader: {
    minHeight: 54,
    borderRadius: radius.md,
    backgroundColor: '#F3F8FA',
    borderWidth: 1,
    borderColor: '#DCE8EE',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  groupHeaderText: {
    flex: 1,
    gap: 2,
  },
  groupTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  groupSubtitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  groupCountPill: {
    minWidth: 30,
    minHeight: 30,
    borderRadius: 15,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#DCE8EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupCountLabel: {
    color: colors.primaryStrong,
    fontSize: 12,
    fontWeight: '800',
  },
  taskCardBody: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E7ECEF',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    ...Platform.select({
      web: {
        boxShadow: '0px 4px 12px rgba(17, 43, 56, 0.04)',
      },
      default: {
        shadowColor: '#112B38',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
        elevation: 1,
      },
    }),
  },
  taskCardBodyPressed: {
    backgroundColor: '#FBFCFD',
  },
  taskCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  categoryWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  categoryLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  statusPill: {
    minHeight: 28,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
  },
  statusWarning: {
    backgroundColor: '#FFF9EE',
    borderColor: '#F2DEB6',
  },
  statusSuccess: {
    backgroundColor: '#EEF8F3',
    borderColor: '#D0E8D8',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#F0B323',
  },
  statusLabel: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '600',
  },
  codeLine: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  itemLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  operationTypeLine: {
    color: colors.primaryStrong,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scaffoldMetaLine: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  descriptionLine: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0.2,
  },
  taskFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metaPill: {
    minHeight: 28,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#E7ECEF',
    backgroundColor: '#FBFCFD',
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaPillLabel: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '500',
  },
  inlineActionButton: {
    marginLeft: 'auto',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineActionButtonPressed: {
    opacity: 0.9,
  },
  emptyStateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 52,
    paddingBottom: 120,
  },
  emptyHandle: {
    width: 54,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D9E5EA',
    marginBottom: 52,
  },
  emptyCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F5F8FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '500',
  },
  emptyDescription: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  emptyHint: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: spacing.sm,
  },
  refreshPill: {
    position: 'absolute',
    right: spacing.lg,
    top: 14,
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    backgroundColor: '#F3F8FA',
    borderWidth: 1,
    borderColor: '#DCE8EE',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  refreshPillPressed: {
    opacity: 0.9,
  },
  refreshPillDisabled: {
    opacity: 0.55,
    backgroundColor: colors.surfaceMuted,
  },
  refreshPillLabel: {
    color: colors.primaryStrong,
    fontSize: 11,
    fontWeight: '700',
  },
  refreshPillLabelDisabled: {
    color: colors.textMuted,
  },
  emptyContextCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#E7ECEF',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyContextTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  emptyContextDescription: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  primaryContextButton: {
    marginTop: spacing.sm,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryContextButtonPressed: {
    opacity: 0.92,
  },
  primaryContextButtonLabel: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
})
