import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AppProviders } from '@/providers/app-providers'
import { BootstrapGate } from '@/providers/bootstrap-gate'

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProviders>
          <BootstrapGate>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }} />
          </BootstrapGate>
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
