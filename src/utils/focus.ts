import { Keyboard, Platform } from 'react-native'

export function blurActiveElement() {
  if (Platform.OS !== 'web') {
    Keyboard.dismiss()
    return
  }

  if (typeof document === 'undefined') {
    return
  }

  const activeElement = document.activeElement

  if (activeElement instanceof HTMLElement) {
    activeElement.blur()
  }
}
