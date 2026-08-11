import { Ionicons } from '@expo/vector-icons'
import { createPortal } from 'react-dom'
import { type ComponentProps, useEffect, useMemo, useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SelectionModal, type SelectionOption } from '@/components/ui/selection-modal'
import { colors, radius, spacing } from '@/constants/theme'
import { useScaffoldComponentTypes } from '@/hooks/use-scaffold-component-types'
import type { EmergencyScaffoldComponentDraft } from '@/types/execution'
import { blurActiveElement } from '@/utils/focus'

type ComponentDraftModalProps = {
  visible: boolean
  initialValue?: EmergencyScaffoldComponentDraft | null
  onClose: () => void
  onSave: (value: EmergencyScaffoldComponentDraft) => void
}

type ComponentMeasurementUnit = EmergencyScaffoldComponentDraft['measurementUnit']

type CompactInputProps = ComponentProps<typeof TextInput> & {
  label: string
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

function normalizeUnit(value?: string | null): ComponentMeasurementUnit {
  if (value === 'M3' || value === 'M2') return value
  return 'UNIDADE'
}

function parseDecimal(value: string) {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function getUnitLabel(unit: ComponentMeasurementUnit) {
  if (unit === 'M3') return 'Volume (m³)'
  if (unit === 'M2') return 'Área (m²)'
  return 'Linear (m)'
}

function getCalculatedLabel(unit: ComponentMeasurementUnit) {
  if (unit === 'M3') return 'Volume calculado'
  if (unit === 'M2') return 'Área calculada'
  return 'Linear calculado'
}

function getUnitSuffix(unit: ComponentMeasurementUnit) {
  if (unit === 'M3') return 'm³'
  if (unit === 'M2') return 'm²'
  return 'm'
}

export function ComponentDraftModal({
  visible,
  initialValue,
  onClose,
  onSave,
}: ComponentDraftModalProps) {
  const componentTypesQuery = useScaffoldComponentTypes()
  const [componentTypeId, setComponentTypeId] = useState(initialValue?.componentTypeId ?? '')
  const [measurementUnit, setMeasurementUnit] = useState<ComponentMeasurementUnit>(
    normalizeUnit(initialValue?.measurementUnit),
  )
  const [description, setDescription] = useState(initialValue?.description ?? '')
  const [height, setHeight] = useState(String(initialValue?.height ?? ''))
  const [width, setWidth] = useState(String(initialValue?.width ?? ''))
  const [length, setLength] = useState(String(initialValue?.length ?? ''))
  const [showTypePicker, setShowTypePicker] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return

    setComponentTypeId(initialValue?.componentTypeId ?? '')
    setMeasurementUnit(normalizeUnit(initialValue?.measurementUnit))
    setDescription(initialValue?.description ?? '')
    setHeight(String(initialValue?.height ?? ''))
    setWidth(String(initialValue?.width ?? ''))
    setLength(String(initialValue?.length ?? ''))
    setError(null)
  }, [initialValue, visible])

  const selectedComponentType = useMemo(
    () => (componentTypesQuery.data ?? []).find((item) => item.id === componentTypeId) ?? null,
    [componentTypeId, componentTypesQuery.data],
  )

  const componentTypeOptions: SelectionOption[] = useMemo(
    () =>
      (componentTypesQuery.data ?? []).map((item) => ({
        value: item.id,
        label: `${item.code} - ${item.name}`,
        sublabel: getUnitLabel(normalizeUnit(item.defaultMeasurementUnit)),
        caption: item.description ?? undefined,
        keywords: [item.code, item.name, ...(item.aliases ?? [])].join(' '),
      })),
    [componentTypesQuery.data],
  )

  const calculatedQuantity = useMemo(() => {
    const parsedHeight = parseDecimal(height)
    const parsedWidth = parseDecimal(width)
    const parsedLength = parseDecimal(length)

    if (measurementUnit === 'M3') {
      return Number((parsedHeight * parsedWidth * parsedLength).toFixed(3))
    }
    if (measurementUnit === 'M2') {
      return Number((parsedHeight * parsedLength).toFixed(3))
    }
    return Number(parsedLength.toFixed(3))
  }, [height, length, measurementUnit, width])

  const selectComponentType = (value: string) => {
    const componentType = (componentTypesQuery.data ?? []).find((item) => item.id === value)
    const nextUnit = normalizeUnit(componentType?.defaultMeasurementUnit)

    setComponentTypeId(value)
    setMeasurementUnit(nextUnit)
    if (nextUnit !== 'M3') setWidth('')
    if (nextUnit === 'UNIDADE') setHeight('')
    setError(null)
  }

  const handleSave = () => {
    if (!componentTypeId || !selectedComponentType) {
      setError('Selecione o tipo do componente.')
      return
    }

    if (calculatedQuantity <= 0) {
      setError('Informe as medidas necessárias para calcular a metragem do componente.')
      return
    }

    setError(null)
    onSave({
      componentTypeId,
      componentTypeCode: selectedComponentType.code,
      name: selectedComponentType.name,
      description: description.trim() || undefined,
      measurementUnit,
      height: measurementUnit !== 'UNIDADE' ? parseDecimal(height) : undefined,
      width: measurementUnit === 'M3' ? parseDecimal(width) : undefined,
      length: parseDecimal(length),
      plannedQuantity: calculatedQuantity,
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
                Cada inclusão representa um componente. Tipo e unidade seguem o catálogo.
              </Text>
            </View>
            <Pressable onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={16} color={colors.primaryStrong} />
            </Pressable>
          </View>

          <Pressable
            onPress={() => {
              blurActiveElement()
              setShowTypePicker(true)
            }}
            style={({ pressed }) => [
              styles.selectTrigger,
              pressed ? styles.selectTriggerPressed : null,
            ]}
          >
            <View style={styles.selectTriggerText}>
              <Text style={styles.fieldLabel}>Tipo do componente</Text>
              <Text
                style={[
                  styles.selectTriggerValue,
                  !selectedComponentType ? styles.selectTriggerPlaceholder : null,
                ]}
              >
                {selectedComponentType
                  ? `${selectedComponentType.code} - ${selectedComponentType.name}`
                  : componentTypesQuery.isLoading
                    ? 'Carregando catálogo...'
                    : 'Selecionar tipo'}
              </Text>
              <Text style={styles.selectTriggerHelper}>
                Disponível offline após a preparação do contrato.
              </Text>
            </View>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </Pressable>

          <View style={styles.readOnlyField}>
            <Text style={styles.fieldLabel}>Unidade</Text>
            <Text style={styles.readOnlyValue}>
              {selectedComponentType ? getUnitLabel(measurementUnit) : 'Selecione o tipo'}
            </Text>
            <Text style={styles.readOnlyHelper}>Definida no cadastro do tipo de componente.</Text>
          </View>

          {selectedComponentType ? (
            <View style={styles.dimensionsGrid}>
              {measurementUnit !== 'UNIDADE' ? (
                <CompactInput
                  label="Altura"
                  placeholder="0,00"
                  keyboardType="decimal-pad"
                  value={height}
                  onChangeText={setHeight}
                />
              ) : null}
              {measurementUnit === 'M3' ? (
                <CompactInput
                  label="Largura"
                  placeholder="0,00"
                  keyboardType="decimal-pad"
                  value={width}
                  onChangeText={setWidth}
                />
              ) : null}
              <CompactInput
                label="Comprimento"
                placeholder="0,00"
                keyboardType="decimal-pad"
                value={length}
                onChangeText={setLength}
              />
            </View>
          ) : null}

          <View style={styles.calculatedBox}>
            <Text style={styles.calculatedLabel}>{getCalculatedLabel(measurementUnit)}</Text>
            <Text style={styles.calculatedValue}>
              {selectedComponentType ? calculatedQuantity : '-'}{' '}
              {selectedComponentType ? getUnitSuffix(measurementUnit) : ''}
            </Text>
          </View>

          <CompactInput
            label="Observações"
            placeholder="Opcional"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable onPress={handleClose} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonLabel}>Cancelar</Text>
            </Pressable>
            <Pressable onPress={handleSave} style={styles.primaryButton}>
              <Text style={styles.primaryButtonLabel}>Salvar componente</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>

      <SelectionModal
        visible={showTypePicker}
        title="Tipo do componente"
        subtitle="A unidade de medição será aplicada automaticamente."
        options={componentTypeOptions}
        selectedValue={componentTypeId}
        onSelect={selectComponentType}
        onClose={() => setShowTypePicker(false)}
        emptyMessage={
          componentTypesQuery.isLoading
            ? 'Carregando tipos de componente...'
            : 'Nenhum tipo de componente disponível no cache deste aparelho.'
        }
      />
    </KeyboardAvoidingView>
  )

  if (!visible) return null

  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') return null
    return createPortal(content, document.body)
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={handleClose}>
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
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8, 20, 26, 0.42)' },
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
  content: { gap: spacing.md, paddingBottom: spacing.lg + 120 },
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
  headerText: { gap: spacing.xs, flex: 1 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
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
  fieldGroup: { gap: 6 },
  fieldLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
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
  fieldInputMultiline: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
  selectTrigger: {
    minHeight: 62,
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
  selectTriggerPressed: { opacity: 0.85 },
  selectTriggerText: { flex: 1, gap: 3 },
  selectTriggerValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
  selectTriggerPlaceholder: { color: '#8AA0A8', fontWeight: '500' },
  selectTriggerHelper: { color: colors.textMuted, fontSize: 11 },
  readOnlyField: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#D8E4E8',
    backgroundColor: '#F7FBFC',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 3,
  },
  readOnlyValue: { color: colors.text, fontSize: 14, fontWeight: '700' },
  readOnlyHelper: { color: colors.textMuted, fontSize: 10 },
  dimensionsGrid: { gap: spacing.sm },
  calculatedBox: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#D8E4E8',
    backgroundColor: '#F7FBFC',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  calculatedLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  calculatedValue: { color: colors.text, fontSize: 15, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 11 },
  actions: { flexDirection: 'row', gap: spacing.sm },
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
  secondaryButtonLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonLabel: { color: '#F9FBFC', fontSize: 13, fontWeight: '700' },
})
