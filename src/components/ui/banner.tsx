import type { ReactNode } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing } from '@/constants/theme'

type BannerProps = {
  tone?: 'info' | 'warning' | 'success' | 'danger'
  title: string
  description?: string
  action?: ReactNode
}

export function Banner({
  tone = 'info',
  title,
  description,
  action,
}: BannerProps) {
  const palette = tonePalette[tone]

  return (
    <View style={[styles.container, { backgroundColor: palette.background, borderColor: palette.border }]}>
      <View style={styles.row}>
        <View style={[styles.iconShell, { backgroundColor: palette.iconBackground }]}>
          <Ionicons name={palette.icon} size={16} color={palette.text} />
        </View>
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
          {description ? <Text style={[styles.description, { color: palette.text }]}>{description}</Text> : null}
        </View>
      </View>
      {action}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  iconShell: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
  },
  description: {
    fontSize: 12,
    lineHeight: 17,
  },
})

const tonePalette = {
  info: {
    background: '#EEF7FB',
    border: '#C7DEEA',
    text: colors.info,
    icon: 'information-circle-outline' as const,
    iconBackground: '#DDEFF8',
  },
  warning: {
    background: '#FFF8EF',
    border: '#E8D2B1',
    text: colors.offline,
    icon: 'warning-outline' as const,
    iconBackground: '#FFECC8',
  },
  success: {
    background: '#EEF8F4',
    border: '#CAE3D9',
    text: colors.success,
    icon: 'checkmark-circle-outline' as const,
    iconBackground: '#DDEFE7',
  },
  danger: {
    background: '#FFF3F1',
    border: '#E8C8C1',
    text: colors.danger,
    icon: 'alert-circle-outline' as const,
    iconBackground: '#F9E1DD',
  },
}
