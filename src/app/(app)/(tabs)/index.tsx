import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NetworkStatusIndicator } from '@/components/app/network-status-indicator'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { kaeferWordmark } from '@/constants/brand-assets'
import { colors, radius, spacing } from '@/constants/theme'
import { useExecutionQueue } from '@/hooks/use-execution-queue'
import { createInitialManualSyncSteps, type ManualSyncStep } from '@/services/manual-sync.service'
import { queryClient } from '@/providers/app-providers'
import { useAuthStore } from '@/store/auth-store'
import { useConnectivityStore } from '@/store/connectivity-store'
import { useOperationalContextStore } from '@/store/operational-context-store'
import { useSyncStore } from '@/store/sync-store'
import { formatShortDateTime } from '@/utils/date'
import { getErrorMessage } from '@/utils/error'
import { getActiveDeviceCredential } from '@/services/session-storage'
import { revokeDeviceSession } from '@/services/device-session.service'
import { invalidateSyncedQueries } from '@/utils/sync-query-cache'
import { EntryDefaultsCard } from '@/components/home/entry-defaults-card'
import { UserMenu } from '@/components/home/user-menu'
import { hasPermission } from '@/utils/inspection-rules'

const homeShortcuts = [
  {
    title: 'Fila de execução',
    description: 'Consulte as atividades e registre os lançamentos.',
    icon: 'list-outline',
    href: '/(app)/(tabs)/queue',
    permission: null,
  },
  {
    title: 'Novo andaime',
    description: 'Cadastre um andaime em campo.',
    icon: 'add-circle-outline',
    href: '/(app)/(tabs)/emergency',
    permission: null,
  },
  {
    title: 'Desvios',
    description: 'Registre os desvios da operação.',
    icon: 'alert-circle-outline',
    href: '/(app)/(tabs)/deviations',
    permission: null,
  },
  {
    title: 'Inspeções',
    description: 'Consulte e realize as inspeções dos andaimes.',
    icon: 'shield-checkmark-outline',
    href: '/(app)/(tabs)/inspections',
    permission: 'inspection:view',
  },
] as const

