import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing } from '@/constants/theme'

type SelectFieldProps = {
  label: string
  value?: string | null
  placeholder: string
  helper?: string
  error?: string
  onPress?: () => void
  disabled?: boolean
}

export function SelectField({
  label,
  value,
  placeholder,
  helper,
  error,
  onPress,
  disabled,
}: SelectFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.field,
          error ? styles.fieldError : null,
          disabled ? styles.disabled : null,
          pressed && !disabled ? styles.pressed : null,
        ]}
      >
        <View style={styles.textWrap}>
          <Text
            style={[
              styles.value,
              !value ? styles.placeholder : null,
            ]}
            numberOfLines={2}
          >
            {value || placeholder}
          </Text>
          {helper ? (
            <Text style={styles.helper} numberOfLines={1}>
              {helper}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
  },
  field: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  fieldError: {
    borderColor: colors.danger,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  value: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  placeholder: {
    color: '#8AA0A8',
    fontWeight: '500',
  },
  helper: {
    color: colors.textMuted,
    fontSize: 12,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    transform: [{ scale: 0.995 }],
  },
})
