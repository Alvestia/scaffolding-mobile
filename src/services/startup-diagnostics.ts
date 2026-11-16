export type StartupStage =
  | 'sqlite_module'
  | 'sqlite_open'
  | 'sqlite_configure'
  | 'sqlite_schema'
  | 'session'

class StartupStepError extends Error {
  constructor(
    readonly stage: StartupStage,
    readonly cause: unknown,
  ) {
    super(`Startup failed at ${stage}`)
    this.name = 'StartupStepError'
  }
}

// Keep the original error for classification, but never display/log its message or stack:
// SQLite errors can contain SQL, local paths and offline records.
export async function runStartupStep<T>(stage: StartupStage, operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof StartupStepError) throw error
    throw new StartupStepError(stage, error)
  }
}

export function getStartupDiagnostic(error: unknown, fallbackStage: StartupStage) {
  const stage = error instanceof StartupStepError ? error.stage : fallbackStage
  const messages: string[] = []
  const seen = new Set<unknown>()
  let current = error
  // Native errors may be nested. Limit traversal and output to fixed identifiers.
  for (let depth = 0; current && depth < 5 && !seen.has(current); depth++) {
    seen.add(current)
    if (typeof current === 'string') {
      messages.push(current)
      break
    }
    if (typeof current !== 'object') break
    const entry = current as { message?: unknown; code?: unknown; cause?: unknown }
    if (typeof entry.message === 'string') messages.push(entry.message)
    if (typeof entry.code === 'string') messages.push(entry.code)
    current = entry.cause
  }
  const detail = messages.join('\n')
  const reasons = [
    [
      'native_module',
      /cannot find native module|native module .*not found|cannot find module.*expo-sqlite/i,
    ],
    [
      'native_linkage',
      /NoSuchMethod|ClassNotFound|NoClassDefFound|UnsatisfiedLink|ExceptionInInitializer|kotlin\.reflect|JNI/i,
    ],
    ['native_handle', /NullPointerException|shared object.*released|cast.*SharedObject/i],
    ['storage_full', /SQLITE_FULL|disk.*full|ENOSPC/i],
    ['database_busy', /SQLITE_BUSY|SQLITE_LOCKED|database (?:is )?locked/i],
    [
      'database_corrupt',
      /SQLITE_CORRUPT|SQLITE_NOTADB|database disk image is malformed|file is not a database/i,
    ],
    [
      'database_io',
      /SQLITE_CANTOPEN|SQLITE_IOERR|SQLITE_READONLY|unable to open database|read.only database|disk I\/O error/i,
    ],
    [
      'sqlite_error',
      /SQLITE_ERROR|ERR_INTERNAL_SQLITE_ERROR|no such (?:table|column)|syntax error|duplicate column/i,
    ],
    ['secure_storage', /SecureStore|keystore|keychain/i],
  ] as const
  const reason = reasons.find(([, pattern]) => pattern.test(detail))?.[0] ?? 'unknown'
  return {
    event: 'app_bootstrap_failed' as const,
    stage,
    reason,
    reference: `START-${stage.toUpperCase()}-${reason.toUpperCase()}`,
  }
}
