import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NetworkStatusIndicator } from '@/components/app/network-status-indicator'
import { MonthPickerModal } from '@/components/my-day/month-picker-modal'
import { Banner } from '@/components/ui/banner'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { colors, radius, spacing } from '@/constants/theme'
import { useMyDay } from '@/hooks/use-my-day'
import { useOperationalContextStore } from '@/store/operational-context-store'
import { formatShortDateTime } from '@/utils/date'
import { getErrorMessage } from '@/utils/error'
import {
  activityStatus,
  addDays,
  advanceLabel,
  countByDay,
  dateKey,
  dayTitle,
  dayTotals,
  formatNumber,
  monthRange,
  monthTitle,
  operationLabel,
  scaffoldsOfDay,
  shiftMonth,
  startOfWeek,
  timeRangeLabel,
  weekDays,
  weekRange,
  type MyDayActivity,
} from '@/utils/my-day'

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** What the signed-in person executed, day by day, with the current day open. */
export default function MyDayPage() {
  const { contractId, unitId } = useOperationalContextStore()
  const scope = { contractId, unitId }
  const todayKey = dateKey(new Date())
  const [selectedKey, setSelectedKey] = useState(todayKey)
  const [pickerVisible, setPickerVisible] = useState(false)
  const [pickerMonth, setPickerMonth] = useState(todayKey)

  const range = useMemo(() => weekRange(selectedKey), [selectedKey])
  const weekQuery = useMyDay(scope, range)
  const pickerRange = useMemo(() => monthRange(pickerMonth), [pickerMonth])
  const monthQuery = useMyDay(scope, pickerRange, { enabled: pickerVisible })

  // New entries were probably made on the other tabs: read again on return.
  const { refetch } = weekQuery
  useFocusEffect(
    useCallback(() => {
      void refetch()
    }, [refetch]),
  )

  const activities = useMemo(() => weekQuery.data?.activities ?? [], [weekQuery.data])
  const counts = useMemo(() => countByDay(activities), [activities])
  const monthCounts = useMemo(
    () => countByDay(monthQuery.data?.activities ?? []),
    [monthQuery.data],
  )
  const days = weekDays(selectedKey, todayKey)
  const scaffolds = useMemo(() => scaffoldsOfDay(activities, selectedKey), [activities, selectedKey])
  const totals = dayTotals(scaffolds)
  const isCurrentWeek = startOfWeek(selectedKey) === startOfWeek(todayKey)

  const moveWeek = (weeks: number) => {
    const next = addDays(selectedKey, weeks * 7)
    setSelectedKey(next > todayKey ? todayKey : next)
  }

  const openPicker = () => {
    setPickerMonth(selectedKey)
    setPickerVisible(true)
  }

  if (!contractId || !unitId) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.page}>
          <Text style={styles.headerTitle}>Meu dia</Text>
          <EmptyState
            title="Escolha a unidade e o contrato"
            description="As atividades são mostradas para o contrato selecionado no Início."
          />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={weekQuery.isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.primaryStrong}
            colors={[colors.primaryStrong]}
          />
        }
      >
        <View style={styles.page}>
          <View style={styles.headerRow}>
            <View style={styles.headerTextBlock}>
              <Text style={styles.headerTitle}>Meu dia</Text>
              <Text style={styles.headerSubtitle}>
                Os andaimes em que você lançou execução, dia a dia.
              </Text>
            </View>
            <Pressable
              onPress={openPicker}
              style={({ pressed }) => [styles.headerAction, pressed ? styles.pressed : null]}
              accessibilityLabel="Escolher dia no calendário"
            >
              <Ionicons name="calendar-outline" size={18} color={colors.primaryStrong} />
            </Pressable>
          </View>

          <NetworkStatusIndicator />

          <View style={styles.weekNav}>
            <Pressable
              onPress={() => moveWeek(-1)}
              style={styles.arrow}
              hitSlop={8}
              accessibilityLabel="Semana anterior"
            >
              <Ionicons name="chevron-back" size={18} color={colors.primaryStrong} />
            </Pressable>
            <Pressable onPress={openPicker} style={styles.monthButton} hitSlop={4}>
              <Text style={styles.monthLabel}>{monthTitle(selectedKey)}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
            </Pressable>
            <Pressable
              onPress={() => moveWeek(1)}
              disabled={isCurrentWeek}
              style={[styles.arrow, isCurrentWeek ? styles.disabled : null]}
              hitSlop={8}
              accessibilityLabel="Próxima semana"
            >
              <Ionicons name="chevron-forward" size={18} color={colors.primaryStrong} />
            </Pressable>
          </View>

          <View style={styles.weekStrip}>
            {days.map((day) => {
              const selected = day.key === selectedKey
              const count = counts.get(day.key) ?? 0
              return (
                <Pressable
                  key={day.key}
                  disabled={day.isFuture}
                  onPress={() => setSelectedKey(day.key)}
                  style={[
                    styles.dayCard,
                    day.isToday ? styles.dayCardToday : null,
                    selected ? styles.dayCardSelected : null,
                    day.isFuture ? styles.disabled : null,
                  ]}
                  accessibilityLabel={`${day.weekday} ${day.dayOfMonth}, ${plural(count, 'lançamento', 'lançamentos')}`}
                >
                  <Text style={[styles.dayWeekday, selected ? styles.dayTextSelected : null]}>
                    {day.weekday}
                  </Text>
                  <Text style={[styles.dayNumber, selected ? styles.dayTextSelected : null]}>
                    {day.dayOfMonth}
                  </Text>
                  <View
                    style={[
                      styles.dayCount,
                      count > 0 ? styles.dayCountOn : null,
                      count > 0 && selected ? styles.dayCountSelected : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayCountLabel,
                        count > 0 ? styles.dayCountLabelOn : null,
                        count > 0 && selected ? styles.dayCountLabelSelected : null,
                      ]}
                    >
                      {count > 0 ? count : '–'}
                    </Text>
                  </View>
                </Pressable>
              )
            })}
          </View>

          {selectedKey !== todayKey ? (
            <Pressable onPress={() => setSelectedKey(todayKey)} style={styles.todayLink}>
              <Ionicons name="return-down-back-outline" size={14} color={colors.primaryStrong} />
              <Text style={styles.todayLinkLabel}>Voltar para hoje</Text>
            </Pressable>
          ) : null}

          {weekQuery.data && !weekQuery.data.live ? (
            <Banner
              tone="warning"
              title="Sem conexão com o servidor"
              description={
                weekQuery.data.savedAt
                  ? `Mostrando o que foi carregado em ${formatShortDateTime(weekQuery.data.savedAt)} e os lançamentos deste aparelho.`
                  : 'Mostrando apenas os lançamentos ainda neste aparelho. Os já enviados aparecem quando a conexão voltar.'
              }
            />
          ) : null}

          {weekQuery.data?.truncated ? (
            <Banner
              tone="info"
              title="Lista resumida"
              description="Há lançamentos demais nesta semana para mostrar todos. Consulte o sistema web para a lista completa."
            />
          ) : null}

          {weekQuery.error ? (
            <Banner
              tone="danger"
              title="Não foi possível carregar suas atividades"
              description={getErrorMessage(weekQuery.error, 'Tente novamente em instantes.')}
            />
          ) : null}

          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle}>{dayTitle(selectedKey, todayKey)}</Text>
            {totals.entries > 0 ? (
              <Text style={styles.dayTotals}>
                {plural(totals.scaffolds, 'andaime', 'andaimes')} ·{' '}
                {plural(totals.entries, 'lançamento', 'lançamentos')}
                {totals.manHours > 0 ? ` · ${formatNumber(totals.manHours)} HH` : ''}
              </Text>
            ) : null}
          </View>

          {weekQuery.isLoading ? (
            <Text style={styles.loading}>Carregando…</Text>
          ) : scaffolds.length === 0 ? (
            <EmptyState
              title={selectedKey === todayKey ? 'Nada lançado hoje ainda' : 'Nenhuma atividade neste dia'}
              description="As execuções que você lançar aparecem aqui, inclusive as que ainda estão no aparelho aguardando envio."
            />
          ) : (
            <View style={styles.list}>
              {scaffolds.map((scaffold) => (
                <View key={scaffold.scaffoldId} style={styles.scaffoldCard}>
                  <View style={styles.scaffoldHeader}>
                    <Ionicons name="construct-outline" size={16} color={colors.primaryStrong} />
                    <View style={styles.scaffoldTitleBlock}>
                      <Text style={styles.scaffoldCode}>{scaffold.scaffoldCode}</Text>
                      {scaffold.scaffoldPlace ? (
                        <Text style={styles.scaffoldPlace} numberOfLines={2}>
                          {scaffold.scaffoldPlace}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {scaffold.activities.map((activity) => (
                    <ActivityRow key={activity.id} activity={activity} />
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <MonthPickerModal
        visible={pickerVisible}
        monthKey={pickerMonth}
        selectedKey={selectedKey}
        todayKey={todayKey}
        counts={monthCounts}
        loading={monthQuery.isLoading}
        onChangeMonth={(months) => setPickerMonth((current) => shiftMonth(current, months))}
        onSelect={(key) => {
          setSelectedKey(key)
          setPickerVisible(false)
        }}
        onClose={() => setPickerVisible(false)}
      />
    </SafeAreaView>
  )
}

function ActivityRow({ activity }: { activity: MyDayActivity }) {
  const status = activityStatus(activity)
  const onDevice = Boolean(activity.syncStatus)
  const content = (
    <>
      <View style={styles.activityMain}>
        <Text style={styles.activityTitle}>
          {operationLabel(activity.operationType)} · {advanceLabel(activity)}
        </Text>
        <Text style={styles.activityMeta}>
          {timeRangeLabel(activity)}
          {activity.workOrderCode ? ` · OS ${activity.workOrderCode}` : ''}
        </Text>
      </View>
      <StatusBadge label={status.label} tone={status.tone} />
    </>
  )

  // Entries still on the phone are handled in Pendências.
  return onDevice ? (
    <Pressable
      onPress={() => router.push('/(app)/(tabs)/sync' as never)}
      style={({ pressed }) => [styles.activityRow, pressed ? styles.pressed : null]}
      accessibilityHint="Abre as pendências de envio"
    >
      {content}
    </Pressable>
  ) : (
    <View style={styles.activityRow}>{content}</View>
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
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.35,
  },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  arrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  monthLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  weekStrip: {
    flexDirection: 'row',
    gap: 6,
  },
  dayCard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dayCardToday: {
    borderColor: colors.primary,
  },
  dayCardSelected: {
    borderColor: colors.brandInk,
    backgroundColor: colors.brandInk,
  },
  dayWeekday: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  dayNumber: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  dayTextSelected: {
    color: colors.white,
  },
  dayCount: {
    minWidth: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: 'center',
  },
  dayCountOn: {
    backgroundColor: colors.primarySoft,
  },
  dayCountSelected: {
    backgroundColor: colors.white,
  },
  dayCountLabel: {
    color: colors.borderStrong,
    fontSize: 11,
    fontWeight: '700',
  },
  dayCountLabelOn: {
    color: colors.primary,
  },
  dayCountLabelSelected: {
    color: colors.brandInk,
  },
  todayLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  todayLinkLabel: {
    color: colors.primaryStrong,
    fontSize: 13,
    fontWeight: '700',
  },
  dayHeader: {
    gap: 2,
  },
  dayTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  dayTotals: {
    color: colors.textMuted,
    fontSize: 12,
  },
  loading: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  list: {
    gap: spacing.md,
  },
  scaffoldCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  scaffoldHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  scaffoldTitleBlock: {
    flex: 1,
    gap: 2,
  },
  scaffoldCode: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  scaffoldPlace: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  activityMain: {
    flex: 1,
    gap: 2,
  },
  activityTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  activityMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
})
