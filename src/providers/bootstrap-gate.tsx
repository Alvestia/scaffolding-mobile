import type { PropsWithChildren } from 'react'
import { LoadingScreen } from '@/components/ui/loading-screen'
import { useAppBootstrap } from '@/hooks/use-app-bootstrap'
import { View } from 'react-native'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { colors, spacing } from '@/constants/theme'

export function BootstrapGate({ children }: PropsWithChildren) {
  const { isReady, error, retry } = useAppBootstrap()

  if (error) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: spacing.xl,
          gap: spacing.md,
          backgroundColor: colors.background,
        }}
      >
        <Banner tone="danger" title="Não foi possível iniciar" description={error} />
        <Button onPress={retry}>Tentar novamente</Button>
      </View>
    )
  }

  if (!isReady) {
    return <LoadingScreen />
  }

  return children
}
