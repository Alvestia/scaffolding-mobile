import { useEffect, useState } from 'react'
import { initializeDatabase } from '@/database/migrations'
import { useAuthStore } from '@/store/auth-store'
import { getStartupDiagnostic, runStartupStep } from '@/services/startup-diagnostics'

export function useAppBootstrap() {
  const hydrate = useAuthStore((state) => state.hydrate)
  const clearSession = useAuthStore((state) => state.clearSession)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const [isDatabaseReady, setIsDatabaseReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canResetSession, setCanResetSession] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setCanResetSession(false)
    setIsDatabaseReady(false)

    async function bootstrap() {
      let databaseOpened = false
      try {
        await runStartupStep('sqlite_schema', initializeDatabase)
        databaseOpened = true
        if (cancelled) return
        await runStartupStep('session', hydrate)
        if (cancelled) return
        setIsDatabaseReady(true)
      } catch (cause) {
        if (!cancelled) {
          const diagnostic = getStartupDiagnostic(
            cause,
            databaseOpened ? 'session' : 'sqlite_schema',
          )
          console.error('[bootstrap]', JSON.stringify(diagnostic))
          // Com o banco aberto, a falha veio da sessão salva: descartá-la libera o login.
          setCanResetSession(databaseOpened)
          setError(
            'Não foi possível abrir os dados deste aparelho. Tente novamente. Seus registros locais serão preservados.' +
              `\nReferência para suporte: ${diagnostic.reference}`,
          )
        }
      }
    }
    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [hydrate, attempt])

  return {
    isReady: !error && isHydrated && isDatabaseReady,
    error,
    canResetSession,
    retry: () => setAttempt((value) => value + 1),
    resetSession: async () => {
      // Remove só a sessão salva; apontamentos, fotos e pendências continuam no banco local.
      await clearSession().catch(() => undefined)
      setAttempt((value) => value + 1)
    },
  }
}
