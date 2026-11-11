import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { InspectionPhotos } from '@/components/inspection/inspection-photos'
import { colors, radius, spacing } from '@/constants/theme'
import type {
  InspectionAnswerDraft,
  InspectionEvidenceDraft,
  TemplateItem,
} from '@/types/inspection'
import { NOT_APPLICABLE } from '@/types/inspection'
import { dateInputToIsoDate, maskDateInput } from '@/utils/date'
import {
  evaluateAnswer,
  itemNeedsEvidence,
  itemNeedsObservation,
  SEVERITY_LABELS,
} from '@/utils/inspection-rules'

type Choice = { value: string; label: string; failing?: boolean }

function choicesOf(item: TemplateItem): Choice[] {
  const failing = new Set(item.failingValues ?? [])
  const base: Choice[] =
    item.answerType === 'CONFORMITY'
      ? [
          { value: 'CONFORMING', label: 'Conforme' },
          { value: 'NON_CONFORMING', label: 'Não conforme', failing: true },
        ]
      : item.answerType === 'YES_NO'
        ? [
            { value: 'YES', label: 'Sim', failing: failing.has('YES') },
            { value: 'NO', label: 'Não', failing: failing.has('NO') },
          ]
        : (item.options ?? []).map((option) => ({
            value: option,
            label: option,
            failing: failing.has(option),
          }))
  return item.allowNotApplicable ? [...base, { value: NOT_APPLICABLE, label: 'N/A' }] : base
}

