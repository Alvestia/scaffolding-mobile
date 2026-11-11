import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NetworkStatusIndicator } from '@/components/app/network-status-indicator'
import { AvailabilityBadge } from '@/components/inspection/availability-badge'
import { DetailHeader } from '@/components/inspection/detail-header'
import { ReasonModal } from '@/components/inspection/reason-modal'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { StatusBadge } from '@/components/ui/status-badge'
import { colors, radius, spacing } from '@/constants/theme'
import { useInspectionPack, usePendingInspectionWork } from '@/hooks/use-inspections'
import {
  requestInterdiction,
  requestManualInspection,
} from '@/services/inspection-actions.service'
import { useAuthStore } from '@/store/auth-store'
import { useConnectivityStore } from '@/store/connectivity-store'
import { useOperationalContextStore } from '@/store/operational-context-store'
import { formatShortDateTime } from '@/utils/date'
import { getErrorMessage } from '@/utils/error'
import { compareInspections, hasPermission, TRIGGER_LABELS } from '@/utils/inspection-rules'

const PHYSICAL_STATUS: Record<string, string> = {
  EM_MONTAGEM: 'Em montagem',
  MONTADO: 'Montado',
  EM_DESMONTAGEM: 'Em desmontagem',
}

const MANUAL_TRIGGERS = [
  { value: 'EVENT' as const, label: 'Extraordinária' },
  { value: 'AD_HOC' as const, label: 'Avulsa' },
]

