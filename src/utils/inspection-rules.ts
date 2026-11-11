// Same rules the API applies when an inspection is concluded
// (scaffolding-api/src/inspections/domain/template-definition.ts). The device
// checks them first so the inspector fixes everything in the field, offline.
import type {
  AnswerType,
  AvailabilityStatus,
  FailureSeverity,
  InspectionMediaKind,
  InspectionTrigger,
  PackInspection,
  RuleRequirements,
  TemplateDefinition,
  TemplateItem,
} from '@/types/inspection'
import { NOT_APPLICABLE } from '@/types/inspection'

const MAX_TEXT_ANSWER = 2000
const CHOICE_TYPES: readonly AnswerType[] = ['CONFORMITY', 'YES_NO', 'OPTION']
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type AnswerOutcome = 'CONFORMING' | 'NON_CONFORMING' | 'NOT_APPLICABLE' | 'INFO'
export type InspectionResult = 'APPROVED' | 'APPROVED_WITH_RESTRICTION' | 'REJECTED'

export type EvaluatedAnswer = {
  value: string | null
  outcome: AnswerOutcome | null
  error?: string
}

export function evaluateAnswer(item: TemplateItem, raw: string | null | undefined): EvaluatedAnswer {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return { value: null, outcome: null }

  if (value === NOT_APPLICABLE) {
    if (!CHOICE_TYPES.includes(item.answerType) || !item.allowNotApplicable) {
      return { value: null, outcome: null, error: 'Este item não aceita "não se aplica".' }
    }
    return { value, outcome: 'NOT_APPLICABLE' }
  }

  switch (item.answerType) {
    case 'CONFORMITY':
      if (value === 'CONFORMING') return { value, outcome: 'CONFORMING' }
      if (value === 'NON_CONFORMING') return { value, outcome: 'NON_CONFORMING' }
      return { value: null, outcome: null, error: 'Resposta inválida.' }
    case 'YES_NO':
    case 'OPTION': {
      const allowed = item.answerType === 'YES_NO' ? ['YES', 'NO'] : (item.options ?? [])
      if (!allowed.includes(value)) {
        return { value: null, outcome: null, error: 'Resposta fora das opções.' }
      }
      const fails = (item.failingValues ?? []).includes(value)
      return { value, outcome: fails ? 'NON_CONFORMING' : 'CONFORMING' }
    }
    case 'NUMBER': {
      const number = Number(value.replace(',', '.'))
      if (!Number.isFinite(number)) {
        return { value: null, outcome: null, error: 'Informe um número.' }
      }
      const hasRange = item.min !== undefined || item.max !== undefined
      const outside =
        (item.min !== undefined && number < item.min) ||
        (item.max !== undefined && number > item.max)
      return {
        value: String(number),
        outcome: outside ? 'NON_CONFORMING' : hasRange ? 'CONFORMING' : 'INFO',
      }
    }
    case 'DATE': {
      const parsed = new Date(`${value}T00:00:00Z`)
      if (!DATE_PATTERN.test(value) || Number.isNaN(parsed.getTime())) {
        return { value: null, outcome: null, error: 'Informe a data no formato AAAA-MM-DD.' }
      }
      return { value, outcome: 'INFO' }
    }
    case 'TEXT':
      if (value.length > MAX_TEXT_ANSWER) {
        return { value: null, outcome: null, error: `Use no máximo ${MAX_TEXT_ANSWER} caracteres.` }
      }
      return { value, outcome: 'INFO' }
  }
  return { value: null, outcome: null, error: 'Tipo de resposta desconhecido.' }
}

/** Whether the item needs photos with the answer given. */
export function itemNeedsEvidence(item: TemplateItem, outcome: AnswerOutcome | null) {
  return item.evidence === 'ALWAYS' || (item.evidence === 'ON_FAILURE' && outcome === 'NON_CONFORMING')
}

/** "Justifique": failed and "não se aplica" answers need an observation. */
export function itemNeedsObservation(outcome: AnswerOutcome | null) {
  return outcome === 'NON_CONFORMING' || outcome === 'NOT_APPLICABLE'
}

export type CompletionMedia = {
  kind: InspectionMediaKind
  itemKey: string | null
  source: string
}

export type CompletionInput = {
  definition: TemplateDefinition
  answers: { itemKey: string; value: string | null; observation: string | null }[]
  media: CompletionMedia[]
  requirements: RuleRequirements
  allowRestrictedRelease: boolean
  restrictions: string | null
  hasGps: boolean
}

export type CompletionCheck = {
  result: InspectionResult
  errors: string[]
  failedItems: { itemKey: string; severity: FailureSeverity }[]
  answeredItems: number
  countablePhotos: number
}

