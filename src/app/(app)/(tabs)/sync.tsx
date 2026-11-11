import { Ionicons } from '@expo/vector-icons'
import { useCallback } from 'react'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Banner } from '@/components/ui/banner'
import { NetworkStatusIndicator } from '@/components/app/network-status-indicator'
import { EmptyState } from '@/components/ui/empty-state'
import { colors, radius, spacing } from '@/constants/theme'
import { useConnectivityStore } from '@/store/connectivity-store'
import { useOperationalContextStore } from '@/store/operational-context-store'
import { useSyncStore } from '@/store/sync-store'
import { OutboxEntityType, SyncStatus, type OutboxItem } from '@/types/sync'
import { formatShortDateTime } from '@/utils/date'
import { getQueuedExecutionServiceId } from '@/utils/queued-execution'

function getItemTitle(item: OutboxItem) {
  if (item.entityType === OutboxEntityType.EMERGENCY_SCAFFOLD) {
    return 'Andaime emergencial'
  }

  if (item.entityType === OutboxEntityType.EXECUTION_ENTRY) {
    return 'Lançamento de execução'
  }

  if (item.entityType === OutboxEntityType.OPERATIONAL_DEVIATION) {
    return 'Desvio operacional'
  }

  if (item.entityType === OutboxEntityType.INSPECTION_SUBMISSION) {
    const payload = item.payload as { scaffoldCode?: string; complete?: boolean } | undefined
    return `${payload?.complete === false ? 'Respostas de inspeção' : 'Inspeção'} ${payload?.scaffoldCode ?? ''}`.trim()
  }

  if (item.entityType === OutboxEntityType.INSPECTION_MANUAL) {
    const payload = item.payload as { scaffoldCode?: string } | undefined
    return `Nova inspeção ${payload?.scaffoldCode ?? ''}`.trim()
  }

  if (item.entityType === OutboxEntityType.SCAFFOLD_INTERDICTION) {
    const payload = item.payload as { scaffoldCode?: string } | undefined
    return `Interdição ${payload?.scaffoldCode ?? ''}`.trim()
  }

  return 'Atualização operacional'
}

function getItemDescription(item: OutboxItem) {
  if (item.entityType === OutboxEntityType.EMERGENCY_SCAFFOLD) {
    return 'Cadastro salvo no aparelho aguardando envio ao backend.'
  }

  if (item.entityType === OutboxEntityType.EXECUTION_ENTRY) {
    return 'Apontamento salvo localmente para sincronização posterior.'
  }

  if (item.entityType === OutboxEntityType.OPERATIONAL_DEVIATION) {
    return item.remoteId
      ? 'Fotos do desvio aguardando reenvio ao backend.'
      : 'Desvio salvo no aparelho aguardando envio ao backend.'
  }

  if (item.entityType === OutboxEntityType.INSPECTION_SUBMISSION) {
    const payload = item.payload as { answersSent?: boolean; evidences?: unknown[] } | undefined
    return payload?.answersSent
      ? `Respostas enviadas; ${payload.evidences?.length ?? 0} arquivo(s) e a conclusão aguardando envio.`
      : 'Checklist feito no aparelho aguardando envio.'
  }

  if (item.entityType === OutboxEntityType.INSPECTION_MANUAL) {
    return 'Inspeção manual criada no aparelho aguardando envio.'
  }

  if (item.entityType === OutboxEntityType.SCAFFOLD_INTERDICTION) {
    return 'Interdição registrada no aparelho aguardando envio. Até lá, o andaime só está interditado neste aparelho.'
  }

  return 'Registro operacional pendente de sincronização.'
}

function getStatusLabel(status: SyncStatus) {
  switch (status) {
    case SyncStatus.FAILED:
      return 'Com erro'
    case SyncStatus.DEAD_LETTER:
      return 'Revisão manual'
    case SyncStatus.CONFLICT:
      return 'Conflito'
    case SyncStatus.SYNCING:
      return 'Enviando'
    default:
      return 'Pendente'
  }
}

function getStatusToneStyle(status: SyncStatus) {
  switch (status) {
    case SyncStatus.FAILED:
    case SyncStatus.DEAD_LETTER:
    case SyncStatus.CONFLICT:
      return styles.statusDanger
    case SyncStatus.SYNCING:
      return styles.statusInfo
    default:
      return styles.statusWarning
  }
}

