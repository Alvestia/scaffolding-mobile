import { sanitizeIncomingPath } from '@/utils/incoming-path'

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return sanitizeIncomingPath(path)
}