/** Result the server will record, and every reason that still blocks completion. */
export function checkCompletion(input: CompletionInput): CompletionCheck {
  const errors: string[] = []
  const answers = new Map(input.answers.map((answer) => [answer.itemKey, answer]))
  const countable = input.media.filter(
    (media) =>
      media.kind === 'PHOTO' && (!input.requirements.cameraOnly || media.source === 'CAMERA'),
  )
  const failedItems: CompletionCheck['failedItems'] = []
  let answeredItems = 0

  for (const item of input.definition.items) {
    const answer = answers.get(item.key)
    const evaluated = evaluateAnswer(item, answer?.value)
    const label = `"${item.text}"`
    if (evaluated.error) {
      errors.push(`Item ${label}: ${evaluated.error}`)
      continue
    }
    if (!evaluated.outcome) {
      if (item.required) errors.push(`Responda o item ${label}.`)
      continue
    }
    answeredItems += 1

    const failed = evaluated.outcome === 'NON_CONFORMING'
    if (itemNeedsObservation(evaluated.outcome) && !answer?.observation?.trim()) {
      errors.push(`Justifique a resposta do item ${label}.`)
    }
    if (failed) failedItems.push({ itemKey: item.key, severity: item.severity })

    if (itemNeedsEvidence(item, evaluated.outcome)) {
      const photos = countable.filter((media) => media.itemKey === item.key).length
      const required = Math.max(1, item.minPhotos)
      if (photos < required) {
        errors.push(
          `Anexe ${required} foto(s) ${input.requirements.cameraOnly ? 'tiradas pela câmera ' : ''}no item ${label}.`,
        )
      }
    }
  }

  if (countable.length < input.requirements.minPhotos) {
    errors.push(
      `A inspeção exige ao menos ${input.requirements.minPhotos} foto(s)${input.requirements.cameraOnly ? ' tiradas pela câmera' : ''}.`,
    )
  }
  if (
    input.requirements.inspectorSignature &&
    !input.media.some((media) => media.kind === 'SIGNATURE')
  ) {
    errors.push('A assinatura do inspetor é obrigatória.')
  }
  if (input.requirements.gpsRequired && !input.hasGps) {
    errors.push('A localização (GPS) é obrigatória nesta inspeção.')
  }

  let result: InspectionResult = 'APPROVED'
  if (failedItems.some((item) => item.severity === 'BLOCKING')) {
    result = 'REJECTED'
  } else if (failedItems.some((item) => item.severity === 'RESTRICTIVE')) {
    result = input.allowRestrictedRelease ? 'APPROVED_WITH_RESTRICTION' : 'REJECTED'
  }
  if (result === 'APPROVED_WITH_RESTRICTION' && !input.restrictions?.trim()) {
    errors.push('Descreva as restrições de uso do andaime.')
  }

  return { result, errors, failedItems, answeredItems, countablePhotos: countable.length }
}

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  RELEASED: 'Liberado',
  RELEASED_WITH_RESTRICTION: 'Liberado com restrição',
  AWAITING_RELEASE: 'Aguardando liberação',
  INTERDICTED: 'Interditado',
  NOT_APPLICABLE: 'Fora de uso',
}

export const AVAILABILITY_TONES: Record<
  AvailabilityStatus,
  'success' | 'warning' | 'danger' | 'neutral'
> = {
  RELEASED: 'success',
  RELEASED_WITH_RESTRICTION: 'warning',
  AWAITING_RELEASE: 'warning',
  INTERDICTED: 'danger',
  NOT_APPLICABLE: 'neutral',
}

export const TRIGGER_LABELS: Record<InspectionTrigger, string> = {
  INITIAL_RELEASE: 'Liberação inicial',
  POST_MODIFICATION: 'Pós-modificação',
  PERIODIC: 'Periódica',
  REINSPECTION: 'Reinspeção',
  EVENT: 'Extraordinária',
  AD_HOC: 'Avulsa',
}

export const RESULT_LABELS: Record<InspectionResult, string> = {
  APPROVED: 'Aprovada',
  APPROVED_WITH_RESTRICTION: 'Aprovada com restrição',
  REJECTED: 'Reprovada',
}

export const SEVERITY_LABELS: Record<FailureSeverity, string> = {
  BLOCKING: 'Impeditivo',
  RESTRICTIVE: 'Restritivo',
  OBSERVATION: 'Observação',
}

/** Usable for work: released, with or without restrictions. */
export function isReleased(status: AvailabilityStatus | null | undefined) {
  return status === 'RELEASED' || status === 'RELEASED_WITH_RESTRICTION'
}

/** Overdue first, then the nearest deadline; no deadline last. */
export function compareInspections(left: PackInspection, right: PackInspection) {
  if (left.overdue !== right.overdue) return left.overdue ? -1 : 1
  const leftDue = left.dueAt ? Date.parse(left.dueAt) : Number.POSITIVE_INFINITY
  const rightDue = right.dueAt ? Date.parse(right.dueAt) : Number.POSITIVE_INFINITY
  return leftDue - rightDue
}

export function hasPermission(user: { permissions?: string[] } | null | undefined, key: string) {
  return Boolean(user?.permissions?.includes(key))
}
