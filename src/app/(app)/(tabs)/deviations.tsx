import { Ionicons } from '@expo/vector-icons'
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import { router } from 'expo-router'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Banner } from '@/components/ui/banner'
import { NetworkStatusIndicator } from '@/components/app/network-status-indicator'
import { DeviationEvidencePicker } from '@/components/deviation/deviation-evidence-picker'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { SelectionModal, type SelectionOption } from '@/components/ui/selection-modal'
import { colors, radius, spacing } from '@/constants/theme'
import { outboxRepository } from '@/database/repositories/outbox-repository'
import { useQuery } from '@tanstack/react-query'
import { useDeviationTypes } from '@/hooks/use-deviation-types'
import { useCrews } from '@/hooks/use-crews'
import { createOperationalDeviation } from '@/services/operational-deviations.service'
import { fetchEmployees, getCachedEmployees } from '@/services/employees.service'
import { fetchWorkFunctions, getCachedWorkFunctions } from '@/services/work-functions.service'
import {
  cleanupDeviationEvidenceDrafts,
  uploadDeviationMedia,
} from '@/services/deviation-media.service'
import { useConnectivityStore } from '@/store/connectivity-store'
import { useOperationalContextStore } from '@/store/operational-context-store'
import { useSyncStore } from '@/store/sync-store'
import {
  DeviationResponsibility,
  type CreateOperationalDeviationDto,
  type DeviationEvidenceDraft,
  type OperationalDeviationDraft,
} from '@/types/operational-deviation'
import { OutboxEntityType, SyncStatus } from '@/types/sync'
import type { ExecutionFunctionQuantityInput, ExecutionLaborMode } from '@/types/execution'
import {
  dateInputToIsoDate,
  formatDate,
  formatTime,
  maskDateInput,
  maskTimeInput,
  parseDateInput,
  parseDateTimeInput,
  parseTimeInput,
} from '@/utils/date'
import { getErrorMessage } from '@/utils/error'
import { blurActiveElement } from '@/utils/focus'
import { createLocalId } from '@/utils/id'

type PickerKey = 'deviationType' | 'crew' | 'members' | 'functions' | null
type DateTimeFieldKey = 'occurredDate' | 'occurredTime' | 'resolvedDate' | 'resolvedTime'
type NativePickerState = { field: DateTimeFieldKey; mode: 'date' | 'time' }

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
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

