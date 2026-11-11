import { useMemo, useRef, useState } from 'react'
import { Alert, Modal, PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Path, Rect } from 'react-native-svg'
import { Button } from '@/components/ui/button'
import { colors, radius, spacing } from '@/constants/theme'

type Strokes = {
  done: string[]
  current: string
}

type SignaturePadModalProps = {
  visible: boolean
  signerName: string
  onCancel: () => void
  /** PNG, base64 without the data: prefix. */
  onSave: (pngBase64: string) => void | Promise<void>
}

function point(x: number, y: number) {
  return `${x.toFixed(1)} ${y.toFixed(1)}`
}

/** Signature drawn with the finger, in a modal so the page does not scroll while drawing. */
export function SignaturePadModal({ visible, signerName, onCancel, onSave }: SignaturePadModalProps) {
  const svgRef = useRef<Svg>(null)
  const [strokes, setStrokes] = useState<Strokes>({ done: [], current: '' })
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [saving, setSaving] = useState(false)

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent
          setStrokes((state) => ({ ...state, current: `M${point(locationX, locationY)}` }))
        },
        onPanResponderMove: (event) => {
          const { locationX, locationY } = event.nativeEvent
          setStrokes((state) =>
            state.current ? { ...state, current: `${state.current} L${point(locationX, locationY)}` } : state,
          )
        },
        onPanResponderRelease: () => {
          setStrokes((state) =>
            state.current ? { done: [...state.done, state.current], current: '' } : state,
          )
        },
      }),
    [],
  )

  const empty = strokes.done.length === 0 && !strokes.current

  const clear = () => setStrokes({ done: [], current: '' })

  const close = () => {
    clear()
    onCancel()
  }

  const save = () => {
    const svg = svgRef.current
    if (!svg || empty) return
    setSaving(true)
    svg.toDataURL(
      (base64: string) => {
        Promise.resolve(onSave(base64))
          .then(clear)
          .catch((error: unknown) =>
            Alert.alert(
              'Não foi possível salvar a assinatura',
              error instanceof Error ? error.message : 'Tente novamente.',
            ),
          )
          .finally(() => setSaving(false))
      },
      { width: Math.round(size.width), height: Math.round(size.height) },
    )
  }

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    setSize({ width, height })
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>Assinatura do inspetor</Text>
          <Text style={styles.subtitle}>{signerName}. Assine com o dedo dentro do quadro.</Text>
        </View>

        <View style={styles.pad} onLayout={onLayout} {...responder.panHandlers}>
          {size.width > 0 ? (
            <Svg ref={svgRef} width={size.width} height={size.height} pointerEvents="none">
              <Rect x={0} y={0} width={size.width} height={size.height} fill="#FFFFFF" />
              {[...strokes.done, strokes.current].filter(Boolean).map((d, index) => (
                <Path
                  key={index}
                  d={d}
                  stroke="#111827"
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ))}
            </Svg>
          ) : null}
          {empty ? <Text style={styles.placeholder}>Assine aqui</Text> : null}
          <View style={styles.baseline} />
        </View>

        <View style={styles.actions}>
          <View style={styles.action}>
            <Button variant="secondary" onPress={close} disabled={saving}>
              Cancelar
            </Button>
          </View>
          <View style={styles.action}>
            <Button variant="secondary" onPress={clear} disabled={empty || saving}>
              Limpar
            </Button>
          </View>
          <View style={styles.action}>
            <Button onPress={save} disabled={empty} loading={saving}>
              Salvar
            </Button>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  pad: {
    flex: 1,
    maxHeight: 360,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  placeholder: {
    position: 'absolute',
    pointerEvents: 'none',
    alignSelf: 'center',
    top: '42%',
    color: colors.border,
    fontSize: 22,
    fontWeight: '700',
  },
  baseline: {
    position: 'absolute',
    pointerEvents: 'none',
    left: spacing.xl,
    right: spacing.xl,
    bottom: 56,
    height: 1,
    backgroundColor: colors.border,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
})