export default function HomePage() {
  const user = useAuthStore((state) => state.user)
  const [menuVisible, setMenuVisible] = useState(false)
  const clearSession = useAuthStore((state) => state.clearSession)
  const isConnected = useConnectivityStore((state) => state.isConnected)
  const context = useOperationalContextStore()
  const resetContext = useOperationalContextStore((state) => state.reset)
  const pendingCount = useSyncStore((state) => state.pendingCount)
  const failedCount = useSyncStore((state) => state.failedCount)
  const lastSyncAt = useSyncStore((state) => state.lastSyncAt)
  const isSyncing = useSyncStore((state) => state.isSyncing)
  const runManualSyncNow = useSyncStore((state) => state.runManualSyncNow)
  const [manualSyncVisible, setManualSyncVisible] = useState(false)
  const [manualSyncError, setManualSyncError] = useState<string | null>(null)
  const [manualSyncSteps, setManualSyncSteps] = useState<ManualSyncStep[]>(
    createInitialManualSyncSteps,
  )
  const queueQuery = useExecutionQueue({
    contractId: context.contractId,
    unitId: context.unitId,
  })

  const hasScope = Boolean(context.unitId && context.contractId)
  const queueItems = queueQuery.data ?? []
  const loadingBase =
    hasScope && (queueQuery.isLoading || (queueQuery.isFetching && !queueItems.length))
  const queueErrorMessage = queueQuery.error
    ? getErrorMessage(queueQuery.error, 'Nao foi possivel carregar os dados deste contrato.')
    : null
  const progressLabel = loadingBase ? '0.0%' : '100.0%'
  const syncScope = useMemo(
    () =>
      context.contractId && context.unitId
        ? {
            contractId: context.contractId,
            unitId: context.unitId,
            companyId: context.companyId,
          }
        : null,
    [context.companyId, context.contractId, context.unitId],
  )
  const canRunManualSync = Boolean(
    syncScope && isConnected && !isSyncing && !manualSyncVisible && !queueQuery.isFetching,
  )
  const manualSyncComplete =
    manualSyncVisible && manualSyncSteps.every((step) => step.status === 'done')

  const handleLogout = async () => {
    const deviceCredential = getActiveDeviceCredential()
    if (deviceCredential && isConnected) {
      void revokeDeviceSession(deviceCredential)
    }

    resetContext()
    queryClient.clear()
    await clearSession()
    router.replace('/(auth)/login')
  }

  const confirmLogout = () => {
    const isFieldAccount = useAuthStore.getState().user?.accountType === 'FIELD'
    const warningMessage = isFieldAccount
      ? // No password to come back with: leaving needs a new code from the office.
        `Ao fazer logout, este celular só volta a entrar com um novo código de ativação do responsável pelo contrato.${
          pendingCount + failedCount > 0
            ? ' Os registros ainda não enviados ficam presos no aparelho até lá: sincronize antes de encerrar a sessão.'
            : ''
        }`
      : pendingCount + failedCount > 0
        ? 'Existem pendencias locais neste aparelho. Se encerrar a sessão, entre novamente com o mesmo usuario antes de tentar sincronizar.'
        : 'Deseja encerrar sua sessao neste aparelho?'

    if (Platform.OS === 'web') {
      const accepted = globalThis.confirm ? globalThis.confirm(warningMessage) : false
      if (accepted) {
        void handleLogout()
      }
      return
    }

    Alert.alert('Confirmar logout', warningMessage, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Encerrar sessão', style: 'destructive', onPress: () => void handleLogout() },
    ])
  }

  const handleManualSync = async () => {
    if (!syncScope || !canRunManualSync) {
      return
    }

    setManualSyncVisible(true)
    setManualSyncError(null)
    setManualSyncSteps(createInitialManualSyncSteps())

    try {
      await runManualSyncNow(syncScope, setManualSyncSteps)
      await invalidateSyncedQueries(queryClient)
    } catch (error) {
      setManualSyncError(getErrorMessage(error, 'Nao foi possivel atualizar a base local.'))
    } finally {
      setManualSyncVisible(false)
    }
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.pageContent}
        showsVerticalScrollIndicator={false}
        bounces
      >
        <View style={styles.topBar}>
          <View style={styles.logoCluster}>
            <Image source={kaeferWordmark} style={styles.logoImage} resizeMode="contain" />
          </View>

          <View style={styles.topBarActions}>
            <NetworkStatusIndicator />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Abrir menu do usuário"
              onPress={() => setMenuVisible(true)}
              style={({ pressed }) => [
                styles.menuButton,
                pressed ? styles.menuButtonPressed : null,
              ]}
            >
              <Ionicons name="menu-outline" size={20} color={colors.white} />
            </Pressable>
          </View>
        </View>

        {!hasScope ? (
          <View style={styles.emptyShell}>
            <Banner
              tone="warning"
              title="Escolha a unidade e o contrato"
              description="A base local so comeca a carregar depois que o contexto principal estiver definido."
            />
            <Pressable
              onPress={() => router.push('/(app)/context/unit' as never)}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed ? styles.primaryButtonPressed : null,
              ]}
            >
              <Text style={styles.primaryButtonLabel}>Selecionar contexto</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>Contrato selecionado</Text>

            <Pressable
              onPress={() => router.push('/(app)/context/unit' as never)}
              style={({ pressed }) => [styles.scopeCard, pressed ? styles.scopeCardPressed : null]}
            >
              <View style={styles.scopeIconWrap}>
                <Ionicons name="business-outline" size={18} color={colors.primaryStrong} />
              </View>
              <View style={styles.scopeTextBlock}>
                <Text numberOfLines={1} style={styles.scopeTitle}>
                  {context.contractDescription ??
                    context.contractCode ??
                    'Contrato operacional selecionado'}
                </Text>
                <Text numberOfLines={1} style={styles.scopeSubtitle}>
                  {[
                    context.contractCode,
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

            <View style={styles.heroCard}>
              <View style={styles.heroContent}>
                {loadingBase ? (
                  <>
                    <ActivityIndicator size="large" color={colors.primaryStrong} />
                    <Text style={styles.heroTitle}>
                      Aguarde enquanto carregamos seus dados ({progressLabel})
                    </Text>
                    <Text style={styles.heroSubtitle}>
                      Estamos baixando a base operacional deste contrato para o aparelho.
                    </Text>
                  </>
                ) : queueErrorMessage ? (
                  <>
                    <View style={styles.heroIcon}>
                      <Ionicons
                        name="cloud-offline-outline"
                        size={24}
                        color={colors.primaryStrong}
                      />
                    </View>
                    <Text style={styles.heroTitle}>Nao foi possivel atualizar a base local</Text>
                    <Text style={styles.heroSubtitle}>{queueErrorMessage}</Text>
                    <Pressable
                      onPress={() => (isConnected ? void queueQuery.refetch() : undefined)}
                      disabled={!isConnected || queueQuery.isFetching}
                      style={({ pressed }) => [
                        styles.heroAction,
                        !isConnected || queueQuery.isFetching ? styles.heroActionDisabled : null,
                        pressed && isConnected && !queueQuery.isFetching
                          ? styles.heroActionPressed
                          : null,
                      ]}
                    >
                      <Text style={styles.heroActionLabel}>
                        {isConnected ? 'Tentar novamente' : 'Offline'}
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <View style={styles.heroHeading}>
                      <View style={styles.scopeTextBlock}>
                        <Text style={styles.heroTitle}>Resumo do contrato</Text>
                        <Text style={styles.heroSubtitle}>
                          {isConnected ? 'Base local pronta' : 'Base offline carregada'}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        onPress={handleManualSync}
                        disabled={!canRunManualSync}
                        style={({ pressed }) => [
                          styles.heroActionSecondary,
                          !canRunManualSync && styles.heroActionSecondaryDisabled,
                          pressed && canRunManualSync && styles.heroActionPressed,
                        ]}
                      >
                        <Ionicons name="sync-outline" size={15} color={colors.primaryStrong} />
                        <Text style={styles.heroActionSecondaryLabel}>
                          {!isConnected
                            ? 'Offline'
                            : isSyncing || queueQuery.isFetching
                              ? 'Atualizando'
                              : 'Atualizar'}
                        </Text>
                      </Pressable>
                    </View>
                    <View style={styles.readyStatsRow}>
                      <View style={styles.readyStat}>
                        <Text style={styles.readyStatValue}>{queueItems.length}</Text>
                        <Text style={styles.readyStatLabel}>Na fila</Text>
                      </View>
                      <View style={styles.readyStat}>
                        <Text style={styles.readyStatValue}>{pendingCount}</Text>
                        <Text style={styles.readyStatLabel}>Pendentes</Text>
                      </View>
                      <View style={styles.readyStat}>
                        <Text style={styles.readyStatValue}>{failedCount}</Text>
                        <Text style={styles.readyStatLabel}>Com erro</Text>
                      </View>
                    </View>
                    <Text style={styles.heroSubtitle}>
                      Última sincronização: {formatShortDateTime(lastSyncAt)}
                    </Text>
                  </>
                )}
              </View>
            </View>

            <EntryDefaultsCard
              key={`${context.ownerTenantId}:${context.ownerUserId}:${context.unitId}:${context.contractId}`}
            />

            <View style={styles.shortcutList}>
              {homeShortcuts
                .filter((item) => !item.permission || hasPermission(user, item.permission))
                .map((item) => (
                  <Pressable
                    key={item.href}
                    accessibilityRole="button"
                    accessibilityLabel={item.title}
                    onPress={() => router.push(item.href as never)}
                    style={({ pressed }) => [
                      styles.shortcutCard,
                      pressed && styles.shortcutPressed,
                    ]}
                  >
                    <View style={styles.shortcutIcon}>
                      <Ionicons name={item.icon} size={22} color={colors.primary} />
                    </View>
                    <View style={styles.scopeTextBlock}>
                      <Text style={styles.shortcutTitle}>{item.title}</Text>
                      <Text style={styles.shortcutDescription}>{item.description}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </Pressable>
                ))}
            </View>

            {manualSyncError && !manualSyncVisible ? (
              <Banner
                tone="danger"
                title="Não foi possível concluir a atualização"
                description={manualSyncError}
                action={
                  <Button variant="secondary" onPress={() => setManualSyncError(null)}>
                    Fechar aviso
                  </Button>
                }
              />
            ) : null}

            {manualSyncVisible ? (
              <View style={styles.syncProgressCard}>
                <View style={styles.syncProgressHeader}>
                  <View style={styles.syncProgressTextBlock}>
                    <Text style={styles.syncProgressTitle}>Atualização da base</Text>
                    <Text style={styles.syncProgressSubtitle}>
                      {manualSyncError
                        ? 'Uma etapa precisa de nova tentativa.'
                        : manualSyncComplete
                          ? 'Todos os grupos foram atualizados.'
                          : 'Sincronizando dados deste contrato.'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.syncProgressStatus,
                      manualSyncError
                        ? styles.syncProgressStatusDanger
                        : manualSyncComplete
                          ? styles.syncProgressStatusSuccess
                          : styles.syncProgressStatusInfo,
                    ]}
                  >
                    <Text style={styles.syncProgressStatusLabel}>
                      {manualSyncError ? 'Erro' : manualSyncComplete ? '100%' : 'Em curso'}
                    </Text>
                  </View>
                </View>

                <View style={styles.syncStepList}>
                  {manualSyncSteps.map((step) => {
                    const stepIcon =
                      step.status === 'done'
                        ? 'checkmark-circle'
                        : step.status === 'error'
                          ? 'alert-circle'
                          : step.status === 'running'
                            ? 'sync-outline'
                            : 'ellipse-outline'
                    const stepColor =
                      step.status === 'done'
                        ? colors.success
                        : step.status === 'error'
                          ? colors.danger
                          : step.status === 'running'
                            ? colors.primaryStrong
                            : colors.textMuted

                    return (
                      <View key={step.key} style={styles.syncStepRow}>
                        <View style={styles.syncStepTopLine}>
                          <View style={styles.syncStepLabelWrap}>
                            <Ionicons name={stepIcon} size={14} color={stepColor} />
                            <Text style={styles.syncStepLabel}>{step.label}</Text>
                          </View>
                          <Text style={styles.syncStepPercent}>{Math.round(step.progress)}%</Text>
                        </View>
                        <View style={styles.syncStepTrack}>
                          <View
                            style={[
                              styles.syncStepBar,
                              { width: `${step.progress}%`, backgroundColor: stepColor },
                            ]}
                          />
                        </View>
                        {step.message ? (
                          <Text style={styles.syncStepMessage}>{step.message}</Text>
                        ) : null}
                      </View>
                    )
                  })}
                </View>

                {manualSyncError ? (
                  <Text style={styles.syncProgressError}>{manualSyncError}</Text>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      <UserMenu
        visible={menuVisible}
        user={user}
        onClose={() => setMenuVisible(false)}
        onLogout={confirmLogout}
        onSync={() => void handleManualSync()}
        canSync={canRunManualSync}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  shortcutList: {
    flexDirection: 'column',
    gap: spacing.md,
  },
  shortcutCard: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  shortcutPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  shortcutIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  shortcutDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
  },
  page: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
  },
  pageContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primaryStrong,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  logoCluster: {
    width: 116,
    height: 30,
    justifyContent: 'center',
  },
  logoImage: {
    width: 112,
    height: 30,
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonPressed: {
    opacity: 0.86,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
    marginTop: spacing.xs,
  },
  scopeCard: {
    minHeight: 62,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#E5ECEF',
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  scopeCardPressed: {
    backgroundColor: '#F8FBFC',
  },
  scopeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeTextBlock: {
    flex: 1,
    gap: 2,
  },
  scopeTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  scopeSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
  },
  heroCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#DDE7EC',
    backgroundColor: colors.surface,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  heroContent: {
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    alignSelf: 'center',
  },
  heroTitle: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  heroSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  readyStatsRow: {
    width: '100%',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  readyStat: {
    flex: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  readyStatValue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  readyStatLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroAction: {
    alignSelf: 'flex-start',
    minHeight: 44,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  heroActionPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  heroActionDisabled: {
    opacity: 0.5,
  },
  heroActionLabel: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  heroHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  heroActionSecondary: {
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroActionSecondaryDisabled: {
    backgroundColor: colors.surfaceMuted,
    opacity: 0.55,
  },
  heroActionSecondaryLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  syncProgressCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#DDE7EC',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  syncProgressHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  syncProgressTextBlock: {
    flex: 1,
  },
  syncProgressTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  syncProgressSubtitle: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  syncProgressStatus: {
    minHeight: 26,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncProgressStatusInfo: {
    backgroundColor: '#EEF7FB',
    borderColor: '#C7DEEA',
  },
  syncProgressStatusSuccess: {
    backgroundColor: '#EEF9F4',
    borderColor: '#CDE8DC',
  },
  syncProgressStatusDanger: {
    backgroundColor: '#FFF1EE',
    borderColor: '#E6C4BD',
  },
  syncProgressStatusLabel: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '700',
  },
  syncStepList: {
    gap: spacing.sm,
  },
  syncStepRow: {
    gap: 6,
  },
  syncStepTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  syncStepLabelWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  syncStepLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  syncStepPercent: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  syncStepTrack: {
    height: 5,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAccent,
  },
  syncStepBar: {
    height: '100%',
    borderRadius: 999,
  },
  syncStepMessage: {
    color: colors.danger,
    fontSize: 10,
    lineHeight: 14,
  },
  syncProgressError: {
    color: colors.danger,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  infoCardPressed: {
    backgroundColor: '#FBFCFD',
  },
  emptyShell: {
    gap: spacing.md,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.92,
  },
  primaryButtonLabel: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
})