type SelectTriggerProps = {
  label: string
  value: string | null
  helper: string | null
  placeholder: string
  onPress: () => void
  disabled?: boolean
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

export default function DeviationsPage() {
  const isConnected = useConnectivityStore((state) => state.isConnected)
  const { companyId, contractId, unitId } = useOperationalContextStore()
  const runSyncNow = useSyncStore((state) => state.runSyncNow)
  const refreshState = useSyncStore((state) => state.refreshState)
  const scrollViewRef = useRef<ScrollView>(null)

  const deviationTypesQuery = useDeviationTypes()

  const [activePicker, setActivePicker] = useState<PickerKey>(null)
  const [deviationTypeId, setDeviationTypeId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [responsibility, setResponsibility] = useState<DeviationResponsibility>(
    DeviationResponsibility.KAEFER,
  )
  const [occurredDate, setOccurredDate] = useState(formatDate(new Date()))
  const [occurredTime, setOccurredTime] = useState(formatTime(new Date()))
  const [resolvedDate, setResolvedDate] = useState(formatDate(new Date()))
  const [resolvedTime, setResolvedTime] = useState(formatTime(new Date()))
  const [laborMode, setLaborMode] = useState<ExecutionLaborMode>('UNASSIGNED')
  const [selectedCrewId, setSelectedCrewId] = useState('')
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [functionQuantities, setFunctionQuantities] = useState<ExecutionFunctionQuantityInput[]>([])
  const [rosterExpanded, setRosterExpanded] = useState(true)
  const lastCrewRef = useRef<string | null>(null)
  const [notes, setNotes] = useState('')
  const [evidences, setEvidences] = useState<DeviationEvidenceDraft[]>([])
  const [evidenceCaption, setEvidenceCaption] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [nativePickerState, setNativePickerState] = useState<NativePickerState | null>(null)
  const [iosPickerValue, setIosPickerValue] = useState(new Date())

  const scopeReady = Boolean(companyId && contractId && unitId)

  const employeesQuery = useQuery({
    queryKey: ['deviation-employees', contractId, unitId, isConnected],
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

  const crewsQuery = useCrews({ contractId, unitId })
  const workFunctionsQuery = useQuery({
    queryKey: ['deviation-work-functions', contractId, unitId, isConnected],
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

  useEffect(() => {
    if (!selectedCrewId || lastCrewRef.current === selectedCrewId) return
    const crew = (crewsQuery.data ?? []).find((item) => item.id === selectedCrewId)
    if (!crew) return

    setSelectedMemberIds((crew.members ?? []).map((member) => member.employeeId))
    lastCrewRef.current = selectedCrewId
  }, [crewsQuery.data, selectedCrewId])

  const deviationTypeOptions: SelectionOption[] = useMemo(
    () =>
      (deviationTypesQuery.data ?? []).map((item) => ({
        value: item.id,
        label: item.name,
        sublabel: [item.category, item.severity].filter(Boolean).join(' • '),
        caption: item.description ?? item.code ?? undefined,
      })),
    [deviationTypesQuery.data],
  )

  const selectedDeviationType = useMemo(
    () => (deviationTypesQuery.data ?? []).find((item) => item.id === deviationTypeId) ?? null,
    [deviationTypeId, deviationTypesQuery.data],
  )

  const selectedCrew = useMemo(
    () => (crewsQuery.data ?? []).find((crew) => crew.id === selectedCrewId) ?? null,
    [crewsQuery.data, selectedCrewId],
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

  const employeeOptions: SelectionOption[] = useMemo(
    () =>
      (employeesQuery.data ?? [])
        .filter((employee) => employee.active !== false)
        .map((employee) => ({
          value: employee.id,
          label: employee.name,
          sublabel: [employee.registrationCode, employee.role].filter(Boolean).join(' • '),
        })),
    [employeesQuery.data],
  )

  const selectedEmployees = useMemo(() => {
    const employeeMap = new Map(
      (employeesQuery.data ?? []).map((employee) => [employee.id, employee]),
    )
    return selectedMemberIds
      .map((employeeId) => employeeMap.get(employeeId))
      .filter((employee): employee is NonNullable<typeof employee> => Boolean(employee))
  }, [employeesQuery.data, selectedMemberIds])

  const estimatedManHours = useMemo(() => {
    const start = parseDateTimeInput(occurredDate, occurredTime)
    const end = parseDateTimeInput(resolvedDate, resolvedTime)
    if (!start || !end || end.getTime() <= start.getTime()) {
      return 0
    }

    const effectiveCount =
      laborMode === 'CREW'
        ? selectedMemberIds.length
        : laborMode === 'FUNCTION_QUANTITY'
          ? functionQuantities.reduce((total, item) => total + item.quantity, 0)
          : 0

    return ((end.getTime() - start.getTime()) / 3_600_000) * effectiveCount
  }, [
    functionQuantities,
    laborMode,
    occurredDate,
    occurredTime,
    resolvedDate,
    resolvedTime,
    selectedMemberIds.length,
  ])

  const resolvePickerDate = (field: DateTimeFieldKey) => {
    if (field === 'occurredDate') {
      return parseDateInput(occurredDate) ?? new Date()
    }
    if (field === 'occurredTime') {
      return parseDateTimeInput(occurredDate, occurredTime) ?? new Date()
    }
    if (field === 'resolvedDate') {
      return parseDateInput(resolvedDate) ?? new Date()
    }
    return parseDateTimeInput(resolvedDate, resolvedTime) ?? new Date()
  }

  const updateField = (field: DateTimeFieldKey, value: Date) => {
    if (field === 'occurredDate') {
      setOccurredDate(formatDate(value))
      return
    }
    if (field === 'occurredTime') {
      setOccurredTime(formatTime(value))
      return
    }
    if (field === 'resolvedDate') {
      setResolvedDate(formatDate(value))
      return
    }
    setResolvedTime(formatTime(value))
  }

  const handleNativePickerChange = (
    state: NativePickerState,
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (event.type !== 'set' || !selectedDate) {
      return
    }
    updateField(state.field, selectedDate)
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

  const resetForm = () => {
    setDeviationTypeId('')
    setTitle('')
    setDescription('')
    setResponsibility(DeviationResponsibility.KAEFER)
    setOccurredDate(formatDate(new Date()))
    setOccurredTime(formatTime(new Date()))
    setResolvedDate(formatDate(new Date()))
    setResolvedTime(formatTime(new Date()))
    setLaborMode('UNASSIGNED')
    setSelectedCrewId('')
    setSelectedMemberIds([])
    setFunctionQuantities([])
    setNotes('')
    setEvidences([])
    setEvidenceCaption('')
  }

  const buildDto = (): CreateOperationalDeviationDto | null => {
    if (!companyId || !contractId || !unitId) {
      return null
    }

    const isoDate = dateInputToIsoDate(occurredDate)
    const parsedTime = parseTimeInput(occurredTime)
    if (!isoDate || !parsedTime) {
      return null
    }

    const occurredAtDate = new Date(isoDate)
    occurredAtDate.setHours(parsedTime.hours, parsedTime.minutes, 0, 0)

    const resolvedIso = dateInputToIsoDate(resolvedDate)
    const resolvedParsedTime = parseTimeInput(resolvedTime)
    if (!resolvedIso || !resolvedParsedTime) {
      return null
    }
    const resolvedAtDate = new Date(resolvedIso)
    resolvedAtDate.setHours(resolvedParsedTime.hours, resolvedParsedTime.minutes, 0, 0)
    if (resolvedAtDate.getTime() <= occurredAtDate.getTime()) {
      return null
    }

    const dto: CreateOperationalDeviationDto = {
      deviationTypeId,
      crewId: laborMode === 'CREW' ? selectedCrewId : undefined,
      laborMode,
      title: title.trim(),
      description: description.trim() || undefined,
      responsibility,
      ocurredAt: occurredAtDate.toISOString(),
      resolvedAt: resolvedAtDate.toISOString(),
      memberEmployeeIds: laborMode === 'CREW' ? selectedMemberIds : undefined,
      functionQuantities: laborMode === 'FUNCTION_QUANTITY' ? functionQuantities : undefined,
      isGlobal: true,
      companyId,
      unitId,
      contractId,
      notes: notes.trim() || undefined,
    }

    return dto
  }

  const handleSubmit = async () => {
    if (isSubmitting) return

    if (!scopeReady) {
      setSubmitError('Defina unidade e contrato antes de registrar um desvio.')
      return
    }

    if (!deviationTypeId) {
      setSubmitError('Selecione o tipo de desvio.')
      return
    }

    if (!title.trim()) {
      setSubmitError('Informe um título curto para o desvio.')
      return
    }

    if (laborMode === 'CREW' && !selectedCrewId) {
      setSubmitError('Selecione a equipe afetada pelo desvio.')
      return
    }

    if (laborMode === 'CREW' && selectedMemberIds.length === 0) {
      setSubmitError('Selecione ao menos um integrante da equipe para o desvio.')
      return
    }

    if (
      laborMode === 'FUNCTION_QUANTITY' &&
      (functionQuantities.length === 0 ||
        functionQuantities.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1))
    ) {
      setSubmitError('Informe ao menos uma função com efetivo inteiro maior que zero.')
      return
    }

    const dto = buildDto()
    if (!dto) {
      setSubmitError(
        'Informe início e encerramento válidos. O encerramento deve ser posterior ao início do desvio.',
      )
      return
    }

    try {
      setIsSubmitting(true)
      setSubmitError(null)

      if (!isConnected) {
        const localId = createLocalId('deviation')
        const draft: OperationalDeviationDraft = {
          dto,
          evidences: evidences.length > 0 ? evidences : undefined,
          evidenceCaption: evidenceCaption.trim() || undefined,
        }

        await outboxRepository.enqueue({
          localId,
          entityType: OutboxEntityType.OPERATIONAL_DEVIATION,
          contractId: dto.contractId ?? null,
          unitId: dto.unitId ?? null,
          syncStatus: SyncStatus.PENDING,
          payload: draft,
        })

        await refreshState()
        resetForm()
        Alert.alert(
          'Desvio salvo offline',
          'O desvio e suas fotos serão enviadas automaticamente quando a conexão for restabelecida.',
          [{ text: 'OK' }],
        )
        return
      }

      const deviation = await createOperationalDeviation(dto)
      const uploadedEvidences: DeviationEvidenceDraft[] = []
      let pendingEvidences: DeviationEvidenceDraft[] = []
      let mediaUploadError: unknown = null

      for (let evidenceIndex = 0; evidenceIndex < evidences.length; evidenceIndex += 1) {
        const evidence = evidences[evidenceIndex]
        try {
          await uploadDeviationMedia(deviation.id, evidence, evidenceCaption.trim() || undefined)
          uploadedEvidences.push(evidence)
        } catch (error) {
          mediaUploadError = error
          pendingEvidences = evidences.slice(evidenceIndex)
          break
        }
      }

      try {
        await cleanupDeviationEvidenceDrafts(uploadedEvidences)
      } catch {
        // A limpeza é local; uma falha aqui não deve bloquear o registro já enviado.
      }

      if (pendingEvidences.length > 0) {
        const pendingDraft: OperationalDeviationDraft = {
          dto,
          evidences: pendingEvidences,
          evidenceCaption: evidenceCaption.trim() || undefined,
        }

        await outboxRepository.enqueue({
          localId: createLocalId('deviation-media'),
          entityType: OutboxEntityType.OPERATIONAL_DEVIATION,
          remoteId: deviation.id,
          contractId: dto.contractId ?? null,
          unitId: dto.unitId ?? null,
          syncStatus: SyncStatus.PENDING,
          payload: pendingDraft,
        })

        await refreshState()
        resetForm()
        Alert.alert(
          'Desvio registrado com fotos pendentes',
          `${getErrorMessage(
            mediaUploadError,
            'Algumas fotos não puderam ser enviadas agora.',
          )}\n\nAs fotos restantes ficaram na fila de sincronização.`,
          [
            {
              text: 'OK',
              onPress: () => router.replace('/(app)/(tabs)/sync?saved=queued' as never),
            },
          ],
        )
        return
      }

      try {
        await runSyncNow({ contractId: dto.contractId!, unitId: dto.unitId! })
      } catch {
        // O desvio já foi criado; falha na sincronização da fila não interrompe.
      }

      resetForm()
      Alert.alert('Desvio registrado', 'O desvio foi enviado com sucesso.', [
        { text: 'OK', onPress: () => router.replace('/(app)/(tabs)' as never) },
      ])
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Não foi possível registrar o desvio.'))
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
              <View style={styles.headerTextBlock}>
                <Text style={styles.headerTitle}>Desvio operacional</Text>
                <Text style={styles.headerSubtitle}>
                  Registre paralisações, não conformidades e imprevistos. Funciona offline — as
                  fotos sobem assim que a conexão voltar.
                </Text>
              </View>
            </View>

            <NetworkStatusIndicator />

            {!scopeReady ? (
              <View style={styles.contextMissingCard}>
                <Text style={styles.contextMissingTitle}>Prepare a jornada antes</Text>
                <Text style={styles.contextMissingDescription}>
                  O desvio precisa de unidade e contrato definidos.
                </Text>
                <Pressable
                  onPress={() => {
                    blurActiveElement()
                    router.push('/(app)/context/unit' as never)
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
                <Section
                  title="Classificação"
                  subtitle="Escolha o tipo, descreva e atribua a responsabilidade."
                >
                  <SelectTrigger
                    label="Tipo de desvio"
                    value={selectedDeviationType?.name ?? null}
                    placeholder="Selecionar tipo"
                    helper={
                      selectedDeviationType
                        ? [selectedDeviationType.category, selectedDeviationType.severity]
                            .filter(Boolean)
                            .join(' • ')
                        : deviationTypesQuery.isLoading
                          ? 'Carregando...'
                          : 'Obrigatório'
                    }
                    onPress={() => setActivePicker('deviationType')}
                    disabled={deviationTypeOptions.length === 0}
                  />

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Título</Text>
                    <TextInput
                      placeholder="Ex.: Chuva forte - paralisação"
                      placeholderTextColor="#8AA0A8"
                      value={title}
                      onChangeText={setTitle}
                      style={styles.fieldInput}
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Descrição</Text>
                    <TextInput
                      placeholder="Explique o que aconteceu, impacto e contexto."
                      placeholderTextColor="#8AA0A8"
                      value={description}
                      onChangeText={setDescription}
                      multiline
                      style={[styles.fieldInput, styles.fieldInputMultiline]}
                    />
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Responsabilidade</Text>
                    <SegmentedControl
                      value={responsibility}
                      onChange={setResponsibility}
                      options={[
                        { value: DeviationResponsibility.KAEFER, label: 'KAEFER' },
                        { value: DeviationResponsibility.CLIENT, label: 'Cliente' },
                      ]}
                    />
                  </View>
                </Section>

                <Section title="Quando ocorreu" subtitle="Informe a data e o horário do evento.">
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Data do desvio</Text>
                    <View style={styles.dateTimeRow}>
                      <View style={[styles.fieldInput, styles.dateTimeInputWrap]}>
                        <Ionicons name="calendar-outline" size={15} color={colors.primaryStrong} />
                        <TextInput
                          value={occurredDate}
                          onChangeText={(text) => setOccurredDate(maskDateInput(text))}
                          placeholder="dd/mm/aaaa"
                          placeholderTextColor="#8AA0A8"
                          keyboardType="number-pad"
                          style={styles.dateTimeTextInput}
                        />
                      </View>
                      <Pressable
                        onPress={() => openNativePicker('occurredDate', 'date')}
                        style={({ pressed }) => [
                          styles.dateTimePickerButton,
                          pressed ? styles.dateTimeIconButtonPressed : null,
                        ]}
                      >
                        <Ionicons
                          name="calendar-clear-outline"
                          size={16}
                          color={colors.primaryStrong}
                        />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Horário</Text>
                    <View style={styles.dateTimeRow}>
                      <View style={[styles.fieldInput, styles.dateTimeInputWrap]}>
                        <Ionicons name="time-outline" size={15} color={colors.primaryStrong} />
                        <TextInput
                          value={occurredTime}
                          onChangeText={(text) => setOccurredTime(maskTimeInput(text))}
                          placeholder="00:00"
                          placeholderTextColor="#8AA0A8"
                          keyboardType="number-pad"
                          style={styles.dateTimeTextInput}
                        />
                      </View>
                      <Pressable
                        onPress={() => openNativePicker('occurredTime', 'time')}
                        style={({ pressed }) => [
                          styles.dateTimePickerButton,
                          pressed ? styles.dateTimeIconButtonPressed : null,
                        ]}
                      >
                        <Ionicons name="alarm-outline" size={16} color={colors.primaryStrong} />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.requiredNotice}>
                    <Ionicons name="time-outline" size={16} color={colors.primaryStrong} />
                    <Text style={styles.requiredNoticeText}>
                      O encerramento é obrigatório para calcular a duração, o snapshot e a carga
                      horária nominal no RDO.
                    </Text>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Data do encerramento *</Text>
                    <View style={styles.dateTimeRow}>
                      <View style={[styles.fieldInput, styles.dateTimeInputWrap]}>
                        <Ionicons name="calendar-outline" size={15} color={colors.primaryStrong} />
                        <TextInput
                          value={resolvedDate}
                          onChangeText={(text) => setResolvedDate(maskDateInput(text))}
                          placeholder="dd/mm/aaaa"
                          placeholderTextColor="#8AA0A8"
                          keyboardType="number-pad"
                          style={styles.dateTimeTextInput}
                        />
                      </View>
                      <Pressable
                        onPress={() => openNativePicker('resolvedDate', 'date')}
                        style={({ pressed }) => [
                          styles.dateTimePickerButton,
                          pressed ? styles.dateTimeIconButtonPressed : null,
                        ]}
                      >
                        <Ionicons
                          name="calendar-clear-outline"
                          size={16}
                          color={colors.primaryStrong}
                        />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Horário do encerramento *</Text>
                    <View style={styles.dateTimeRow}>
                      <View style={[styles.fieldInput, styles.dateTimeInputWrap]}>
                        <Ionicons name="time-outline" size={15} color={colors.primaryStrong} />
                        <TextInput
                          value={resolvedTime}
                          onChangeText={(text) => setResolvedTime(maskTimeInput(text))}
                          placeholder="00:00"
                          placeholderTextColor="#8AA0A8"
                          keyboardType="number-pad"
                          style={styles.dateTimeTextInput}
                        />
                      </View>
                      <Pressable
                        onPress={() => openNativePicker('resolvedTime', 'time')}
                        style={({ pressed }) => [
                          styles.dateTimePickerButton,
                          pressed ? styles.dateTimeIconButtonPressed : null,
                        ]}
                      >
                        <Ionicons name="alarm-outline" size={16} color={colors.primaryStrong} />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Observações</Text>
                    <TextInput
                      placeholder="Notas adicionais, encaminhamentos, tempo perdido..."
                      placeholderTextColor="#8AA0A8"
                      value={notes}
                      onChangeText={setNotes}
                      onFocus={() => {
                        setTimeout(() => {
                          scrollViewRef.current?.scrollToEnd({ animated: true })
                        }, 250)
                      }}
                      multiline
                      style={[styles.fieldInput, styles.fieldInputMultiline]}
                    />
                  </View>
                </Section>

                <Section
                  title="Registro fotográfico"
                  subtitle="Até 4 fotos. O upload continua sendo feito mesmo se você salvar offline."
                >
                  <DeviationEvidencePicker
                    value={evidences}
                    caption={evidenceCaption}
                    onChange={setEvidences}
                    onCaptionChange={setEvidenceCaption}
                  />
                </Section>

                <Section
                  title="Efetivo afetado"
                  subtitle="Escolha a composição deste desvio no momento do lançamento."
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
                        value={selectedCrew?.name ?? null}
                        placeholder="Selecionar equipe"
                        helper={
                          selectedCrew
                            ? `${selectedCrew.members?.length ?? 0} integrante(s) • ${
                                selectedCrew.foreman?.name ?? 'Sem encarregado'
                              }`
                            : 'Escolha a equipe afetada por este desvio.'
                        }
                        onPress={() => setActivePicker('crew')}
                      />

                      {selectedCrew ? (
                        <View style={styles.crewCard}>
                          <View style={styles.crewCardText}>
                            <Text style={styles.crewCardTitle}>{selectedCrew.name}</Text>
                            <Text style={styles.crewCardMeta}>
                              {selectedMemberIds.length} integrante(s) no snapshot
                            </Text>
                            <Text style={styles.crewCardMeta}>
                              HH calculado: {estimatedManHours.toFixed(2)}
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
                              <Text style={styles.ghostButtonLabel}>
                                {rosterExpanded ? 'Ocultar' : 'Ver integrantes'}
                              </Text>
                            </Pressable>

                            <Pressable
                              onPress={() => setActivePicker('members')}
                              disabled={employeeOptions.length === 0}
                              style={({ pressed }) => [
                                styles.circleAction,
                                employeeOptions.length === 0 ? styles.circleActionDisabled : null,
                                pressed && employeeOptions.length > 0
                                  ? styles.circleActionPressed
                                  : null,
                              ]}
                            >
                              <Ionicons name="create-outline" size={16} color={colors.white} />
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
                                Use o botão de edição para informar quem foi afetado.
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
                                      current.filter((employeeId) => employeeId !== employee.id),
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
                      <Text style={styles.crewCardMeta}>
                        Efetivo total:{' '}
                        {functionQuantities.reduce((total, item) => total + item.quantity, 0)} • HH
                        calculado: {estimatedManHours.toFixed(2)}
                      </Text>
                    </View>
                  ) : null}

                  {laborMode === 'UNASSIGNED' ? (
                    <View style={styles.inlineEmptyState}>
                      <Text style={styles.inlineEmptyTitle}>Desvio sem efetivo</Text>
                      <Text style={styles.inlineEmptyDescription}>
                        O desvio será registrado sem equipe, pessoas ou quantitativo por função.
                      </Text>
                    </View>
                  ) : null}
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
                    {isSubmitting
                      ? 'Registrando...'
                      : isConnected
                        ? 'Registrar desvio'
                        : 'Salvar desvio offline'}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
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
                  updateField(nativePickerState.field, selectedDate)
                }}
              />
            </View>
          </View>
        </Modal>
      ) : null}

      <SelectionModal
        visible={activePicker === 'deviationType'}
        title="Tipo de desvio"
        subtitle="Classifique o evento para análise posterior."
        options={deviationTypeOptions}
        selectedValue={deviationTypeId}
        onSelect={setDeviationTypeId}
        onClose={() => setActivePicker(null)}
      />
      <SelectionModal
        visible={activePicker === 'crew'}
        title="Equipe do desvio"
        subtitle="A equipe selecionada fornece a composição inicial do snapshot."
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
        title="Equipe do desvio"
        subtitle="Selecione a composição efetivamente afetada."
        options={employeeOptions}
        selectedValues={selectedMemberIds}
        multiple
        confirmLabel="Aplicar equipe"
        onConfirm={setSelectedMemberIds}
        onClose={() => setActivePicker(null)}
        emptyMessage={
          employeesQuery.isLoading
            ? 'Carregando funcionários...'
            : 'Nenhum funcionário disponível neste contrato.'
        }
      />
      <SelectionModal
        visible={activePicker === 'functions'}
        title="Funções do efetivo"
        subtitle="Informe depois a quantidade de pessoas em cada função."
        options={workFunctionOptions}
        selectedValues={functionQuantities.map((item) => item.workFunctionId)}
        multiple
        confirmLabel="Usar funções"
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
        emptyMessage={
          workFunctionsQuery.isLoading
            ? 'Carregando funções...'
            : 'Nenhuma função operacional disponível.'
        }
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
    minHeight: 92,
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
  dateTimeRow: {
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
  switchCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  switchText: {
    flex: 1,
    gap: 2,
  },
  switchTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  switchDescription: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  requiredNotice: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  requiredNoticeText: {
    flex: 1,
    color: colors.text,
    fontSize: 11,
    lineHeight: 16,
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
  infoCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoCardText: {
    color: colors.text,
    fontSize: 12,
    flex: 1,
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
