import { DEFAULT_REQUEST_TIMEOUT } from '@/constants/app'

const DEFAULT_API_URL = 'https://api-scaffolding.ripbr.com.br'

export const env = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL,
  requestTimeoutMs: Number(process.env.EXPO_PUBLIC_REQUEST_TIMEOUT_MS ?? DEFAULT_REQUEST_TIMEOUT),
}
