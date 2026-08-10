import { Ionicons } from '@expo/vector-icons'
import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { SelectionModal, type SelectionOption } from '@/components/ui/selection-modal'
import { colors, radius, spacing } from '@/constants/theme'
import type { ExecutionComponentAdvanceInput, ExecutionInputType } from '@/types/execution'
import { ExecutionInputType as InputType } from '@/types/execution'
import type { ScaffoldComponent } from '@/types/scaffold-component'

type Props = {
  components: ScaffoldComponent[]
  advances: ExecutionComponentAdvanceInput[]
  operationType: 'MONTAGEM' | 'DESMONTAGEM'
  parentInputType: ExecutionInputType
  parentInputValue: number
  isLoading?: boolean
  onChange: (value: ExecutionComponentAdvanceInput[]) => void
}

function availableQuantity(component: ScaffoldComponent, operationType: Props['operationType']) {
  return Math.max(
    0,
    component.executionProgress?.[operationType]?.remainingQuantity ?? component.quantity ?? 0,
  )
}

export function ExecutionComponentAdvanceSection({
  components,
  advances,
  operationType,
  parentInputType,
  parentInputValue,
  isLoading,
  onChange,
}: Props) {
  const [selectorOpen, setSelectorOpen] = useState(false)
  const availableComponents = useMemo(
    () =>
      components.filter(
        (component) =>
          component.isAvailableForOperation ||
          advances.some((advance) => advance.scaffoldComponentId === component.id),
      ),
    [advances, components],
  )
  const options: SelectionOption[] = availableComponents.map((component) => ({
    value: component.id,
    label: `${component.lineCode} · ${component.name}`,
    sublabel: `${availableQuantity(component, operationType)} ${component.measurementUnit ?? ''} disponíveis`,
    caption: component.notes ?? component.description ?? undefined,
  }))

  const applySelection = (componentIds: string[]) => {
    const existing = new Map(advances.map((advance) => [advance.scaffoldComponentId, advance]))
    onChange(
      componentIds.map((componentId) => {
        const current = existing.get(componentId)
        if (current) return current

        const component = components.find((item) => item.id === componentId)
        const total = component?.quantity ?? 0
        const remaining = component ? availableQuantity(component, operationType) : 0
        const maxPercent = total > 0 ? (remaining / total) * 100 : 0
        const inheritedPercent =
          parentInputType === InputType.PERCENTUAL
            ? Math.min(Math.max(parentInputValue, 0), maxPercent)
            : 0

        return {
          scaffoldComponentId: componentId,
          inputType: InputType.PERCENTUAL,
          inputValue: Number(inheritedPercent.toFixed(2)),
        }
      }),
    )
  }

  const update = (componentId: string, changes: Partial<ExecutionComponentAdvanceInput>) => {
    onChange(
      advances.map((advance) =>
        advance.scaffoldComponentId === componentId ? { ...advance, ...changes } : advance,
      ),
    )
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.summaryRow}>
        <View>
          <Text style={styles.title}>Avanço dos componentes</Text>
          <Text style={styles.subtitle}>
            {advances.length}/{availableComponents.length} selecionado(s)
          </Text>
        </View>
        <Pressable
          onPress={() => setSelectorOpen(true)}
          disabled={isLoading || availableComponents.length === 0}
          style={({ pressed }) => [
            styles.addButton,
            pressed ? styles.pressed : null,
            isLoading || availableComponents.length === 0 ? styles.disabled : null,
          ]}
        >
          <Ionicons name="list-outline" size={16} color={colors.primaryStrong} />
          <Text style={styles.addButtonLabel}>Selecionar</Text>
        </Pressable>
      </View>

      {isLoading ? <Text style={styles.empty}>Carregando componentes...</Text> : null}
      {!isLoading && availableComponents.length === 0 ? (
        <Text style={styles.empty}>Nenhum componente disponível para esta operação.</Text>
      ) : null}

      {advances.map((advance) => {
        const component = components.find((item) => item.id === advance.scaffoldComponentId)
        if (!component) return null

        return (
          <View key={advance.scaffoldComponentId} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleWrap}>
                <Text style={styles.cardTitle}>
                  {component.lineCode} · {component.name}
                </Text>
                <Text style={styles.cardMeta}>
                  Saldo: {availableQuantity(component, operationType)} {component.measurementUnit}
                </Text>
              </View>
              <Pressable
                onPress={() =>
                  onChange(
                    advances.filter(
                      (item) => item.scaffoldComponentId !== advance.scaffoldComponentId,
                    ),
                  )
                }
                style={styles.removeButton}
              >
                <Ionicons name="close" size={16} color={colors.danger} />
              </Pressable>
            </View>

            <SegmentedControl
              value={advance.inputType}
              onChange={(inputType) => update(component.id, { inputType, inputValue: 0 })}
              options={[
                { value: InputType.PERCENTUAL, label: 'Percentual' },
                { value: InputType.QUANTIDADE, label: 'Quantidade' },
              ]}
            />
            <TextInput
              value={advance.inputValue > 0 ? String(advance.inputValue) : ''}
              onChangeText={(value) =>
                update(component.id, { inputValue: Number(value.replace(',', '.')) || 0 })
              }
              keyboardType="decimal-pad"
              placeholder={advance.inputType === InputType.PERCENTUAL ? 'Ex.: 25' : 'Ex.: 4,5'}
              placeholderTextColor="#8AA0A8"
              style={styles.input}
            />
          </View>
        )
      })}

      <SelectionModal
        visible={selectorOpen}
        title="Componentes da execução"
        subtitle="Selecione e informe o avanço individual de cada componente."
        options={options}
        multiple
        selectedValues={advances.map((advance) => advance.scaffoldComponentId)}
        onConfirm={applySelection}
        onClose={() => setSelectorOpen(false)}
        confirmLabel="Aplicar componentes"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: { color: colors.text, fontSize: 13, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  addButton: {
    minHeight: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  addButtonLabel: { color: colors.primaryStrong, fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.45 },
  empty: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitleWrap: { flex: 1, gap: 2 },
  cardTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  cardMeta: { color: colors.textMuted, fontSize: 11 },
  removeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF1F1',
  },
  input: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 13,
  },
})
