import { DEFAULT_REQUEST_TIMEOUT } from '@/constants/app'
import { validateApiUrl, validateRequestTimeout } from '@/utils/api-config'

const DEFAULT_API_URL = 'https://api-scaffolding.kaeferbrasil.com.br'

export const env = {
  apiUrl: validateApiUrl(process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL, __DEV__),
  requestTimeoutMs: validateRequestTimeout(
    process.env.EXPO_PUBLIC_REQUEST_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT,
  ),
}
