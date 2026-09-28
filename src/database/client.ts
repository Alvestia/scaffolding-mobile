import { Platform } from 'react-native'

type SQLiteModule = typeof import('expo-sqlite')
type SQLiteDatabase = Awaited<ReturnType<SQLiteModule['openDatabaseAsync']>>

let databasePromise: Promise<SQLiteDatabase> | null = null
let databaseQueue: Promise<unknown> = Promise.resolve()

export async function getDatabase() {
  if (Platform.OS === 'web') {
    throw new Error('SQLite nativo nao deve ser usado no navegador.')
  }

  if (!databasePromise) {
    databasePromise = import('expo-sqlite')
      .then((SQLite) => SQLite.openDatabaseAsync('scaffolding-mobile.db'))
      .then(async (db) => {
        try {
          await db.execAsync(`
          PRAGMA journal_mode = WAL;
          PRAGMA synchronous = NORMAL;
          PRAGMA busy_timeout = 5000;
        `)

          return db
        } catch (error) {
          await db.closeAsync().catch(() => undefined)
          throw error
        }
      })
      .catch((error) => {
        databasePromise = null
        throw error
      })
  }

  return databasePromise
}

export async function withNativeDatabaseLock<T>(operation: (db: SQLiteDatabase) => Promise<T>) {
  if (Platform.OS === 'web') {
    throw new Error('SQLite nativo nao deve ser usado no navegador.')
  }

  const run = async () => {
    const db = await getDatabase()
    return operation(db)
  }

  const next = databaseQueue.then(run, run)
  databaseQueue = next.catch(() => undefined)

  return next
}
