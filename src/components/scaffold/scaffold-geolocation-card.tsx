import { StyleSheet, Text, View } from 'react-native'
import { Button } from '@/components/ui/button'
import { colors, radius, spacing } from '@/constants/theme'
import type { useScaffoldGeolocation } from '@/hooks/use-scaffold-geolocation'

export function ScaffoldGeolocationCard({
  location,
  disabled = false,
}: {
  location: ReturnType<typeof useScaffoldGeolocation>
  disabled?: boolean
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Localização do andaime</Text>
      {location.hasLocation ? (
        <Text style={styles.description}>
          Este andaime já tem uma posição registrada. Ela será preservada.
        </Text>
      ) : (
        <>
          <Text style={styles.description}>
            Capture o GPS junto ao andaime para salvar. A posição será enviada com o registro, mesmo
            quando a captura for feita offline.
          </Text>
          {location.value && (
            <Text style={styles.description}>
              {location.value.latitude.toFixed(6)}, {location.value.longitude.toFixed(6)}
              {location.value.accuracyMeters != null
                ? ` · Precisão estimada: ${location.value.accuracyMeters} m`
                : ''}
            </Text>
          )}
          {location.error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {location.error}
            </Text>
          )}
          <Button
            disabled={disabled || location.busy}
            loading={location.busy}
            onPress={() => void location.capture()}
          >
            {location.value ? 'Capturar novamente' : 'Capturar GPS'}
          </Button>
          {location.busy ? (
            <Text accessibilityRole="alert" style={styles.description}>
              Obtendo GPS…
            </Text>
          ) : null}
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontWeight: '600', fontSize: 14, color: colors.text },
  description: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  error: { color: colors.danger, fontSize: 13 },
})