export default function InspectionScaffoldScreen() {
  const router = useRouter()
  const { scaffoldId = '' } = useLocalSearchParams<{ scaffoldId: string }>()
  const user = useAuthStore((state) => state.user)
  const isConnected = useConnectivityStore((state) => state.isConnected)
  const { contractId, unitId } = useOperationalContextStore()
  const pack = useInspectionPack({ contractId, unitId })
  const pending = usePendingInspectionWork()
  const [modal, setModal] = useState<'interdict' | 'manual' | null>(null)
  const [trigger, setTrigger] = useState<'EVENT' | 'AD_HOC'>('EVENT')

  const scaffold = pack.data?.scaffolds.find((item) => item.id === scaffoldId) ?? null
  const inspections = useMemo(
    () =>
      (pack.data?.inspections ?? [])
        .filter((item) => item.scaffoldId === scaffoldId)
        .sort(compareInspections),
    [pack.data, scaffoldId],
  )
  const localInterdiction = pending.interdictions.get(scaffoldId)
  const localManual = pending.manual.filter((item) => item.payload.scaffoldId === scaffoldId)

  if (!scaffold || !contractId || !unitId) {
    return (
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
        <View style={styles.page}>
          <DetailHeader title="Andaime" />
          <EmptyState
            title={pack.isLoading ? 'Carregando' : 'Andaime não encontrado'}
            description="Ele pode ser de outro contrato ou não estar em campo. Sincronize para atualizar a base."
          />
        </View>
      </SafeAreaView>
    )
  }

  const scope = { contractId, unitId }
  const availability = scaffold.availability
  const tracked = Boolean(availability && availability.status !== 'NOT_APPLICABLE')
  const interdicted = availability?.status === 'INTERDICTED' || Boolean(localInterdiction)
  const canCreate =
    hasPermission(user, 'inspection:perform') && tracked && scaffold.currentStatus === 'MONTADO'
  const canInterdict = hasPermission(user, 'scaffold:interdict') && tracked && !interdicted

  const interdict = async (reason: string) => {
    try {
      const result = await requestInterdiction(
        scope,
        { scaffoldId: scaffold.id, scaffoldCode: scaffold.code, reason },
        isConnected,
      )
      setModal(null)
      await pack.refetch()
      Alert.alert(
        result.status === 'sent' ? 'Andaime interditado' : 'Interdição guardada no aparelho',
        result.status === 'sent'
          ? 'A interdição já vale para todos.'
          : 'Ela será enviada na próxima sincronização. Até lá, sinalize o andaime no local e avise a equipe.',
      )
    } catch (error) {
      Alert.alert('Não foi possível interditar', getErrorMessage(error))
    }
  }

  const createManual = async (reason: string) => {
    try {
      const result = await requestManualInspection(
        scope,
        { scaffoldId: scaffold.id, scaffoldCode: scaffold.code, trigger, reason },
        isConnected,
      )
      setModal(null)
      if (result.status === 'sent' && result.id) {
        await pack.refetch()
        router.push(`/(app)/inspections/${result.id}` as never)
        return
      }
      Alert.alert(
        'Inspeção guardada no aparelho',
        'Ela será criada na próxima sincronização e então aparecerá na lista para ser feita.',
      )
    } catch (error) {
      Alert.alert('Não foi possível criar a inspeção', getErrorMessage(error))
    }
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.page}>
          <DetailHeader title={scaffold.code} subtitle="Situação e inspeções do andaime" />
          <NetworkStatusIndicator />

          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.code}>{scaffold.code}</Text>
              <StatusBadge label={PHYSICAL_STATUS[scaffold.currentStatus] ?? scaffold.currentStatus} />
            </View>
            {[scaffold.area, scaffold.location, scaffold.description]
              .filter(Boolean)
              .map((line) => (
                <Text key={line} style={styles.meta}>
                  {line}
                </Text>
              ))}
          </View>

          {availability ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Disponibilidade</Text>
              <AvailabilityBadge
                availability={availability}
                localInterdiction={Boolean(localInterdiction)}
              />
              {availability.reason ? <Text style={styles.meta}>{availability.reason}</Text> : null}
              {availability.restrictions ? (
                <Text style={styles.restrictions}>Restrições: {availability.restrictions}</Text>
              ) : null}
              <Text style={[styles.meta, availability.overdue ? styles.overdue : null]}>
                Próxima inspeção:{' '}
                {availability.nextDueAt ? formatShortDateTime(availability.nextDueAt) : '—'}
                {availability.overdue ? ' (vencida)' : ''}
              </Text>
            </View>
          ) : (
            <Banner
              tone="info"
              title="Andaime sem controle de inspeção"
              description="A política do contrato ainda não alcançou este andaime. Sincronize mais tarde."
            />
          )}

          {localInterdiction ? (
            <Banner
              tone="danger"
              title="Interdição ainda não enviada"
              description={`Registrada no aparelho: "${localInterdiction.payload.reason}". Será enviada na próxima sincronização.`}
            />
          ) : null}

          <Text style={styles.sectionHeading}>Inspeções abertas</Text>
          {inspections.length === 0 ? (
            <EmptyState
              title="Nenhuma inspeção aberta"
              description="A política abre as inspeções exigidas. Use Nova inspeção para uma extraordinária ou avulsa."
            />
          ) : (
            inspections.map((item) => (
              <Pressable
                key={item.id}
                style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
                onPress={() => router.push(`/(app)/inspections/${item.id}` as never)}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.trigger}>{TRIGGER_LABELS[item.trigger]}</Text>
                  {pending.submissions.has(item.id) ? (
                    <StatusBadge label="Aguardando envio" tone="info" />
                  ) : item.overdue ? (
                    <StatusBadge label="Vencida" tone="danger" />
                  ) : (
                    <StatusBadge
                      label={item.status === 'IN_PROGRESS' ? 'Em andamento' : 'Pendente'}
                      tone={item.status === 'IN_PROGRESS' ? 'info' : 'warning'}
                    />
                  )}
                </View>
                {item.ruleName ? <Text style={styles.meta}>{item.ruleName}</Text> : null}
                <Text style={[styles.meta, item.overdue ? styles.overdue : null]}>
                  {item.dueAt ? `Prazo ${formatShortDateTime(item.dueAt)}` : 'Sem prazo'}
                </Text>
              </Pressable>
            ))
          )}

          {localManual.map((item) => (
            <View key={item.localId} style={[styles.card, styles.localCard]}>
              <View style={styles.cardTop}>
                <Text style={styles.trigger}>{TRIGGER_LABELS[item.payload.trigger]}</Text>
                <StatusBadge label="Criada no aparelho" tone="info" />
              </View>
              <Text style={styles.meta}>{item.payload.reason}</Text>
            </View>
          ))}

          {canCreate || canInterdict ? (
            <View style={styles.actions}>
              {canCreate ? (
                <Button variant="secondary" onPress={() => setModal('manual')}>
                  Nova inspeção
                </Button>
              ) : null}
              {canInterdict ? (
                <Button variant="danger" onPress={() => setModal('interdict')}>
                  Interditar andaime
                </Button>
              ) : null}
            </View>
          ) : null}

          {interdicted && hasPermission(user, 'scaffold:interdict') ? (
            <View style={styles.note}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
              <Text style={styles.noteText}>
                A interdição só é retirada no sistema web, com o motivo da liberação.
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <ReasonModal
        visible={modal === 'interdict'}
        title={`Interditar ${scaffold.code}`}
        description="O andaime fica proibido para uso até ser reinspecionado e liberado."
        label="Motivo da interdição"
        placeholder="Ex.: guarda-corpo solto no 3º nível"
        confirmLabel="Interditar"
        tone="danger"
        onCancel={() => setModal(null)}
        onConfirm={interdict}
      />
      <ReasonModal
        visible={modal === 'manual'}
        title={`Nova inspeção em ${scaffold.code}`}
        description={
          trigger === 'EVENT'
            ? 'Extraordinária: depois de chuva forte, impacto ou parada longa. Bloqueia o uso até ser aprovada.'
            : 'Avulsa: só registra uma verificação, sem mudar a disponibilidade.'
        }
        label="Motivo"
        placeholder="Ex.: ventania durante a madrugada"
        confirmLabel="Criar"
        onCancel={() => setModal(null)}
        onConfirm={createManual}
      >
        <SegmentedControl options={MANUAL_TRIGGERS} value={trigger} onChange={setTrigger} />
      </ReasonModal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingBottom: spacing.xxxl,
  },
  page: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  card: {
    gap: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  localCard: {
    borderStyle: 'dashed',
  },
  pressed: {
    opacity: 0.85,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  code: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  sectionHeading: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  restrictions: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '700',
  },
  overdue: {
    color: colors.danger,
    fontWeight: '700',
  },
  trigger: {
    color: colors.primaryStrong,
    fontSize: 14,
    fontWeight: '800',
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  note: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  noteText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 12,
  },
})