const PERMANENT_ERROR_PREFIX = '[permanent]'

function isPermanentFailure(item: OutboxItem) {
  return (
    item.syncStatus === SyncStatus.DEAD_LETTER ||
    item.syncStatus === SyncStatus.CONFLICT ||
    item.errorMessage?.startsWith(PERMANENT_ERROR_PREFIX)
  )
}

function getRetryHint(item: OutboxItem) {
  if (item.syncStatus === SyncStatus.CONFLICT) {
    return 'Conflito com o estado remoto; revise o registro antes de reenviar.'
  }

  if (item.syncStatus === SyncStatus.DEAD_LETTER) {
    return 'Limite de tentativas atingido; revise o registro antes de reenviar.'
  }

  if (item.syncStatus !== SyncStatus.FAILED) {
    return null
  }

  if (isPermanentFailure(item)) {
    return 'Precisa revisão manual antes de reenviar.'
  }

  const nextAttemptAt = item.nextAttemptAt ? Date.parse(item.nextAttemptAt) : Number.NaN
  if (Number.isNaN(nextAttemptAt)) {
    return 'Pronto para nova tentativa.'
  }

  const remainingMs = nextAttemptAt - Date.now()

  if (remainingMs <= 0) {
    return 'Pronto para nova tentativa.'
  }

  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000))
  return `Tentará novamente em ${minutes} min.`
}

function cleanErrorMessage(message?: string | null) {
  return message?.replace(PERMANENT_ERROR_PREFIX, '').trim()
}

