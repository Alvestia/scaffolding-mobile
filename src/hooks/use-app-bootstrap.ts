import { useEffect, useState } from 'react'
import { initializeDatabase } from '@/database/migrations'
import { useAuthStore } from '@/store/auth-store'

export function useAppBootstrap() {
  const hydrate = useAuthStore((state) => state.hydrate)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const [isDatabaseReady, setIsDatabaseReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setIsDatabaseReady(false)

    async function bootstrap() {
      try {
        await initializeDatabase()
        if (cancelled) return
        await hydrate()
        if (cancelled) return
        setIsDatabaseReady(true)
      } catch {
        if (!cancelled) {
          setError(
            'Não foi possível abrir os dados deste aparelho. Tente novamente. Seus registros locais serão preservados.',
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
    retry: () => setAttempt((value) => value + 1),
  }
}
