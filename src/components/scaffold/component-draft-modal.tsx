import { createPortal } from 'react-dom'
import { Ionicons } from '@expo/vector-icons'
import { type ComponentProps, useEffect, useMemo, useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { SelectionModal, type SelectionOption } from '@/components/ui/selection-modal'
import { colors, radius, spacing } from '@/constants/theme'
import type { EmergencyScaffoldComponentDraft } from '@/types/execution'
import { MeasurementUnit } from '@/types/scaffold-service'
import {
  calculateMeasuredTotal,
  getMeasurementUnitLabel,
  getVisibleMeasurementDimensions,
  normalizeMeasuredDimensions,
} from '@/utils/execution'
import { blurActiveElement } from '@/utils/focus'

const categoryOptions: SelectionOption[] = [
  { value: 'PATAMAR', label: 'Patamar' },
  { value: 'TABUADO', label: 'Tabuado' },
  { value: 'LINHA_DE_VIDA', label: 'Linha de vida' },
  { value: 'GUARDA_CORPO', label: 'Guarda-corpo' },
  { value: 'RODAPE', label: 'Rodapé' },
  { value: 'ESCADA', label: 'Escada' },
  { value: 'TRAVAMENTO', label: 'Travamento' },
  { value: 'ACESSORIO', label: 'Acessório' },
  { value: 'OUTRO', label: 'Outro' },
]

type ComponentDraftModalProps = {
  visible: boolean
  initialValue?: EmergencyScaffoldComponentDraft | null
  onClose: () => void
  onSave: (value: EmergencyScaffoldComponentDraft) => void
}

type DraftMeasurementUnit =
  | typeof MeasurementUnit.M3
  | typeof MeasurementUnit.M2
  | typeof MeasurementUnit.LINEAR_M

type CompactInputProps = ComponentProps<typeof TextInput> & {
  label: string
}

type SelectTriggerProps = {
  label: string
  value?: string | null
  helper?: string | null
  placeholder: string
  onPress: () => void
}

function CompactInput({ label, multiline, style, ...props }: CompactInputProps) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor="#8AA0A8"
        multiline={multiline}
        style={[styles.fieldInput, multiline ? styles.fieldInputMultiline : null, style]}
        {...props}
      />
    </View>
  )
}

function SelectTrigger({ label, value, helper, placeholder, onPress }: SelectTriggerProps) {
  return (
    <Pressable
      onPress={() => {
        blurActiveElement()
        onPress()
      }}
      style={({ pressed }) => [styles.selectTrigger, pressed ? styles.selectTriggerPressed : null]}
    >
      <View style={styles.selectTriggerText}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={[styles.selectTriggerValue, !value ? styles.selectTriggerPlaceholder : null]}>
          {value ?? placeholder}
        </Text>
        <Text style={styles.selectTriggerHelper}>{helper ?? 'Toque para selecionar'}</Text>
      </View>
      <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
    </Pressable>
  )
}

function coerceMeasurementUnit(
  value?: EmergencyScaffoldComponentDraft['measurementUnit'] | null,
): DraftMeasurementUnit {
  if (value === MeasurementUnit.M2 || value === MeasurementUnit.LINEAR_M) {
    return value
  }

  return MeasurementUnit.M3
}

