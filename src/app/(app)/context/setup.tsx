import { Ionicons } from '@expo/vector-icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Redirect, router } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { NetworkStatusIndicator } from '@/components/app/network-status-indicator'
import { SelectionModal, type SelectionOption } from '@/components/ui/selection-modal'
import { colors, radius, spacing } from '@/constants/theme'
import { outboxRepository } from '@/database/repositories/outbox-repository'
import { useCrews } from '@/hooks/use-crews'
import {
  applyCrewMembersSnapshot,
  addCrewMembers,
  removeCrewMember,
} from '@/services/crews.service'
import { fetchEmployees, getCachedEmployees } from '@/services/employees.service'
import { useAuthStore } from '@/store/auth-store'
import { useConnectivityStore } from '@/store/connectivity-store'
import { useOperationalContextStore } from '@/store/operational-context-store'
import { useSyncStore } from '@/store/sync-store'
import type { Employee } from '@/types/employee'
import { OutboxEntityType, SyncStatus } from '@/types/sync'
import { getErrorMessage } from '@/utils/error'
import { blurActiveElement } from '@/utils/focus'
import { createLocalId } from '@/utils/id'
import {
  operationalContextSchema,
  type OperationalContextSchema,
} from '@/validators/operational-context'

type PickerKey = 'crew' | 'employees' | null

