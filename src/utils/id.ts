import 'react-native-get-random-values'
import { v4 as uuidv4 } from 'uuid'

export function createLocalId(prefix: string) {
  return `${prefix}_${uuidv4()}`
}

// IDs gerados pelo servidor seguem o formato UUID padrão.
// IDs locais (offline) usam o padrão prefix_uuid (ex: "svc_abc123", "emergency_abc123").
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isLocalId(id: string): boolean {
  return !UUID_PATTERN.test(id)
}
