import { create } from 'zustand'

type ConnectivityState = {
  isConnected: boolean
  apiReachable: boolean
  setConnected: (value: boolean) => void
  setApiReachable: (value: boolean) => void
}

export const useConnectivityStore = create<ConnectivityState>((set) => ({
  isConnected: true,
  apiReachable: true,
  setConnected: (value) => set({ isConnected: value }),
  setApiReachable: (value) => set({ apiReachable: value }),
}))
