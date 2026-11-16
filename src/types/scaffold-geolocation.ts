export type ScaffoldGeolocation = {
  latitude: number
  longitude: number
  method: 'GPS'
  accuracyMeters?: number
  capturedAt: string
}

export type ScaffoldLocationFields = {
  latitude?: number | string | null
  longitude?: number | string | null
  locationAccuracyMeters?: number | null
  locationCapturedAt?: string | null
  locationVersion?: number
}
