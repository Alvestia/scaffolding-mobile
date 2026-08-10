import { Ionicons } from '@expo/vector-icons'
import { View, StyleSheet } from 'react-native'
import { useConnectivityStore } from '@/store/connectivity-store'
import { colors } from '@/constants/theme'

export function NetworkStatusIndicator() {
  const isConnected = useConnectivityStore((state) => state.isConnected)

  return (
    <View style={styles.container}>
      <Ionicons
        name={isConnected ? 'wifi' : 'wifi-outline'}
        size={16}
        color={isConnected ? colors.success : colors.danger}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
