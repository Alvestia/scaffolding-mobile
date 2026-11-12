import { Ionicons } from '@expo/vector-icons'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing } from '@/constants/theme'
import { WEEKDAY_LABELS, monthGrid, monthTitle, parseDateKey } from '@/utils/my-day'

type MonthPickerModalProps = {
  visible: boolean
  /** Any day of the month on screen. */
  monthKey: string
  selectedKey: string
  todayKey: string
  /** Entries per day of the month on screen, to mark the days with work. */
  counts: Map<string, number>
  loading: boolean
  onChangeMonth: (months: number) => void
  onSelect: (key: string) => void
  onClose: () => void
}

/** Month calendar to jump to any past day; the days with entries are marked. */
export function MonthPickerModal({
  visible,
  monthKey,
  selectedKey,
  todayKey,
  counts,
  loading,
  onChangeMonth,
  onSelect,
  onClose,
}: MonthPickerModalProps) {
  const canGoForward = monthKey.slice(0, 7) < todayKey.slice(0, 7)

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Pressable
              onPress={() => onChangeMonth(-1)}
              style={styles.arrow}
              hitSlop={8}
              accessibilityLabel="Mês anterior"
            >
              <Ionicons name="chevron-back" size={20} color={colors.primaryStrong} />
            </Pressable>
            <Text style={styles.title}>{monthTitle(monthKey)}</Text>
            <Pressable
              onPress={() => onChangeMonth(1)}
              disabled={!canGoForward}
              style={[styles.arrow, !canGoForward ? styles.disabled : null]}
              hitSlop={8}
              accessibilityLabel="Próximo mês"
            >
              <Ionicons name="chevron-forward" size={20} color={colors.primaryStrong} />
            </Pressable>
          </View>

          <View style={styles.row}>
            {WEEKDAY_LABELS.map((label) => (
              <Text key={label} style={styles.weekday}>
                {label}
              </Text>
            ))}
          </View>

          {monthGrid(monthKey).map((week, index) => (
            <View key={index} style={styles.row}>
              {week.map((key, column) => {
                if (!key) return <View key={`empty-${column}`} style={styles.cell} />
                const future = key > todayKey
                const selected = key === selectedKey
                const worked = (counts.get(key) ?? 0) > 0
                return (
                  <Pressable
                    key={key}
                    disabled={future}
                    onPress={() => onSelect(key)}
                    style={[
                      styles.cell,
                      styles.day,
                      key === todayKey ? styles.today : null,
                      selected ? styles.selected : null,
                      future ? styles.disabled : null,
                    ]}
                  >
                    <Text style={[styles.dayLabel, selected ? styles.selectedLabel : null]}>
                      {parseDateKey(key).getDate()}
                    </Text>
                    <View
                      style={[
                        styles.dot,
                        worked ? (selected ? styles.dotSelected : styles.dotOn) : null,
                      ]}
                    />
                  </Pressable>
                )
              })}
            </View>
          ))}

          <Text style={styles.hint}>
            {loading ? 'Carregando o mês…' : 'Os dias marcados têm lançamentos seus.'}
          </Text>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
  },
  sheet: {
    borderRadius: radius.xxl,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  arrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    gap: 4,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
  },
  day: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    gap: 2,
  },
  today: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  selected: {
    backgroundColor: colors.brandInk,
  },
  disabled: {
    opacity: 0.35,
  },
  dayLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  selectedLabel: {
    color: colors.white,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dotOn: {
    backgroundColor: colors.primary,
  },
  dotSelected: {
    backgroundColor: colors.white,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
})
