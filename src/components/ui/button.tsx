import type { PropsWithChildren } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'
import { colors, radius, spacing } from '@/constants/theme'

type ButtonProps = PropsWithChildren<{
  onPress?: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'primary' | 'secondary' | 'danger'
}>

export function Button({ children, onPress, disabled, loading, variant = 'primary' }: ButtonProps) {
  const tone = stylesByVariant[variant]

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        tone.button,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading ? styles.pressed : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone.text.color} />
      ) : (
        <Text style={[styles.text, tone.text]}>{children}</Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  text: {
    fontSize: 14,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
})

const stylesByVariant = {
  primary: StyleSheet.create({
    button: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    text: {
      color: '#FFFFFF',
    },
  }),
  secondary: StyleSheet.create({
    button: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    text: {
      color: colors.text,
    },
  }),
  danger: StyleSheet.create({
    button: {
      backgroundColor: colors.danger,
      borderColor: '#8A3A2D',
    },
    text: {
      color: '#FFFFFF',
    },
  }),
}
