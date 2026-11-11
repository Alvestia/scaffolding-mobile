import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react'
import {
  Dimensions,
  Keyboard,
  Platform,
  StyleSheet,
  View,
  type KeyboardEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

type KeyboardFrame = Pick<KeyboardEvent['endCoordinates'], 'screenY' | 'height'>

/**
 * Top edge of the keyboard on the screen. The event position is the normal
 * source; the height is a second reading in case the position comes back as
 * the bottom of the screen. The higher edge wins: a small gap above the
 * keyboard is better than a covered field.
 */
export function keyboardTop(frame: KeyboardFrame, screenHeight: number) {
  if (!(frame.height > 0)) return frame.screenY
  return Math.min(frame.screenY, screenHeight - frame.height)
}

/** How much of a view (top `y`, `height`) the keyboard covers. */
export function keyboardOverlap(view: { y: number; height: number }, top: number) {
  return Math.max(0, Math.round(view.y + view.height - top))
}

type KeyboardAvoiderProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>
}>

/**
 * Keeps the content above the device keyboard, on Android and iOS.
 *
 * Android draws edge to edge, so the system no longer shrinks the window when
 * the keyboard opens and `KeyboardAvoidingView` without a behavior does
 * nothing there. This view measures how much of itself the keyboard covers and
 * reserves that space at the bottom. Put a ScrollView inside: when it shrinks,
 * the focused field is brought into view.
 */
export function KeyboardAvoider({ children, style }: KeyboardAvoiderProps) {
  const ref = useRef<View>(null)
  /** Top of the open keyboard; null while it is closed. */
  const openKeyboardTop = useRef<number | null>(null)
  const [covered, setCovered] = useState(0)

  const measure = useCallback(() => {
    const top = openKeyboardTop.current
    if (top === null) return
    // The outer frame: the space already reserved inside does not change it.
    ref.current?.measureInWindow((_x, y, _width, height) => {
      if (openKeyboardTop.current === top) setCovered(keyboardOverlap({ y, height }, top))
    })
  }, [])

  useEffect(() => {
    const onShow = (event: KeyboardEvent) => {
      openKeyboardTop.current = keyboardTop(event.endCoordinates, Dimensions.get('screen').height)
      measure()
    }
    const onHide = () => {
      openKeyboardTop.current = null
      setCovered(0)
    }
    const subscriptions = [
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', onShow),
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', onHide),
    ]
    return () => subscriptions.forEach((subscription) => subscription.remove())
  }, [measure])

  return (
    <View
      ref={ref}
      collapsable={false}
      // The frame also changes with the keyboard open (the tab bar hides): measure again.
      onLayout={measure}
      style={[styles.root, style, covered > 0 ? { paddingBottom: covered } : null]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
})
