import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import { createLocalId } from '@/utils/id'

const DEVICE_ID_KEY = 'scaffold_mobile_device_id_v1'

export type DeviceSessionMetadata = {
  deviceId: string
  deviceName: string
  clientVersion: string
}

async function getOrCreateDeviceId() {
  const stored = await AsyncStorage.getItem(DEVICE_ID_KEY)
  if (stored) {
    return stored
  }

  const deviceId = createLocalId('device')
  await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId)
  return deviceId
}

function getDeviceName() {
  const model = Device.modelName?.trim()
  const brand = Device.brand?.trim()
  const description = [brand, model].filter(Boolean).join(' ')

  if (description) {
    return description.slice(0, 120)
  }

  return Platform.OS === 'ios' ? 'Dispositivo Apple' : 'Dispositivo Android'
}

export async function getDeviceSessionMetadata(): Promise<DeviceSessionMetadata> {
  return {
    deviceId: await getOrCreateDeviceId(),
    deviceName: getDeviceName(),
    clientVersion: (
      Constants.expoConfig?.version ??
      Constants.manifest2?.extra?.expoClient?.version ??
      'desconhecida'
    ).slice(0, 40),
  }
}