export function ComponentDraftModal({
  visible,
  initialValue,
  onClose,
  onSave,
}: ComponentDraftModalProps) {
  const [category, setCategory] = useState(initialValue?.category ?? 'OUTRO')
  const [name, setName] = useState(initialValue?.name ?? '')
  const [description, setDescription] = useState(initialValue?.description ?? '')
  const [measurementUnit, setMeasurementUnit] = useState<DraftMeasurementUnit>(
    coerceMeasurementUnit(initialValue?.measurementUnit),
  )
  const [repeatCount, setRepeatCount] = useState(String(initialValue?.repeatCount ?? '1'))
  const [height, setHeight] = useState(String(initialValue?.height ?? ''))
  const [width, setWidth] = useState(String(initialValue?.width ?? ''))
  const [length, setLength] = useState(String(initialValue?.length ?? ''))
  const [plannedQuantity, setPlannedQuantity] = useState(
    String(initialValue?.plannedQuantity ?? ''),
  )
  const [trackAssembly, setTrackAssembly] = useState(initialValue?.trackAssembly ?? true)
  const [trackDisassembly, setTrackDisassembly] = useState(initialValue?.trackDisassembly ?? true)
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) {
      return
    }

    setCategory(initialValue?.category ?? 'OUTRO')
    setName(initialValue?.name ?? '')
    setDescription(initialValue?.description ?? '')
    setMeasurementUnit(coerceMeasurementUnit(initialValue?.measurementUnit))
    setRepeatCount(String(initialValue?.repeatCount ?? '1'))
    setHeight(String(initialValue?.height ?? ''))
    setWidth(String(initialValue?.width ?? ''))
    setLength(String(initialValue?.length ?? ''))
    setPlannedQuantity(String(initialValue?.plannedQuantity ?? ''))
    setTrackAssembly(initialValue?.trackAssembly ?? true)
    setTrackDisassembly(initialValue?.trackDisassembly ?? true)
    setError(null)
  }, [initialValue, visible])

  const visibleMeasurementDimensions = useMemo(
    () => getVisibleMeasurementDimensions(measurementUnit),
    [measurementUnit],
  )

  useEffect(() => {
    if (!visibleMeasurementDimensions.height && height) {
      setHeight('')
    }

    if (!visibleMeasurementDimensions.width && width) {
      setWidth('')
    }

    if (!visibleMeasurementDimensions.length && length) {
      setLength('')
    }
  }, [
    height,
    length,
    visibleMeasurementDimensions.height,
    visibleMeasurementDimensions.length,
    visibleMeasurementDimensions.width,
    width,
  ])

  const calculatedQuantity = useMemo(() => {
    const normalizedDimensions = normalizeMeasuredDimensions(measurementUnit, {
      height: Number(height || 0),
      width: Number(width || 0),
      length: Number(length || 0),
    })

    return calculateMeasuredTotal(measurementUnit, normalizedDimensions)
  }, [height, length, measurementUnit, width])

  const handleSave = () => {
    if (name.trim().length < 2) {
      setError('Informe um nome claro para o componente.')
      return
    }

    const resolvedQuantity =
      plannedQuantity.trim().length > 0 ? Number(plannedQuantity) : calculatedQuantity

    if (!resolvedQuantity || resolvedQuantity <= 0) {
      setError('Informe uma quantidade planejada válida para o componente.')
      return
    }

    const normalizedDimensions = normalizeMeasuredDimensions(measurementUnit, {
      height: height ? Number(height) : undefined,
      width: width ? Number(width) : undefined,
      length: length ? Number(length) : undefined,
    })

    setError(null)
    onSave({
      category,
      name: name.trim(),
      description: description.trim() || undefined,
      measurementUnit,
      repeatCount: Number(repeatCount || 1),
      height: normalizedDimensions.height,
      width: normalizedDimensions.width,
      length: normalizedDimensions.length,
      plannedQuantity: resolvedQuantity,
      trackAssembly,
      trackDisassembly,
    })
  }

  const handleClose = () => {
    blurActiveElement()
    onClose()
  }

  const content = (
    <KeyboardAvoidingView
      style={styles.overlay}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
    >
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <View style={styles.sheet}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>
                {initialValue ? 'Editar componente' : 'Novo componente'}
              </Text>
              <Text style={styles.subtitle}>
                Defina o lote com medição correta e uma leitura simples para campo.
              </Text>
            </View>

            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed ? styles.closeButtonPressed : null,
              ]}
            >
              <Ionicons name="close" size={16} color={colors.primaryStrong} />
            </Pressable>
          </View>

          <SelectTrigger
            label="Categoria"
            value={categoryOptions.find((item) => item.value === category)?.label ?? null}
            placeholder="Selecione a categoria"
            helper="Escolha o tipo principal do lote"
            onPress={() => setShowCategoryPicker(true)}
          />

          <CompactInput
            label="Nome do componente"
            placeholder="Ex.: Plataforma superior"
            value={name}
            onChangeText={setName}
          />

          <CompactInput
            label="Descrição"
            placeholder="Detalhes opcionais do lote"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Metragem</Text>
            <SegmentedControl
              value={measurementUnit}
              onChange={(value) => setMeasurementUnit(value as DraftMeasurementUnit)}
              options={[
                { value: MeasurementUnit.M3, label: 'Volume' },
                { value: MeasurementUnit.M2, label: 'Área' },
                { value: MeasurementUnit.LINEAR_M, label: 'Linear' },
              ]}
            />
          </View>

          <CompactInput
            label="Repetições"
            placeholder="1"
            keyboardType="number-pad"
            value={repeatCount}
            onChangeText={setRepeatCount}
          />

          <View style={styles.dimensionsGrid}>
            {visibleMeasurementDimensions.height ? (
              <CompactInput
                label="Altura"
                keyboardType="decimal-pad"
                value={height}
                onChangeText={setHeight}
              />
            ) : null}
            {visibleMeasurementDimensions.width ? (
              <CompactInput
                label="Largura"
                keyboardType="decimal-pad"
                value={width}
                onChangeText={setWidth}
              />
            ) : null}
            {visibleMeasurementDimensions.length ? (
              <CompactInput
                label="Comprimento"
                keyboardType="decimal-pad"
                value={length}
                onChangeText={setLength}
              />
            ) : null}
          </View>

          <CompactInput
            label={`Quantidade planejada (${getMeasurementUnitLabel(measurementUnit)})`}
            placeholder={String(calculatedQuantity || '')}
            keyboardType="decimal-pad"
            value={plannedQuantity}
            onChangeText={setPlannedQuantity}
          />

          <View style={styles.calculatedBox}>
            <Text style={styles.calculatedLabel}>Quantidade calculada</Text>
            <Text style={styles.calculatedValue}>
              {calculatedQuantity || 0} {getMeasurementUnitLabel(measurementUnit)}
            </Text>
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchTitle}>Rastrear montagem</Text>
              <Text style={styles.switchDescription}>
                Permite usar esse lote no avanço de montagem.
              </Text>
            </View>
            <Switch value={trackAssembly} onValueChange={setTrackAssembly} />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchTitle}>Rastrear desmontagem</Text>
              <Text style={styles.switchDescription}>
                Permite usar esse lote no avanço de desmontagem.
              </Text>
            </View>
            <Switch value={trackDisassembly} onValueChange={setTrackDisassembly} />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? styles.secondaryButtonPressed : null,
              ]}
            >
              <Text style={styles.secondaryButtonLabel}>Cancelar</Text>
            </Pressable>

            <Pressable
              onPress={handleSave}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed ? styles.primaryButtonPressed : null,
              ]}
            >
              <Text style={styles.primaryButtonLabel}>Salvar componente</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>

      <SelectionModal
        visible={showCategoryPicker}
        title="Categoria do componente"
        options={categoryOptions}
        selectedValue={category}
        onSelect={(value) => setCategory(value)}
        onClose={() => setShowCategoryPicker(false)}
      />
    </KeyboardAvoidingView>
  )

  if (!visible) {
    return null
  }

  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') {
      return null
    }

    return createPortal(content, document.body)
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      {content}
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    ...Platform.select({
      web: {
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 10000,
      },
      default: null,
    }),
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(8, 20, 26, 0.42)',
  },
  sheet: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 520,
    maxHeight: '88%',
    borderRadius: radius.xxl,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.lg + 120,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#D5E2E7',
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerText: {
    gap: spacing.xs,
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FBFC',
  },
  closeButtonPressed: {
    opacity: 0.82,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  fieldInput: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#D8E4E8',
    backgroundColor: '#FBFDFD',
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 14,
  },
  fieldInputMultiline: {
    minHeight: 104,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  dimensionsGrid: {
    gap: spacing.sm,
  },
  selectTrigger: {
    minHeight: 56,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#D8E4E8',
    backgroundColor: '#FBFDFD',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  selectTriggerPressed: {
    opacity: 0.85,
  },
  selectTriggerText: {
    flex: 1,
    gap: 2,
  },
  selectTriggerValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  selectTriggerPlaceholder: {
    color: '#8AA0A8',
    fontWeight: '500',
  },
  selectTriggerHelper: {
    color: colors.textMuted,
    fontSize: 11,
  },
  calculatedBox: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#D8E4E8',
    backgroundColor: '#F7FBFC',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  calculatedLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  calculatedValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  switchRow: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#D8E4E8',
    backgroundColor: '#FBFDFD',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  switchText: {
    flex: 1,
    gap: 2,
  },
  switchTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  switchDescription: {
    color: colors.textMuted,
    fontSize: 11,
  },
  error: {
    color: colors.danger,
    fontSize: 11,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#D8E4E8',
    backgroundColor: '#FBFDFD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonPressed: {
    opacity: 0.85,
  },
  secondaryButtonLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.86,
  },
  primaryButtonLabel: {
    color: '#F9FBFC',
    fontSize: 13,
    fontWeight: '700',
  },
})
