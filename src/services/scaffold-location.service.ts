import * as Location from 'expo-location'
import type { ScaffoldGeolocation } from '@/types/scaffold-geolocation'

/** One foreground GPS fix, independent of connectivity and of any map provider. */
export async function captureScaffoldLocation(): Promise<ScaffoldGeolocation> {
  const permission = await Location.requestForegroundPermissionsAsync()
  if (!permission.granted)
    throw new Error(
      'Permita o acesso à localização nas configurações do aparelho ou continue sem GPS.',
    )
  if (!(await Location.hasServicesEnabledAsync()))
    throw new Error('Ligue o GPS do aparelho para capturar a posição.')

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    // Do not silently substitute an old position: the operator may have moved.
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                'O GPS não respondeu. Vá para uma área aberta e tente novamente ou continue sem GPS.',
              ),
            ),
          20_000,
        )
      }),
    ])
    const { latitude, longitude, accuracy } = position.coords
    if (
      !Number.isFinite(latitude) ||
      Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude) ||
      Math.abs(longitude) > 180 ||
      !Number.isFinite(position.timestamp)
    ) {
      throw new Error('O aparelho retornou uma posição inválida. Tente novamente.')
    }
    return {
      latitude,
      longitude,
      method: 'GPS',
      capturedAt: new Date(position.timestamp).toISOString(),
      accuracyMeters:
        accuracy != null && Number.isFinite(accuracy) && accuracy >= 0
          ? Math.round(accuracy * 10) / 10
          : undefined,
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
