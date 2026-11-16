import { Pressable, StyleSheet, Text, View } from 'react-native'
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
        <Text>Este andaime já tem uma posição registrada. Ela será preservada.</Text>
      ) : (
        <>
          <Text>
            GPS opcional. Capture a posição junto ao andaime. Ela será enviada com este registro,
            mesmo se você estiver offline.
          </Text>
          {location.value && (
            <Text>
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
          <Pressable
            accessibilityRole="button"
            disabled={disabled || location.busy}
            onPress={() => void location.capture()}
            style={styles.button}
          >
            <Text style={styles.buttonLabel}>
              {location.busy
                ? 'Obtendo GPS…'
                : location.value
                  ? 'Capturar novamente'
                  : 'Capturar GPS'}
            </Text>
          </Pressable>
          {(location.value || location.busy || location.error) && (
            <Pressable accessibilityRole="button" disabled={disabled} onPress={location.reset}>
              <Text style={styles.link}>Continuar sem GPS</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  title: { fontWeight: '700', fontSize: 16, color: '#0f172a' },
  button: { padding: 12, borderRadius: 8, backgroundColor: '#1d4ed8', alignItems: 'center' },
  buttonLabel: { color: 'white', fontWeight: '600' },
  link: { color: '#1d4ed8', paddingVertical: 6 },
  error: { color: '#b91c1c' },
})
