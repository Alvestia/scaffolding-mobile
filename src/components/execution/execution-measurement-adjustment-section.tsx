import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { SelectionModal, type SelectionOption } from '@/components/ui/selection-modal'
import { colors, radius, spacing } from '@/constants/theme'
import {
  MeasurementAdjustmentType,
  type ExecutionMeasurementAdjustmentDraft,
} from '@/types/execution'
import type { MeasurementUnit } from '@/types/scaffold-service'
import type { ScaffoldComponent } from '@/types/scaffold-component'
import { createLocalId } from '@/utils/id'

type Props = {
  plannedUnit: MeasurementUnit
  components: ScaffoldComponent[]
  enabled: boolean
  adjustments: ExecutionMeasurementAdjustmentDraft[]
  onEnabledChange: (enabled: boolean) => void
  onChange: (value: ExecutionMeasurementAdjustmentDraft[]) => void
}

function supportedUnit(
  value?: string | null,
): ExecutionMeasurementAdjustmentDraft['measurementUnit'] {
  if (value === 'M3' || value === 'M2') return value
  return 'UNIDADE'
}

function newAdjustment(plannedUnit: MeasurementUnit): ExecutionMeasurementAdjustmentDraft {
  return {
    localId: createLocalId('adjustment'),
    scope: 'SCAFFOLD',
    measurementUnit: supportedUnit(plannedUnit),
    type: MeasurementAdjustmentType.DEDUCTION,
    quantity: 0,
    reason: '',
  }
}

function normalizeDecimalInput(value: string) {
  const sanitized = value.replace(',', '.').replace(/[^0-9.]/g, '')
  const separatorIndex = sanitized.indexOf('.')

  if (separatorIndex < 0) return sanitized

  const integer = sanitized.slice(0, separatorIndex) || '0'
  const decimal = sanitized.slice(separatorIndex + 1).replaceAll('.', '')
  return `${integer}.${decimal}`
}

