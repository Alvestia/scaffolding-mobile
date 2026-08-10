import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing } from '@/constants/theme'

type SelectableCardProps = {
  title: string
  subtitle?: string
  caption?: string
  selected?: boolean
  onPress?: () => void
}

export function SelectableCard({
  title,
  subtitle,
  caption,
  selected,
  onPress,
}: SelectableCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        selected ? styles.selected : styles.unselected,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={[styles.iconShell, selected ? styles.iconShellSelected : null]}>
          <Ionicons
            name={selected ? 'checkmark' : 'ellipse-outline'}
            size={16}
            color={selected ? colors.white : colors.textMuted}
          />
        </View>
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      {selected ? (
        <View style={styles.selectedBadge}>
          <Text style={styles.selectedText}>Selecionado</Text>
        </View>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  unselected: {
    borderColor: colors.border,
  },
  selected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  pressed: {
    opacity: 0.93,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  subtitle: {
    color: colors.text,
    fontSize: 14,
  },
  caption: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  iconShell: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconShellSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  selectedBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.brandWarmSoft,
    borderWidth: 1,
    borderColor: '#ECD5A2',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  selectedText: {
    color: colors.offline,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
})
