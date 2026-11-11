import { Ionicons } from '@expo/vector-icons'
import { useCallback, useMemo, useState } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NetworkStatusIndicator } from '@/components/app/network-status-indicator'
import { AvailabilityBadge } from '@/components/inspection/availability-badge'
import { Banner } from '@/components/ui/banner'
import { EmptyState } from '@/components/ui/empty-state'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { StatusBadge } from '@/components/ui/status-badge'
import { colors, radius, spacing } from '@/constants/theme'
import { useInspectionPack, usePendingInspectionWork } from '@/hooks/use-inspections'
import { useAuthStore } from '@/store/auth-store'
import { useConnectivityStore } from '@/store/connectivity-store'
import { useOperationalContextStore } from '@/store/operational-context-store'
import type { PackInspection, PackScaffold } from '@/types/inspection'
import { formatShortDateTime } from '@/utils/date'
import { getErrorMessage } from '@/utils/error'
import { compareInspections, TRIGGER_LABELS } from '@/utils/inspection-rules'

type Filter = 'ALL' | 'OVERDUE' | 'MINE'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'Abertas' },
  { value: 'OVERDUE', label: 'Vencidas' },
  { value: 'MINE', label: 'Comigo' },
]

const MAX_SEARCH_RESULTS = 40

function normalize(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function statusBadge(inspection: PackInspection, waitingUpload: boolean) {
  if (waitingUpload) return <StatusBadge label="Aguardando envio" tone="info" />
  if (inspection.overdue) return <StatusBadge label="Vencida" tone="danger" />
  if (inspection.status === 'IN_PROGRESS') return <StatusBadge label="Em andamento" tone="info" />
  return <StatusBadge label="Pendente" tone="warning" />
}

export default function InspectionsTab() {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const isConnected = useConnectivityStore((state) => state.isConnected)
  const { contractId, unitId, contractCode, unitCode } = useOperationalContextStore()
  const pack = useInspectionPack({ contractId, unitId })
  const pending = usePendingInspectionWork()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')
  const refetch = pack.refetch

  useFocusEffect(
    useCallback(() => {
      void refetch()
    }, [refetch]),
  )

  const scaffolds = useMemo(
    () => new Map((pack.data?.scaffolds ?? []).map((scaffold) => [scaffold.id, scaffold])),
    [pack.data],
  )

  const inspections = useMemo(() => {
    const items = [...(pack.data?.inspections ?? [])].sort(compareInspections)
    if (filter === 'OVERDUE') return items.filter((item) => item.overdue)
    if (filter === 'MINE') return items.filter((item) => item.inspectorId === user?.id)
    return items
  }, [filter, pack.data, user?.id])

  const searchResults = useMemo(() => {
    const term = normalize(search.trim())
    if (!term) return []
    return (pack.data?.scaffolds ?? [])
      .filter((scaffold) =>
        [scaffold.code, scaffold.location, scaffold.description, scaffold.area].some((field) =>
          normalize(field).includes(term),
        ),
      )
      .slice(0, MAX_SEARCH_RESULTS)
  }, [pack.data, search])

  const openScaffold = (scaffold: PackScaffold) =>
    router.push(`/(app)/inspections/scaffold/${scaffold.id}` as never)

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.pageTitle}>Inspeções</Text>
          <Text style={styles.pageSubtitle}>
            {contractCode ? `${contractCode} • ${unitCode ?? 'UN'}` : 'Contrato operacional'}
          </Text>
        </View>
        <NetworkStatusIndicator />
      </View>

      {pack.data?.enabled ? (
        <>
          <Pressable
            style={({ pressed }) => [styles.scanButton, pressed ? styles.pressed : null]}
            onPress={() => router.push('/(app)/inspections/scan' as never)}
          >
            <Ionicons name="qr-code-outline" size={22} color={colors.white} />
            <Text style={styles.scanLabel}>Ler QR Code da placa</Text>
          </Pressable>

          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color={colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar andaime por código ou local"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          <Text style={styles.freshness}>
            {pack.source === 'cache' ? 'Cópia do aparelho' : 'Atualizado'} em{' '}
            {formatShortDateTime(pack.data.generatedAt)}
            {pack.remoteError && isConnected ? ' • não foi possível atualizar agora' : ''}
          </Text>

          {pending.manual.length > 0 ? (
            <Banner
              tone="info"
              title={`${pending.manual.length} inspeção(ões) criada(s) no aparelho`}
              description="Aparecem na lista depois da sincronização."
            />
          ) : null}

          {search.trim() ? null : (
            <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
          )}
        </>
      ) : null}
    </View>
  )

  const blocker = (() => {
    if (!pack.allowed) {
      return (
        <EmptyState
          title="Sem acesso às inspeções"
          description="Seu perfil não tem a permissão de ver inspeções. Fale com o administrador."
        />
      )
    }
    if (!contractId || !unitId) {
      return (
        <EmptyState
          title="Selecione o contrato"
          description="Escolha a unidade e o contrato na tela inicial."
        />
      )
    }
    if (pack.isLoading) {
      return <EmptyState title="Carregando inspeções" description="Baixando a base do contrato..." />
    }
    if (!pack.data) {
      return (
        <Banner
          tone={isConnected ? 'danger' : 'warning'}
          title="Inspeções indisponíveis"
          description={
            isConnected
              ? getErrorMessage(pack.error, 'Não foi possível baixar as inspeções.')
              : 'Conecte-se uma vez para baixar as inspeções deste contrato.'
          }
        />
      )
    }
    if (!pack.data.enabled) {
      return (
        <EmptyState
          title="Contrato sem inspeções"
          description="Este contrato não tem política de inspeção publicada."
        />
      )
    }
    return null
  })()

  if (blocker) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.content}>
          {header}
          {blocker}
        </View>
      </SafeAreaView>
    )
  }

  if (search.trim()) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState
              title="Nenhum andaime encontrado"
              description="Só aparecem andaimes em montagem, montados ou em desmontagem deste contrato."
            />
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
              onPress={() => openScaffold(item)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.code}>{item.code}</Text>
                {item.availability ? (
                  <AvailabilityBadge
                    availability={item.availability}
                    localInterdiction={pending.interdictions.has(item.id)}
                    compact
                  />
                ) : null}
              </View>
              <Text style={styles.meta} numberOfLines={2}>
                {[item.area, item.location, item.description].filter(Boolean).join(' • ') ||
                  'Sem localização'}
              </Text>
            </Pressable>
          )}
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <FlatList
        data={inspections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            title={filter === 'ALL' ? 'Nenhuma inspeção aberta' : 'Nada neste filtro'}
            description="Use a busca ou o QR Code para abrir um andaime e criar uma inspeção."
          />
        }
        renderItem={({ item }) => {
          const scaffold = scaffolds.get(item.scaffoldId)
          return (
            <Pressable
              style={({ pressed }) => [
                styles.card,
                item.overdue ? styles.cardOverdue : null,
                pressed ? styles.pressed : null,
              ]}
              onPress={() => router.push(`/(app)/inspections/${item.id}` as never)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.code}>{scaffold?.code ?? 'Andaime'}</Text>
                {statusBadge(item, pending.submissions.has(item.id))}
              </View>
              <Text style={styles.trigger}>
                {TRIGGER_LABELS[item.trigger]}
                {item.ruleName ? ` • ${item.ruleName}` : ''}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {[scaffold?.area, scaffold?.location].filter(Boolean).join(' • ') || 'Sem localização'}
              </Text>
              <View style={styles.cardFooter}>
                <Ionicons
                  name="calendar-outline"
                  size={13}
                  color={item.overdue ? colors.danger : colors.textMuted}
                />
                <Text style={[styles.due, item.overdue ? styles.dueOverdue : null]}>
                  {item.dueAt ? `Prazo ${formatShortDateTime(item.dueAt)}` : 'Sem prazo'}
                </Text>
                {item.inspectorName ? (
                  <Text style={styles.inspector} numberOfLines={1}>
                    • {item.inspectorName}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          )
        }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  headerBlock: {
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  pageTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  pageSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryStrong,
  },
  scanLabel: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.85,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 46,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  freshness: {
    color: colors.textMuted,
    fontSize: 12,
  },
  card: {
    gap: 6,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  cardOverdue: {
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
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
    fontSize: 16,
    fontWeight: '800',
  },
  trigger: {
    color: colors.primaryStrong,
    fontSize: 13,
    fontWeight: '700',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  due: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  dueOverdue: {
    color: colors.danger,
  },
  inspector: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 12,
  },
})
