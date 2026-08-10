import { StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing } from '@/constants/theme'

type StatusBadgeProps = {
  label: string
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
}

export function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  const palette = palettes[tone]

  return (
    <View style={[styles.badge, { backgroundColor: palette.background, borderColor: palette.border }]}>
      <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
  },
})

const palettes = {
  neutral: {
    background: colors.badgeBackground,
    border: colors.border,
    text: colors.textMuted,
  },
  info: {
    background: '#EEF7FB',
    border: '#C7DEEA',
    text: colors.info,
  },
  success: {
    background: '#EEF8F4',
    border: '#CAE3D9',
    text: colors.success,
  },
  warning: {
    background: '#FFF8EF',
    border: '#E8D2B1',
    text: colors.warning,
  },
  danger: {
    background: '#FFF3F1',
    border: '#E8C8C1',
    text: colors.danger,
  },
}
