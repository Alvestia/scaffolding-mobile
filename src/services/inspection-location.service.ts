import * as Location from 'expo-location'
import type { InspectionGps } from '@/types/inspection'

const FIX_TIMEOUT_MS = 20_000
const LAST_KNOWN_MAX_AGE_MS = 5 * 60_000

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return new Promise<T | null>((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * Location for an inspection whose rule requires GPS. Asked only at that
 * moment, in the foreground, and never tracked in the background.
 */
export async function captureInspectionLocation(): Promise<InspectionGps> {
  const permission = await Location.requestForegroundPermissionsAsync()
  if (!permission.granted) {
    throw new Error(
      'A regra desta inspeção exige a localização. Libere o acesso à localização do Scaffold Mobile nas configurações do aparelho.',
    )
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new Error('Ligue a localização (GPS) do aparelho para concluir esta inspeção.')
  }

  const position =
    (await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      FIX_TIMEOUT_MS,
    )) ?? (await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS }))

  if (!position) {
    throw new Error(
      'Não foi possível obter a localização agora. Vá para uma área aberta e tente de novo.',
    )
  }
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyM:
      position.coords.accuracy !== null && position.coords.accuracy !== undefined
        ? Math.round(position.coords.accuracy * 10) / 10
        : null,
  }
}
