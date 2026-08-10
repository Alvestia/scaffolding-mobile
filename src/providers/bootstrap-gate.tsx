import type { PropsWithChildren } from 'react'
import { LoadingScreen } from '@/components/ui/loading-screen'
import { useAppBootstrap } from '@/hooks/use-app-bootstrap'

export function BootstrapGate({ children }: PropsWithChildren) {
  const { isReady } = useAppBootstrap()

  if (!isReady) {
    return <LoadingScreen />
  }

  return children
}
