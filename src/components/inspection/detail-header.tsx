import { Ionicons } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, spacing } from '@/constants/theme'

type DetailHeaderProps = {
  title: string
  subtitle?: string
  action?: ReactNode
}

/** Back button and title, as in the queue detail screens. */
export function DetailHeader({ title, subtitle, action }: DetailHeaderProps) {
  const router = useRouter()
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={8}
        style={({ pressed }) => [styles.icon, pressed ? styles.pressed : null]}
      >
        <Ionicons name="chevron-back" size={18} color={colors.primaryStrong} />
      </Pressable>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.84,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
})
