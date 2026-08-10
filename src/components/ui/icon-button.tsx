import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, View } from 'react-native'
import { colors, radius } from '@/constants/theme'

type IconButtonProps = {
  icon: keyof typeof Ionicons.glyphMap
  onPress?: () => void
  tone?: 'default' | 'primary' | 'danger'
  disabled?: boolean
}

export function IconButton({
  icon,
  onPress,
  tone = 'default',
  disabled,
}: IconButtonProps) {
  const palette = toneStyles[tone]

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        palette.button,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={18} color={palette.icon.color} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.55,
  },
})

const toneStyles = {
  default: StyleSheet.create({
    button: {
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    icon: {
      color: colors.text,
    },
  }),
  primary: StyleSheet.create({
    button: {
      borderColor: '#2A6E88',
      backgroundColor: colors.primarySoft,
    },
    icon: {
      color: colors.primaryStrong,
    },
  }),
  danger: StyleSheet.create({
    button: {
      borderColor: '#DAB8B1',
      backgroundColor: '#FFF3F1',
    },
    icon: {
      color: colors.danger,
    },
  }),
}
