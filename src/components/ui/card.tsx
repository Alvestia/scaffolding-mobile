import type { PropsWithChildren, ReactNode } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing } from '@/constants/theme'

type CardProps = PropsWithChildren<{
  title?: string
  subtitle?: string
  footer?: ReactNode
}>

export function Card({ title, subtitle, footer, children }: CardProps) {
  return (
    <View style={styles.card}>
      {title || subtitle ? (
        <View style={styles.header}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      ) : null}
      {children}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...Platform.select({
      web: {
        boxShadow: '0px 6px 14px rgba(23, 56, 66, 0.05)',
      },
      default: {
        shadowColor: '#173842',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1,
      },
    }),
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    marginTop: spacing.md,
  },
})
