import { isAxiosError, isCancel } from 'axios'

// An unavailable server may use the offline base; a denied/deleted resource must
// not be resurrected from that base. Cancellation and identity changes propagate.
export function canUseOfflineFallback(error: unknown) {
  if (!isAxiosError(error) || isCancel(error)) return false
  const status = error.response?.status
  return status == null || status === 408 || status === 429 || status >= 500
}
