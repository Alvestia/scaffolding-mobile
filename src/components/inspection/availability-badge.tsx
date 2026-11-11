import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing } from '@/constants/theme'
import type { ScaffoldAvailabilityView } from '@/types/inspection'
import { AVAILABILITY_LABELS, AVAILABILITY_TONES } from '@/utils/inspection-rules'

const PALETTE = {
  success: { background: '#ECFDF5', border: '#A7F3D0', text: colors.success, icon: 'shield-checkmark' },
  warning: { background: '#FFFBEB', border: '#FDE68A', text: colors.warning, icon: 'time' },
  danger: { background: '#FEF2F2', border: '#FECACA', text: colors.danger, icon: 'ban' },
  neutral: { background: colors.surfaceMuted, border: colors.border, text: colors.textMuted, icon: 'remove-circle' },
} as const

type AvailabilityBadgeProps = {
  availability: Pick<ScaffoldAvailabilityView, 'status' | 'overdue'>
  /** Shows "interdição pendente de envio" over the server status. */
  localInterdiction?: boolean
  compact?: boolean
}

export function AvailabilityBadge({ availability, localInterdiction, compact }: AvailabilityBadgeProps) {
  const status = localInterdiction ? 'INTERDICTED' : availability.status
  const palette = PALETTE[AVAILABILITY_TONES[status]]
  const label = localInterdiction
    ? 'Interditado (no aparelho)'
    : `${AVAILABILITY_LABELS[status]}${availability.overdue && status !== 'INTERDICTED' ? ' · vencida' : ''}`

  return (
    <View
      style={[
        styles.badge,
        compact ? styles.compact : null,
        { backgroundColor: palette.background, borderColor: palette.border },
      ]}
    >
      <Ionicons name={palette.icon} size={compact ? 11 : 13} color={palette.text} />
      <Text style={[styles.label, compact ? styles.labelCompact : null, { color: palette.text }]}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  compact: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
  },
  labelCompact: {
    fontSize: 10,
  },
})
