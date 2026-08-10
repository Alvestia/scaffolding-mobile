import { useEffect, useState } from 'react'
import { initializeDatabase } from '@/database/migrations'
import { useAuthStore } from '@/store/auth-store'

export function useAppBootstrap() {
  const hydrate = useAuthStore((state) => state.hydrate)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const [isDatabaseReady, setIsDatabaseReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      await initializeDatabase()
      if (!cancelled) {
        setIsDatabaseReady(true)
      }

      await hydrate()
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [hydrate])

  return {
    isReady: isHydrated && isDatabaseReady,
  }
}