export default function ContextSetupPage() {
  const user = useAuthStore((state) => state.user)
  const isConnected = useConnectivityStore((state) => state.isConnected)
  const context = useOperationalContextStore()
  const setCrew = useOperationalContextStore((state) => state.setCrew)
  const runSyncNow = useSyncStore((state) => state.runSyncNow)
  const refreshState = useSyncStore((state) => state.refreshState)
  const [activePicker, setActivePicker] = useState<PickerKey>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [rosterExpanded, setRosterExpanded] = useState(false)
  const lastHydratedCrewId = useRef<string | null>(null)

  const {
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OperationalContextSchema>({
    resolver: zodResolver(operationalContextSchema),
    defaultValues: {
      crewId: context.crewId ?? '',
      teamMembers: context.teamMembers.map((member) => member.employeeId),
    },
  })

  const selectedCrewId = watch('crewId')
  const selectedTeamMemberIds = watch('teamMembers')

  const employeesQuery = useQuery({
    queryKey: ['employees', context.contractId, context.unitId, isConnected],
    enabled: Boolean(context.contractId && context.unitId),
    queryFn: async () => {
      if (!context.contractId || !context.unitId) {
        return []
      }

      if (!isConnected) {
        return getCachedEmployees(context.contractId)
      }

      try {
        return await fetchEmployees({
          contractId: context.contractId,
          unitId: context.unitId,
        })
      } catch (error) {
        const cached = await getCachedEmployees(context.contractId)
        if (cached.length > 0) {
          return cached
        }

        throw error
      }
    },
  })

  const crewsQuery = useCrews({
    contractId: context.contractId,
    unitId: context.unitId,
  })

  const selectedCrew = useMemo(
    () => (crewsQuery.data ?? []).find((crew) => crew.id === selectedCrewId) ?? null,
    [crewsQuery.data, selectedCrewId],
  )

  const selectedEmployees = useMemo(() => {
    const employeeMap = new Map(
      (employeesQuery.data ?? []).map((employee) => [employee.id, employee]),
    )

    return selectedTeamMemberIds
      .map((employeeId) => employeeMap.get(employeeId))
      .filter(Boolean) as Employee[]
  }, [employeesQuery.data, selectedTeamMemberIds])

  const availableEmployeesToAdd = useMemo(
    () =>
      (employeesQuery.data ?? []).filter(
        (employee) => employee.active !== false && !selectedTeamMemberIds.includes(employee.id),
      ),
    [employeesQuery.data, selectedTeamMemberIds],
  )

  useEffect(() => {
    const crews = crewsQuery.data ?? []
    const crewStillAvailable = crews.some((crew) => crew.id === selectedCrewId)

    if (!crewStillAvailable) {
      setValue('crewId', crews[0]?.id ?? '', { shouldValidate: true })
      lastHydratedCrewId.current = null
      return
    }

    if (!selectedCrewId || lastHydratedCrewId.current === selectedCrewId) {
      return
    }

    const crew = crews.find((item) => item.id === selectedCrewId)
    if (!crew) {
      return
    }

    setValue(
      'teamMembers',
      (crew.members ?? []).map((member) => member.employeeId),
      { shouldValidate: true },
    )
    lastHydratedCrewId.current = selectedCrewId
  }, [crewsQuery.data, selectedCrewId, setValue])

  const updateCrewRosterDraft = async (nextEmployeeIds: string[]) => {
    setValue('teamMembers', nextEmployeeIds, { shouldValidate: true })

    if (!selectedCrewId || !context.contractId) {
      return
    }

    const employeeMap = new Map(
      (employeesQuery.data ?? []).map((employee) => [employee.id, employee]),
    )
    const rosterSnapshot = nextEmployeeIds.map((employeeId) => ({
      employeeId,
      employee: employeeMap.get(employeeId) ?? null,
    }))

    await applyCrewMembersSnapshot(context.contractId, selectedCrewId, rosterSnapshot)
    await crewsQuery.refetch()
  }

  const handleAddEmployeesToCrew = async (employeeIds: string[]) => {
    if (!employeeIds.length || !selectedCrewId || !context.contractId || !context.unitId) {
      return
    }

    try {
      setSubmitError(null)

      if (isConnected) {
        const members = await addCrewMembers(selectedCrewId, employeeIds)
        await applyCrewMembersSnapshot(context.contractId, selectedCrewId, members)
      } else {
        await outboxRepository.enqueue({
          localId: createLocalId('crew-add'),
          entityType: OutboxEntityType.CREW_MEMBER_ADD,
          contractId: context.contractId,
          unitId: context.unitId,
          syncStatus: SyncStatus.PENDING,
          payload: {
            crewId: selectedCrewId,
            employeeIds,
          },
        })
        await refreshState()
      }

      await updateCrewRosterDraft([...new Set([...selectedTeamMemberIds, ...employeeIds])])
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Nao foi possivel incluir integrante(s) na equipe.'))
    }
  }

  const handleRemoveEmployeeFromCrew = async (employeeId: string) => {
    if (!selectedCrewId || !context.contractId || !context.unitId) {
      return
    }

    try {
      setSubmitError(null)

      if (isConnected) {
        await removeCrewMember(selectedCrewId, employeeId)
      } else {
        await outboxRepository.enqueue({
          localId: createLocalId('crew-remove'),
          entityType: OutboxEntityType.CREW_MEMBER_REMOVE,
          contractId: context.contractId,
          unitId: context.unitId,
          syncStatus: SyncStatus.PENDING,
          payload: {
            crewId: selectedCrewId,
            employeeId,
          },
        })
        await refreshState()
      }

      await updateCrewRosterDraft(
        selectedTeamMemberIds.filter((currentId) => currentId !== employeeId),
      )
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Nao foi possivel remover o integrante da equipe.'))
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    const employeeMap = new Map(
      (employeesQuery.data ?? []).map((employee) => [employee.id, employee]),
    )
    const teamMembers = values.teamMembers
      .map((employeeId) => employeeMap.get(employeeId))
      .filter((employee): employee is Employee => Boolean(employee))
      .map((employee) => ({
        employeeId: employee.id,
        name: employee.name,
        registrationCode: employee.registrationCode ?? null,
        role: employee.role ?? null,
      }))

    if (!selectedCrew || !context.unitId || !context.contractId) {
      setSubmitError('Selecione a equipe antes de continuar.')
      return
    }

    try {
      setSubmitError(null)

      setCrew({
        crewId: values.crewId,
        crewName: selectedCrew.name,
        crewForemanName: selectedCrew.foreman?.name ?? null,
        teamMembers,
      })

      if (isConnected) {
        await runSyncNow({
          unitId: context.unitId,
          contractId: context.contractId,
        })
      }

      blurActiveElement()
      router.replace('/(app)/(tabs)')
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Nao foi possivel salvar o contexto operacional.'))
    }
  })

  if (!user) {
    return <Redirect href="/(auth)/login" />
  }

  if (!context.unitId) {
    return <Redirect href={'/(app)/context/unit' as never} />
  }

  if (!context.contractId) {
    return (
      <Redirect
        href={
          {
            pathname: '/(app)/context/contract',
            params: { unitId: context.unitId },
          } as never
        }
      />
    )
  }

  const crewOptions: SelectionOption[] = (crewsQuery.data ?? []).map((crew) => ({
    value: crew.id,
    label: crew.name,
    sublabel: `${crew.members?.length ?? 0} integrante(s)`,
    caption: crew.foreman?.name ? `Encarregado: ${crew.foreman.name}` : 'Sem encarregado definido',
    keywords: [
      crew.name,
      crew.foreman?.name,
      ...(crew.members ?? []).map((member) => member.employee?.name ?? ''),
    ]
      .filter(Boolean)
      .join(' '),
  }))

  const employeeOptions: SelectionOption[] = availableEmployeesToAdd.map((employee) => ({
    value: employee.id,
    label: employee.name,
    sublabel: [employee.registrationCode, employee.role].filter(Boolean).join(' • '),
  }))

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Equipe operacional</Text>
          <Text style={styles.subtitle}>
            Ajuste o contexto operacional do aparelho com o mesmo cuidado visual das telas
            anteriores.
          </Text>
        </View>

        <NetworkStatusIndicator />

        {!isConnected ? (
          <Banner
            tone="warning"
            title="Trabalhando offline"
            description="Voce pode ajustar a composicao. As mudancas serao enviadas quando a rede voltar."
          />
        ) : null}

        <Pressable
          onPress={() => {
            blurActiveElement()
            router.push('/(app)/context/unit' as never)
          }}
          style={({ pressed }) => [styles.scopeCard, pressed ? styles.scopeCardPressed : null]}
        >
          <View style={styles.scopeTextBlock}>
            <Text style={styles.scopeLabel}>Base selecionada</Text>
            <Text numberOfLines={1} style={styles.scopeValue}>
              {context.contractDescription ?? context.contractCode ?? 'Contrato operacional'}
            </Text>
            <Text numberOfLines={1} style={styles.scopeMeta}>
              {[
                context.contractPlantName,
                context.unitCode && context.unitName
                  ? `${context.unitCode} - ${context.unitName}`
                  : context.unitName,
              ]
                .filter(Boolean)
                .join(' • ')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>Equipe em campo</Text>
          <Text style={styles.sectionDescription}>
            A crew e pre-definida. Se precisar, a composicao pode ser ajustada no aparelho.
          </Text>

          {crewsQuery.isLoading ? (
            <View style={styles.placeholderCard}>
              <Text style={styles.placeholderTitle}>Buscando equipes</Text>
              <Text style={styles.placeholderDescription}>
                Carregando as crews disponiveis para esta base.
              </Text>
            </View>
          ) : crewsQuery.error ? (
            <Banner
              tone="danger"
              title="Falha ao carregar equipes"
              description={getErrorMessage(
                crewsQuery.error,
                'Nao foi possivel buscar as crews para este contrato.',
              )}
            />
          ) : (
            <Pressable
              onPress={() => {
                blurActiveElement()
                setActivePicker('crew')
              }}
              style={({ pressed }) => [
                styles.selectorRow,
                pressed ? styles.selectorRowPressed : null,
                errors.crewId ? styles.selectorRowError : null,
              ]}
            >
              <View style={styles.selectorTextBlock}>
                <Text style={styles.selectorLabel}>Equipe</Text>
                <Text
                  numberOfLines={1}
                  style={[styles.selectorValue, !selectedCrew ? styles.selectorPlaceholder : null]}
                >
                  {selectedCrew?.name ?? 'Selecione a equipe'}
                </Text>
                <Text numberOfLines={1} style={styles.selectorHelper}>
                  {selectedCrew
                    ? `${selectedCrew.members?.length ?? 0} integrante(s) • ${selectedCrew.foreman?.name ?? 'Sem encarregado'}`
                    : 'Escolha a equipe que sera usada nesta jornada.'}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </Pressable>
          )}

          {errors.crewId?.message ? (
            <Text style={styles.inlineError}>{errors.crewId.message}</Text>
          ) : null}

          {selectedCrew ? (
            <View style={styles.crewCard}>
              <View style={styles.crewHeader}>
                <View style={styles.crewHeaderText}>
                  <Text style={styles.crewName}>{selectedCrew.name}</Text>
                  <Text style={styles.crewMeta}>
                    {selectedCrew.foreman?.name
                      ? `Encarregado: ${selectedCrew.foreman.name}`
                      : 'Sem encarregado definido'}
                  </Text>
                  <Text style={styles.crewMeta}>
                    {selectedTeamMemberIds.length} integrante(s) nesta jornada
                  </Text>
                </View>

                <View style={styles.crewActions}>
                  <Pressable
                    onPress={() => {
                      blurActiveElement()
                      setRosterExpanded((current) => !current)
                    }}
                    style={({ pressed }) => [
                      styles.actionChip,
                      pressed ? styles.actionChipPressed : null,
                    ]}
                  >
                    <Ionicons
                      name={rosterExpanded ? 'chevron-up-outline' : 'people-outline'}
                      size={14}
                      color={colors.primaryStrong}
                    />
                    <Text style={styles.actionChipLabel}>
                      {rosterExpanded ? 'Ocultar' : 'Integrantes'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      blurActiveElement()
                      setActivePicker('employees')
                    }}
                    disabled={!availableEmployeesToAdd.length}
                    style={({ pressed }) => [
                      styles.addChip,
                      !availableEmployeesToAdd.length ? styles.addChipDisabled : null,
                      pressed && availableEmployeesToAdd.length ? styles.actionChipPressed : null,
                    ]}
                  >
                    <Ionicons name="add" size={14} color={colors.white} />
                  </Pressable>
                </View>
              </View>

              {rosterExpanded ? (
                <View style={styles.memberList}>
                  {selectedEmployees.length === 0 ? (
                    <View style={styles.memberEmpty}>
                      <Text style={styles.memberEmptyTitle}>Equipe sem integrantes</Text>
                      <Text style={styles.memberEmptyDescription}>
                        Use o botao de adicionar para montar a composicao local desta crew.
                      </Text>
                    </View>
                  ) : (
                    selectedEmployees.map((employee) => (
                      <View key={employee.id} style={styles.memberRow}>
                        <View style={styles.memberInfo}>
                          <Text numberOfLines={1} style={styles.memberName}>
                            {employee.name}
                          </Text>
                          <Text numberOfLines={1} style={styles.memberMeta}>
                            {[employee.registrationCode, employee.role]
                              .filter(Boolean)
                              .join(' • ') || 'Sem detalhes adicionais'}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => void handleRemoveEmployeeFromCrew(employee.id)}
                          style={({ pressed }) => [
                            styles.removeMemberButton,
                            pressed ? styles.removeMemberButtonPressed : null,
                          ]}
                        >
                          <Ionicons name="trash-outline" size={15} color={colors.danger} />
                        </Pressable>
                      </View>
                    ))
                  )}
                </View>
              ) : null}
            </View>
          ) : null}

          {errors.teamMembers ? (
            <Text style={styles.inlineError}>{errors.teamMembers.message}</Text>
          ) : null}
        </View>

        {submitError ? (
          <Banner tone="danger" title="Falha na preparacao da jornada" description={submitError} />
        ) : null}

        <View style={styles.footer}>
          <Button onPress={onSubmit} loading={isSubmitting}>
            Salvar jornada
          </Button>
        </View>

        <SelectionModal
          visible={activePicker === 'crew'}
          title="Selecionar equipe"
          subtitle="A equipe escolhida ja carrega a composicao base."
          options={crewOptions}
          selectedValue={selectedCrewId}
          onSelect={(value) => {
            setValue('crewId', value, { shouldValidate: true })
            lastHydratedCrewId.current = null
          }}
          onClose={() => setActivePicker(null)}
          searchPlaceholder="Buscar equipe"
        />

        <SelectionModal
          visible={activePicker === 'employees'}
          title="Adicionar integrantes"
          subtitle="Pesquise e marque quem deve entrar nesta crew."
          options={employeeOptions}
          multiple
          selectedValues={[]}
          onConfirm={(values) => void handleAddEmployeesToCrew(values)}
          onClose={() => setActivePicker(null)}
          searchPlaceholder="Buscar funcionario"
          confirmLabel="Adicionar a equipe"
        />
      </ScrollView>
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
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  header: {
    gap: 2,
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '600',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  scopeCard: {
    minHeight: 74,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E7ECEF',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  section: {
    gap: spacing.sm,
  },
  sectionEyebrow: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  placeholderCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E7ECEF',
    backgroundColor: '#FBFCFD',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    gap: 3,
  },
  placeholderTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  placeholderDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  selectorRow: {
    minHeight: 68,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E7ECEF',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  selectorRowPressed: {
    backgroundColor: '#FBFCFD',
  },
  selectorRowError: {
    borderColor: colors.danger,
  },
  selectorTextBlock: {
    flex: 1,
    gap: 2,
  },
  selectorLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  selectorValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  selectorPlaceholder: {
    color: '#8AA0A8',
    fontWeight: '500',
  },
  selectorHelper: {
    color: colors.textMuted,
    fontSize: 11,
  },
  inlineError: {
    color: colors.danger,
    fontSize: 11,
  },
  crewCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E7ECEF',
    backgroundColor: '#FBFCFD',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  crewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  crewHeaderText: {
    flex: 1,
    gap: 2,
  },
  crewName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  crewMeta: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  crewActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionChip: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: '#D4E6EE',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  addChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addChipDisabled: {
    opacity: 0.35,
  },
  actionChipPressed: {
    opacity: 0.9,
  },
  actionChipLabel: {
    color: colors.primaryStrong,
    fontSize: 11,
    fontWeight: '700',
  },
  memberList: {
    gap: spacing.xs,
  },
  memberRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E7ECEF',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
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
  memberEmpty: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E7ECEF',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  memberEmptyTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  memberEmptyDescription: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 18,
  },
  removeMemberButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFF4F2',
    borderWidth: 1,
    borderColor: '#F0D0CA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeMemberButtonPressed: {
    opacity: 0.9,
  },
  footer: {
    marginTop: spacing.sm,
  },
})
