import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NetworkStatusIndicator } from '@/components/app/network-status-indicator'
import { Banner } from '@/components/ui/banner'
import { EmptyState } from '@/components/ui/empty-state'
import { colors, radius, spacing } from '@/constants/theme'
import { useQueueServiceDetail } from '@/hooks/use-queue-service-detail'
import { useConnectivityStore } from '@/store/connectivity-store'
import { useOperationalContextStore } from '@/store/operational-context-store'
import { formatBusinessDate } from '@/utils/date'
import { getMeasurementUnitLabel } from '@/utils/execution'

function getOperationTypeLabel(type: string) {
  switch (type) {
    case 'MONTAGEM':
      return 'Montagem'
    case 'DESMONTAGEM':
      return 'Desmontagem'
    case 'MODIFICACAO':
      return 'Modificação'
    default:
      return type
  }
}

function getStatusLabel(status: string) {
  return status === 'EM_EXECUCAO' ? 'Em andamento' : 'Não iniciado'
}

function getExecutionActionLabel(status: string) {
  return status === 'EM_EXECUCAO' ? 'Dar avanço' : 'Iniciar execução'
}

function formatForecast(value?: string | null) {
  return formatBusinessDate(value) ?? '--/--/----'
}

type DetailRowProps = {
  label: string
  value: string
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  )
}

export default function QueueDetailPage() {
  const router = useRouter()
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>()
  const isConnected = useConnectivityStore((state) => state.isConnected)
  const { contractId, unitId } = useOperationalContextStore()
  const serviceQuery = useQueueServiceDetail(serviceId ?? null, { contractId, unitId }, isConnected)
  const service = serviceQuery.data

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.page}>
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.headerIcon,
                pressed ? styles.headerIconPressed : null,
              ]}
            >
              <Ionicons name="chevron-back" size={18} color={colors.primaryStrong} />
            </Pressable>

            <View style={styles.headerTextBlock}>
              <Text style={styles.headerTitle}>Detalhe da atividade</Text>
              <Text style={styles.headerSubtitle}>
                Veja os dados do serviço antes de seguir para o lançamento.
              </Text>
            </View>
          </View>

          <NetworkStatusIndicator />

          {serviceQuery.isLoading ? (
            <View style={styles.loadingCard}>
              <Text style={styles.loadingTitle}>Carregando atividade</Text>
              <Text style={styles.loadingText}>Buscando os dados mais recentes deste serviço.</Text>
            </View>
          ) : !service ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                title="Atividade não encontrada"
                description="Volte para a fila e sincronize novamente para atualizar a base local."
              />
            </View>
          ) : (
            <>
              <View style={styles.heroCard}>
                <View style={styles.heroTop}>
                  <View style={styles.heroTextBlock}>
                    <Text style={styles.heroCode}>{service.scaffold?.code ?? 'ANDAIME'}</Text>
                    <Text style={styles.heroDescription} numberOfLines={3}>
                      {service.description ??
                        service.scaffold?.description ??
                        'Sem descrição operacional registrada.'}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusPill,
                      service.status === 'EM_EXECUCAO'
                        ? styles.statusSuccess
                        : styles.statusWarning,
                    ]}
                  >
                    <Text style={styles.statusLabel}>{getStatusLabel(service.status)}</Text>
                  </View>
                </View>

                <View style={styles.heroMetaRow}>
                  <View style={styles.metaChip}>
                    <Ionicons name="construct-outline" size={13} color={colors.primaryStrong} />
                    <Text style={styles.metaChipText}>{getOperationTypeLabel(service.type)}</Text>
                  </View>
                  <View style={styles.metaChip}>
                    <Ionicons name="document-text-outline" size={13} color={colors.primaryStrong} />
                    <Text style={styles.metaChipText}>{service.workOrder?.code ?? 'Sem OS'}</Text>
                  </View>
                </View>

                <Pressable
                  onPress={() => router.push(`/(app)/queue/${service.id}/execute` as never)}
                  style={({ pressed }) => [
                    styles.heroActionButton,
                    pressed ? styles.heroActionButtonPressed : null,
                  ]}
                >
                  <Ionicons name="flash-outline" size={15} color={colors.white} />
                  <Text style={styles.heroActionButtonLabel}>
                    {getExecutionActionLabel(service.status)}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Dados da atividade</Text>
                <View style={styles.detailsGrid}>
                  <DetailRow
                    label="Componente"
                    value={service.scaffoldComponent?.name ?? 'Atividade geral do andaime'}
                  />
                  <DetailRow
                    label="Categoria"
                    value={service.scaffoldComponent?.category ?? 'Operação'}
                  />
                  <DetailRow
                    label="Unidade de medição"
                    value={getMeasurementUnitLabel(service.plannedUnit)}
                  />
                  <DetailRow
                    label="Código da OS"
                    value={service.workOrder?.code ?? 'Não vinculada'}
                  />
                </View>
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Andamento</Text>
                <View style={styles.metricsRow}>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>{service.plannedQuantity}</Text>
                    <Text style={styles.metricLabel}>Planejado</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>{service.executedQuantity}</Text>
                    <Text style={styles.metricLabel}>Executado</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>{Math.round(service.progress)}%</Text>
                    <Text style={styles.metricLabel}>Progresso</Text>
                  </View>
                </View>

                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.max(0, Math.min(100, Math.round(service.progress)))}%` },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Previsões</Text>
                <View style={styles.detailsGrid}>
                  <DetailRow
                    label="Início previsto"
                    value={formatForecast(service.startForecast)}
                  />
                  <DetailRow label="Fim previsto" value={formatForecast(service.endForecast)} />
                </View>
              </View>

              {service.status === 'EM_EXECUCAO' && service.progress >= 100 ? (
                <Banner
                  tone="warning"
                  title="Serviço já está em 100%"
                  description="Revise antes de lançar novamente, para evitar apontamento desnecessário."
                />
              ) : null}

              <Pressable
                onPress={() => router.push(`/(app)/queue/${service.id}/execute` as never)}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed ? styles.primaryButtonPressed : null,
                ]}
              >
                <Text style={styles.primaryButtonLabel}>
                  {getExecutionActionLabel(service.status)}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: spacing.xxxl,
  },
  page: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconPressed: {
    opacity: 0.84,
  },
  headerTextBlock: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  loadingCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  loadingTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  emptyWrap: {
    paddingTop: spacing.sm,
  },
  heroCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  heroTextBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  heroCode: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  heroDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heroActionButton: {
    marginTop: spacing.xs,
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'stretch',
  },
  heroActionButtonPressed: {
    opacity: 0.88,
  },
  heroActionButtonLabel: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  metaChip: {
    minHeight: 30,
    paddingHorizontal: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaChipText: {
    color: colors.primaryStrong,
    fontSize: 11,
    fontWeight: '700',
  },
  statusPill: {
    minHeight: 26,
    paddingHorizontal: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusSuccess: {
    backgroundColor: '#EEF8F4',
    borderColor: '#CAE3D9',
  },
  statusWarning: {
    backgroundColor: '#FFF6E8',
    borderColor: '#E8D2B1',
  },
  statusLabel: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '700',
  },
  sectionCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  detailsGrid: {
    gap: spacing.sm,
  },
  detailRow: {
    gap: 2,
  },
  detailLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  detailValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricCard: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  metricValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 10,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryButtonPressed: {
    opacity: 0.88,
  },
  primaryButtonLabel: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
})