export default function SyncPage() {
  const router = useRouter()
  const { saved } = useLocalSearchParams<{ saved?: string }>()
  const isConnected = useConnectivityStore((state) => state.isConnected)
  const { contractId, unitId } = useOperationalContextStore()
  const {
    outboxItems,
    pendingCount,
    failedCount,
    isSyncing,
    lastSyncAt,
    lastError,
    runSyncNow,
    refreshState,
    retryItem,
    removeItem,
  } = useSyncStore()

  const scope =
    contractId && unitId
      ? {
          contractId,
          unitId,
        }
      : null
  const canRunSync = Boolean(scope && isConnected && !isSyncing)

  useFocusEffect(
    useCallback(() => {
      void refreshState()
    }, [refreshState]),
  )

  const handleDelete = (item: OutboxItem) => {
    if (Platform.OS === 'web') {
      const accepted = globalThis.confirm
        ? globalThis.confirm('Excluir esta pendência do aparelho? Essa ação não pode ser desfeita.')
        : true

      if (accepted) {
        void removeItem(item.localId)
      }

      return
    }

    Alert.alert(
      'Excluir pendência',
      'Esse rascunho será removido do aparelho e deixará de ser reenviado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => void removeItem(item.localId),
        },
      ],
    )
  }

  const handleEditExecution = (item: OutboxItem) => {
    if (item.entityType !== OutboxEntityType.EXECUTION_ENTRY || item.remoteId || item.syncStatus === SyncStatus.SYNCING) {
      return
    }

    const serviceId = getQueuedExecutionServiceId(item.payload)
    if (!serviceId) {
      return
    }

    router.push({
      pathname: '/(app)/queue/[serviceId]/execute',
      params: {
        serviceId,
        draftLocalId: item.localId,
      },
    })
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.page}>
          <View style={styles.headerRow}>
            <View style={styles.headerTextBlock}>
              <Text style={styles.headerTitle}>Pendências</Text>
              <Text style={styles.headerSubtitle}>
                Acompanhe o que ainda está no aparelho e resolva cada envio com calma.
              </Text>
            </View>

            <Pressable
              onPress={() => (canRunSync && scope ? void runSyncNow(scope) : undefined)}
              disabled={!canRunSync}
              style={({ pressed }) => [
                styles.headerAction,
                !canRunSync ? styles.headerActionDisabled : null,
                pressed && canRunSync ? styles.headerActionPressed : null,
              ]}
            >
              <Ionicons
                name="sync-outline"
                size={16}
                color={canRunSync ? colors.primaryStrong : colors.textMuted}
              />
            </Pressable>
          </View>

          <NetworkStatusIndicator />

          {!isConnected ? (
            <Banner
              tone="warning"
              title="Sincronização indisponível"
              description="Você está offline. Os envios e atualizações ficam bloqueados até a conexão voltar."
            />
          ) : null}

          {saved === 'queued' ? (
            <Banner
              tone="info"
              title="Registro salvo no aparelho"
              description="Assim que houver conexão estável, o app tenta enviar novamente."
            />
          ) : null}

          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <Text style={styles.summaryTitle}>Resumo da sincronização</Text>
              <View
                style={[styles.statusPill, isSyncing ? styles.statusInfo : styles.statusNeutral]}
              >
                <Text style={styles.statusLabel}>{isSyncing ? 'Sincronizando' : 'Em espera'}</Text>
              </View>
            </View>

            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{pendingCount}</Text>
                <Text style={styles.metricLabel}>Pendentes</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{failedCount}</Text>
                <Text style={styles.metricLabel}>Com erro</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{outboxItems.length}</Text>
                <Text style={styles.metricLabel}>Na fila</Text>
              </View>
            </View>

            <Text style={styles.summaryMeta}>
              Última sincronização: {formatShortDateTime(lastSyncAt)}
            </Text>

            <View style={styles.summaryActions}>
              <Pressable
                onPress={() => (canRunSync && scope ? void runSyncNow(scope) : undefined)}
                disabled={!canRunSync}
                style={({ pressed }) => [
                  styles.primaryButton,
                  !canRunSync ? styles.primaryButtonDisabled : null,
                  pressed && canRunSync ? styles.primaryButtonPressed : null,
                ]}
              >
                <Text style={styles.primaryButtonLabel}>
                  {!isConnected ? 'Offline' : isSyncing ? 'Sincronizando...' : 'Sincronizar agora'}
                </Text>
              </Pressable>
            </View>
          </View>

          {lastError ? (
            <Banner tone="danger" title="A última tentativa falhou" description={lastError} />
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Fila local do aparelho</Text>
            <Text style={styles.sectionSubtitle}>
              Edite, reenvie ou exclua apenas o que realmente precisa de ação.
            </Text>
          </View>

          {outboxItems.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                title="Nenhuma pendência no momento"
                description="Tudo que precisava sair deste aparelho já foi enviado ou ainda não foi registrado."
              />
            </View>
          ) : (
            <View style={styles.list}>
              {outboxItems.map((item) => (
                <View key={item.localId} style={styles.itemCard}>
                  <View style={styles.itemTopRow}>
                    <View style={styles.itemTitleBlock}>
                      <Text style={styles.itemTitle}>{getItemTitle(item)}</Text>
                      <Text style={styles.itemDescription}>{getItemDescription(item)}</Text>
                    </View>

                    <View style={[styles.statusPill, getStatusToneStyle(item.syncStatus)]}>
                      <Text style={styles.statusLabel}>{getStatusLabel(item.syncStatus)}</Text>
                    </View>
                  </View>

                  <View style={styles.metaRow}>
                    <Text style={styles.itemMeta}>
                      Criado em {formatShortDateTime(item.createdAt)}
                    </Text>
                    <Text style={styles.itemMeta}>Tentativas {item.retryCount}</Text>
                  </View>

                  <Text style={styles.itemMeta}>
                    Atualizado em {formatShortDateTime(item.updatedAt)}
                  </Text>

                  {item.errorMessage ? (
                    <View style={styles.errorBox}>
                      <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
                      <Text style={styles.itemError}>{cleanErrorMessage(item.errorMessage)}</Text>
                    </View>
                  ) : null}

                  {getRetryHint(item) ? (
                    <View style={styles.retryHintBox}>
                      <Ionicons
                        name={isPermanentFailure(item) ? 'construct-outline' : 'time-outline'}
                        size={14}
                        color={isPermanentFailure(item) ? colors.danger : colors.primaryStrong}
                      />
                      <Text style={styles.retryHintText}>{getRetryHint(item)}</Text>
                    </View>
                  ) : null}

                  <View style={styles.itemActions}>
                    {item.entityType === OutboxEntityType.EXECUTION_ENTRY && !item.remoteId && item.syncStatus !== SyncStatus.SYNCING ? (
                      <Pressable
                        onPress={() => handleEditExecution(item)}
                        style={({ pressed }) => [
                          styles.secondaryAction,
                          pressed ? styles.secondaryActionPressed : null,
                        ]}
                      >
                        <Ionicons name="create-outline" size={14} color={colors.primaryStrong} />
                        <Text style={styles.secondaryActionLabel}>Editar</Text>
                      </Pressable>
                    ) : null}

                    <Pressable
                      onPress={() =>
                        void retryItem(item.localId, {
                          contractId: item.contractId ?? scope?.contractId ?? '',
                          unitId: item.unitId ?? scope?.unitId ?? '',
                        })
                      }
                      disabled={!isConnected || item.syncStatus === SyncStatus.SYNCING}
                      style={({ pressed }) => [
                        styles.secondaryAction,
                        !isConnected || item.syncStatus === SyncStatus.SYNCING
                          ? styles.secondaryActionDisabled
                          : null,
                        pressed && isConnected && item.syncStatus !== SyncStatus.SYNCING
                          ? styles.secondaryActionPressed
                          : null,
                      ]}
                    >
                      <Ionicons
                        name="refresh-outline"
                        size={14}
                        color={isConnected ? colors.primaryStrong : colors.textMuted}
                      />
                      <Text
                        style={[
                          styles.secondaryActionLabel,
                          !isConnected ? styles.secondaryActionLabelDisabled : null,
                        ]}
                      >
                        Reenviar
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => handleDelete(item)}
                      style={({ pressed }) => [
                        styles.dangerAction,
                        pressed ? styles.dangerActionPressed : null,
                      ]}
                    >
                      <Ionicons name="trash-outline" size={14} color={colors.danger} />
                      <Text style={styles.dangerActionLabel}>Excluir</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
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
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerTextBlock: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  headerAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionPressed: {
    opacity: 0.82,
  },
  headerActionDisabled: {
    opacity: 0.45,
  },
  summaryCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
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
    gap: 2,
    alignItems: 'center',
  },
  metricValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
  summaryMeta: {
    color: colors.textMuted,
    fontSize: 11,
  },
  summaryActions: {
    gap: spacing.sm,
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryButtonPressed: {
    opacity: 0.88,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonLabel: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  sectionHeader: {
    gap: 2,
    paddingTop: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 17,
  },
  emptyWrap: {
    paddingTop: spacing.xs,
  },
  list: {
    gap: spacing.sm,
  },
  itemCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  itemTitleBlock: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  itemDescription: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  statusPill: {
    minHeight: 26,
    paddingHorizontal: spacing.sm,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  statusNeutral: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
  },
  statusWarning: {
    backgroundColor: '#FFF6E8',
    borderColor: '#E8D2B1',
  },
  statusDanger: {
    backgroundColor: '#FFF1EE',
    borderColor: '#E6C4BD',
  },
  statusInfo: {
    backgroundColor: '#EEF7FB',
    borderColor: '#C7DEEA',
  },
  statusLabel: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  itemMeta: {
    color: colors.textMuted,
    fontSize: 10,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: '#FFF6F4',
    borderWidth: 1,
    borderColor: '#F0D2CC',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  itemError: {
    flex: 1,
    color: colors.danger,
    fontSize: 11,
    lineHeight: 16,
  },
  retryHintBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#DCE8EE',
    backgroundColor: '#F6FAFB',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  retryHintText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  itemActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  secondaryAction: {
    minHeight: 34,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  secondaryActionPressed: {
    opacity: 0.84,
  },
  secondaryActionDisabled: {
    opacity: 0.45,
  },
  secondaryActionLabel: {
    color: colors.primaryStrong,
    fontSize: 11,
    fontWeight: '700',
  },
  secondaryActionLabelDisabled: {
    color: colors.textMuted,
  },
  dangerAction: {
    minHeight: 34,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E6C4BD',
    backgroundColor: '#FFF6F4',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dangerActionPressed: {
    opacity: 0.84,
  },
  dangerActionLabel: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: '700',
  },
})
