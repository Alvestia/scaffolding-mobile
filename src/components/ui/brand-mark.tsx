import { Image, StyleSheet, Text, View } from 'react-native'
import { kaeferSymbol } from '@/constants/brand-assets'
import { colors, radius, spacing } from '@/constants/theme'

type BrandMarkProps = {
  compact?: boolean
  subtitle?: string
}

export function BrandMark({ compact = false, subtitle = 'Operacao de campo' }: BrandMarkProps) {
  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <View style={[styles.logoShell, compact && styles.logoShellCompact]}>
        <Image
          source={kaeferSymbol}
          style={[styles.logo, compact && styles.logoCompact]}
          resizeMode="contain"
        />
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.eyebrow}>KAEFER</Text>
        <Text style={[styles.title, compact && styles.titleCompact]}>Scaffold</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  containerCompact: {
    gap: spacing.sm,
  },
  logoShell: {
    width: 54,
    height: 54,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoShellCompact: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
  },
  logo: {
    width: 34,
    height: 34,
  },
  logoCompact: {
    width: 24,
    height: 24,
  },
  textBlock: {
    gap: 2,
  },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0,
  },
  titleCompact: {
    fontSize: 16,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
})