export function ExecutionMeasurementAdjustmentSection({
  plannedUnit,
  components,
  enabled,
  adjustments,
  onEnabledChange,
  onChange,
}: Props) {
  const [componentDraftId, setComponentDraftId] = useState<string | null>(null)
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({})
  const componentOptions: SelectionOption[] = components.map((component) => ({
    value: component.id,
    label: `${component.lineCode} · ${component.name}`,
    sublabel: component.measurementUnit ?? undefined,
    caption: component.notes ?? component.description ?? undefined,
  }))

  const toggle = (value: 'NO' | 'YES') => {
    const nextEnabled = value === 'YES'
    onEnabledChange(nextEnabled)
    if (nextEnabled && adjustments.length === 0) {
      onChange([newAdjustment(plannedUnit)])
    }
    if (!nextEnabled) onChange([])
  }

  const update = (localId: string, changes: Partial<ExecutionMeasurementAdjustmentDraft>) => {
    onChange(
      adjustments.map((adjustment) =>
        adjustment.localId === localId ? { ...adjustment, ...changes } : adjustment,
      ),
    )
  }

  const selectComponent = (componentId: string) => {
    if (!componentDraftId) return
    const component = components.find((item) => item.id === componentId)
    update(componentDraftId, {
      scaffoldComponentId: componentId,
      measurementUnit: supportedUnit(component?.measurementUnit),
    })
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Houve ajustes de metragem?</Text>
          <Text style={styles.subtitle}>Desconto ou acréscimo no andaime ou componente.</Text>
        </View>
        <View style={styles.toggleWrap}>
          <SegmentedControl
            value={enabled ? 'YES' : 'NO'}
            onChange={toggle}
            options={[
              { value: 'NO', label: 'Não' },
              { value: 'YES', label: 'Sim' },
            ]}
          />
        </View>
      </View>

      {enabled
        ? adjustments.map((adjustment, index) => {
            const component = components.find((item) => item.id === adjustment.scaffoldComponentId)
            return (
              <View key={adjustment.localId} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Ajuste {index + 1}</Text>
                  <Pressable
                    onPress={() =>
                      onChange(adjustments.filter((item) => item.localId !== adjustment.localId))
                    }
                    style={styles.removeButton}
                  >
                    <Ionicons name="trash-outline" size={15} color={colors.danger} />
                  </Pressable>
                </View>

                <Text style={styles.label}>Escopo</Text>
                <SegmentedControl
                  value={adjustment.scope}
                  onChange={(scope) =>
                    update(adjustment.localId, {
                      scope,
                      scaffoldComponentId: undefined,
                      measurementUnit: supportedUnit(plannedUnit),
                    })
                  }
                  options={[
                    { value: 'SCAFFOLD', label: 'Andaime' },
                    { value: 'COMPONENT', label: 'Componente' },
                  ]}
                />

                {adjustment.scope === 'COMPONENT' ? (
                  <Pressable
                    onPress={() => setComponentDraftId(adjustment.localId)}
                    style={({ pressed }) => [styles.select, pressed ? styles.pressed : null]}
                  >
                    <View style={styles.selectText}>
                      <Text style={styles.label}>Componente</Text>
                      <Text style={component ? styles.selectValue : styles.placeholder}>
                        {component
                          ? `${component.lineCode} · ${component.name}`
                          : 'Selecionar componente'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-down" size={17} color={colors.textMuted} />
                  </Pressable>
                ) : null}

                <Text style={styles.label}>Tipo</Text>
                <SegmentedControl
                  value={adjustment.type}
                  onChange={(type) => update(adjustment.localId, { type })}
                  options={[
                    { value: MeasurementAdjustmentType.DEDUCTION, label: 'Desconto' },
                    { value: MeasurementAdjustmentType.ADDITION, label: 'Acréscimo' },
                  ]}
                />

                <View style={styles.quantityRow}>
                  <View style={styles.quantityField}>
                    <Text style={styles.label}>Quantidade</Text>
                    <TextInput
                      value={
                        quantityInputs[adjustment.localId] ??
                        (adjustment.quantity > 0 ? String(adjustment.quantity) : '')
                      }
                      onChangeText={(value) => {
                        const normalized = normalizeDecimalInput(value)
                        setQuantityInputs((current) => ({
                          ...current,
                          [adjustment.localId]: normalized,
                        }))
                        update(adjustment.localId, {
                          quantity: Number(normalized) || 0,
                        })
                      }}
                      keyboardType="decimal-pad"
                      placeholder="0,00"
                      placeholderTextColor="#8AA0A8"
                      style={styles.input}
                    />
                  </View>
                  <View style={styles.unitBadge}>
                    <Text style={styles.unitLabel}>{adjustment.measurementUnit}</Text>
                  </View>
                </View>
                <Text style={styles.unitHelper}>
                  {adjustment.scope === 'COMPONENT'
                    ? 'Unidade definida no cadastro do componente.'
                    : 'Unidade definida pela medição do andaime.'}
                </Text>

                <Text style={styles.label}>Motivo</Text>
                <TextInput
                  value={adjustment.reason}
                  onChangeText={(reason) => update(adjustment.localId, { reason })}
                  placeholder="Ex.: interferência de tubulação ou obstrução local."
                  placeholderTextColor="#8AA0A8"
                  multiline
                  style={[styles.input, styles.reasonInput]}
                />
              </View>
            )
          })
        : null}

      {enabled ? (
        <Pressable
          onPress={() => onChange([...adjustments, newAdjustment(plannedUnit)])}
          style={({ pressed }) => [styles.addButton, pressed ? styles.pressed : null]}
        >
          <Ionicons name="add" size={16} color={colors.primaryStrong} />
          <Text style={styles.addButtonLabel}>Adicionar ajuste</Text>
        </Pressable>
      ) : null}

      <SelectionModal
        visible={Boolean(componentDraftId)}
        title="Componente impactado"
        subtitle="A unidade do ajuste seguirá a unidade cadastrada no componente."
        options={componentOptions}
        selectedValue={
          adjustments.find((item) => item.localId === componentDraftId)?.scaffoldComponentId
        }
        onSelect={selectComponent}
        onClose={() => setComponentDraftId(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  header: { gap: spacing.sm },
  headerText: { gap: 2 },
  title: { color: colors.text, fontSize: 14, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: 11, lineHeight: 17 },
  toggleWrap: { maxWidth: 240 },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF1F1',
  },
  label: { color: colors.text, fontSize: 11, fontWeight: '600' },
  select: {
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  selectText: { flex: 1, gap: 3 },
  selectValue: { color: colors.text, fontSize: 13, fontWeight: '600' },
  placeholder: { color: '#8AA0A8', fontSize: 13 },
  quantityRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  quantityField: { flex: 1, gap: 6 },
  input: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 13,
  },
  reasonInput: { minHeight: 88, paddingTop: spacing.md, textAlignVertical: 'top' },
  unitBadge: {
    minWidth: 76,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitLabel: { color: colors.primaryStrong, fontSize: 12, fontWeight: '800' },
  unitHelper: { color: colors.textMuted, fontSize: 10, lineHeight: 15 },
  addButton: {
    minHeight: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  addButtonLabel: { color: colors.primaryStrong, fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.84 },
})
