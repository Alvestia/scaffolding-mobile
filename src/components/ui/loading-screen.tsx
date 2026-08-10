import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { BrandMark } from '@/components/ui/brand-mark'
import { colors, radius, spacing } from '@/constants/theme'

type LoadingScreenProps = {
  label?: string
}

export function LoadingScreen({ label = 'Carregando ambiente...' }: LoadingScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <BrandMark subtitle="Preparando o ambiente de campo" />
        <View style={styles.loaderRow}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.label}>{label}</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    backgroundColor: colors.background,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  loaderRow: {
    gap: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
  },
})
