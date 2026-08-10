import { Pressable, StyleSheet, Text } from 'react-native'
import { colors, radius, spacing } from '@/constants/theme'

type ChipProps = {
  label: string
  selected?: boolean
  onPress?: () => void
}

export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.base, selected ? styles.selected : styles.unselected]}
    >
      <Text style={[styles.label, selected ? styles.labelSelected : styles.labelUnselected]}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    minHeight: 34,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  selected: {
    backgroundColor: '#EAF5F8',
    borderColor: '#BFD8E1',
  },
  unselected: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  labelSelected: {
    color: colors.primary,
  },
  labelUnselected: {
    color: colors.text,
  },
})