function isoToInput(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value ?? ''
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

type ChecklistItemCardProps = {
  item: TemplateItem
  index: number
  answer: InspectionAnswerDraft | undefined
  photos: InspectionEvidenceDraft[]
  sentPhotos: number
  cameraOnly: boolean
  readOnly: boolean
  onAnswer: (answer: InspectionAnswerDraft) => void
  onAddPhotos: (photos: InspectionEvidenceDraft[]) => void
  onRemovePhoto: (photo: InspectionEvidenceDraft) => void
}

export function ChecklistItemCard({
  item,
  index,
  answer,
  photos,
  sentPhotos,
  cameraOnly,
  readOnly,
  onAnswer,
  onAddPhotos,
  onRemovePhoto,
}: ChecklistItemCardProps) {
  const value = answer?.value ?? null
  const observation = answer?.observation ?? ''
  const evaluated = evaluateAnswer(item, value)
  const failed = evaluated.outcome === 'NON_CONFORMING'
  const needsObservation = itemNeedsObservation(evaluated.outcome)
  const needsPhotos = itemNeedsEvidence(item, evaluated.outcome)
  const requiredPhotos = Math.max(1, item.minPhotos)
  const [dateText, setDateText] = useState(() => isoToInput(value))

  const setValue = (next: string | null) => onAnswer({ value: next, observation })

  return (
    <View style={[styles.card, failed ? styles.cardFailed : null]}>
      <View style={styles.header}>
        <Text style={styles.number}>{index + 1}</Text>
        <View style={styles.headerText}>
          <Text style={styles.text}>
            {item.text}
            {item.required ? <Text style={styles.required}> *</Text> : null}
          </Text>
          {item.guidance ? <Text style={styles.guidance}>{item.guidance}</Text> : null}
          {item.normativeReference ? (
            <Text style={styles.reference}>{item.normativeReference}</Text>
          ) : null}
        </View>
      </View>

      {item.answerType === 'CONFORMITY' ||
      item.answerType === 'YES_NO' ||
      item.answerType === 'OPTION' ? (
        <View style={styles.choices}>
          {choicesOf(item).map((choice) => {
            const selected = value === choice.value
            return (
              <Pressable
                key={choice.value}
                disabled={readOnly}
                onPress={() => setValue(selected ? null : choice.value)}
                style={[
                  styles.choice,
                  selected ? (choice.failing ? styles.choiceFailed : styles.choiceSelected) : null,
                ]}
              >
                <Text
                  style={[
                    styles.choiceLabel,
                    selected ? (choice.failing ? styles.choiceLabelFailed : styles.choiceLabelSelected) : null,
                  ]}
                >
                  {choice.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}

      {item.answerType === 'NUMBER' ? (
        <TextInput
          editable={!readOnly}
          value={value ?? ''}
          onChangeText={(text) => setValue(text.trim() ? text : null)}
          keyboardType="decimal-pad"
          placeholder={
            item.min !== undefined || item.max !== undefined
              ? `Entre ${item.min ?? '-'} e ${item.max ?? '-'}`
              : 'Valor'
          }
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
      ) : null}

      {item.answerType === 'DATE' ? (
        <TextInput
          editable={!readOnly}
          value={dateText}
          onChangeText={(text) => {
            const masked = maskDateInput(text)
            setDateText(masked)
            setValue(masked.length === 10 ? (dateInputToIsoDate(masked) ?? masked) : null)
          }}
          keyboardType="number-pad"
          placeholder="DD/MM/AAAA"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
      ) : null}

      {item.answerType === 'TEXT' ? (
        <TextInput
          editable={!readOnly}
          value={value ?? ''}
          onChangeText={(text) => setValue(text.trim() ? text : null)}
          placeholder="Resposta"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, styles.multiline]}
          multiline
          maxLength={2000}
        />
      ) : null}

      {evaluated.error ? <Text style={styles.error}>{evaluated.error}</Text> : null}
      {failed ? (
        <Text style={styles.failure}>
          Não conformidade {SEVERITY_LABELS[item.severity].toLowerCase()}
        </Text>
      ) : null}

      {value !== null || observation ? (
        <TextInput
          editable={!readOnly}
          value={observation}
          onChangeText={(text) => onAnswer({ value, observation: text })}
          placeholder={needsObservation ? 'Justificativa (obrigatória)' : 'Observação (opcional)'}
          placeholderTextColor={needsObservation ? colors.danger : colors.textMuted}
          style={[
            styles.input,
            styles.multiline,
            needsObservation && !observation.trim() ? styles.inputMissing : null,
          ]}
          multiline
          maxLength={2000}
        />
      ) : null}

      {needsPhotos ? (
        <View style={styles.photos}>
          <Text
            style={[
              styles.photoHint,
              photos.length + sentPhotos < requiredPhotos ? styles.photoHintMissing : null,
            ]}
          >
            {`Foto${requiredPhotos > 1 ? 's' : ''} obrigatória${requiredPhotos > 1 ? 's' : ''}: ${Math.min(
              photos.length + sentPhotos,
              requiredPhotos,
            )}/${requiredPhotos}${cameraOnly ? ' (só câmera)' : ''}`}
          </Text>
          <InspectionPhotos
            itemKey={item.key}
            photos={photos}
            sentCount={sentPhotos}
            cameraOnly={cameraOnly}
            disabled={readOnly}
            onAdd={onAddPhotos}
            onRemove={onRemovePhoto}
          />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  cardFailed: {
    borderColor: '#FECACA',
    backgroundColor: '#FFFBFB',
  },
  header: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  number: {
    minWidth: 22,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  text: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  required: {
    color: colors.danger,
  },
  guidance: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  reference: {
    color: colors.info,
    fontSize: 11,
    fontWeight: '600',
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  choice: {
    minHeight: 40,
    minWidth: 64,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceSelected: {
    borderColor: '#6EE7B7',
    backgroundColor: '#ECFDF5',
  },
  choiceFailed: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  choiceLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  choiceLabelSelected: {
    color: colors.success,
  },
  choiceLabelFailed: {
    color: colors.danger,
  },
  input: {
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
  },
  multiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  inputMissing: {
    borderColor: '#FCA5A5',
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  failure: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  photos: {
    gap: spacing.xs,
  },
  photoHint: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  photoHintMissing: {
    color: colors.warning,
  },
})
