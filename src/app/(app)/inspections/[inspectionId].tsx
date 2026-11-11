import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NetworkStatusIndicator } from '@/components/app/network-status-indicator'
import { ChecklistItemCard } from '@/components/inspection/checklist-item-card'
import { DetailHeader } from '@/components/inspection/detail-header'
import { InspectionPhotos } from '@/components/inspection/inspection-photos'
import { SignaturePadModal } from '@/components/inspection/signature-pad-modal'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { colors, radius, spacing } from '@/constants/theme'
import { useInspectionPack, usePendingInspectionWork } from '@/hooks/use-inspections'
import { submitInspection } from '@/services/inspection-actions.service'
import { captureInspectionLocation } from '@/services/inspection-location.service'
import {
  getInspectionDraft,
  persistSignature,
  removeInspectionDraft,
  removeInspectionEvidenceFiles,
  saveInspectionDraft,
} from '@/services/inspections.service'
import { useAuthStore } from '@/store/auth-store'
import { useConnectivityStore } from '@/store/connectivity-store'
import { useOperationalContextStore } from '@/store/operational-context-store'
import type {
  InspectionAnswerDraft,
  InspectionDraft,
  InspectionEvidenceDraft,
  InspectionGps,
  PackInspection,
} from '@/types/inspection'
import { formatShortDateTime, nowIso } from '@/utils/date'
import { getErrorMessage } from '@/utils/error'
import {
  checkCompletion,
  evaluateAnswer,
  hasPermission,
  RESULT_LABELS,
  TRIGGER_LABELS,
} from '@/utils/inspection-rules'

const SAVE_DELAY_MS = 600
const MAX_DURATION_SECONDS = 86_400
const MAX_ERRORS_SHOWN = 8

function draftFromPack(inspection: PackInspection, contractId: string, openedAt: string): InspectionDraft {
  return {
    inspectionId: inspection.id,
    contractId,
    baseUpdatedAt: inspection.updatedAt,
    startedAt: inspection.startedAt ?? openedAt,
    answers: Object.fromEntries(
      inspection.answers.map((answer) => [
        answer.itemKey,
        { value: answer.value, observation: answer.observation ?? '' },
      ]),
    ),
    evidences: [],
    restrictions: '',
    notes: '',
    savedAt: openedAt,
  }
}

function confirm(title: string, message: string, confirmLabel: string) {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Voltar', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    )
  })
}

export default function InspectionExecutionScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { inspectionId = '' } = useLocalSearchParams<{ inspectionId: string }>()
  const user = useAuthStore((state) => state.user)
  const isConnected = useConnectivityStore((state) => state.isConnected)
  const { contractId, unitId } = useOperationalContextStore()
  const pack = useInspectionPack({ contractId, unitId })
  const pending = usePendingInspectionWork()
  const [openedAt] = useState(() => nowIso())
  const [edited, setEdited] = useState<InspectionDraft | null>(null)
  const [signing, setSigning] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const latest = useRef<InspectionDraft | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const submittingRef = useRef(false)

  const draftQuery = useQuery({
    queryKey: ['inspection-draft', inspectionId],
    queryFn: () => getInspectionDraft(inspectionId),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  })

  const inspection = pack.data?.inspections.find((item) => item.id === inspectionId) ?? null
  const template = pack.data?.templates.find((item) => item.id === inspection?.templateVersionId)
  const scaffold = pack.data?.scaffolds.find((item) => item.id === inspection?.scaffoldId)
  const submission = pending.submissions.get(inspectionId)
  const canPerform = hasPermission(user, 'inspection:perform')
  const canRelease = canPerform && hasPermission(user, 'inspection:release')

  const draft =
    edited ??
    draftQuery.data ??
    (inspection && contractId && !draftQuery.isLoading
      ? draftFromPack(inspection, contractId, openedAt)
      : null)
  const hasSavedDraft = Boolean(edited ?? draftQuery.data)

  // Saves what is pending when the screen closes.
  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        if (latest.current) void saveInspectionDraft(latest.current).catch(() => undefined)
      }
    },
    [],
  )

  const update = useCallback(
    (change: (current: InspectionDraft) => InspectionDraft) => {
      const current = latest.current ?? draft
      if (!current) return
      const next = { ...change(current), savedAt: nowIso() }
      latest.current = next
      setEdited(next)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null
        void saveInspectionDraft(next).catch(() => {
          Alert.alert('Rascunho não salvo', 'Não foi possível guardar o rascunho no aparelho.')
        })
      }, SAVE_DELAY_MS)
    },
    [draft],
  )

  const serverMedia = useMemo(() => inspection?.media ?? [], [inspection])
  const check = useMemo(() => {
    if (!inspection || !template || !draft) return null
    return checkCompletion({
      definition: template.definition,
      answers: template.definition.items.map((item) => ({
        itemKey: item.key,
        value: draft.answers[item.key]?.value ?? null,
        observation: draft.answers[item.key]?.observation ?? null,
      })),
      media: [...serverMedia, ...draft.evidences],
      requirements: inspection.requirements,
      allowRestrictedRelease: pack.data?.allowRestrictedRelease ?? false,
      restrictions: draft.restrictions,
      // Collected when concluding, only if the rule requires it.
      hasGps: true,
    })
  }, [draft, inspection, pack.data?.allowRestrictedRelease, serverMedia, template])

  if (!inspection || !template || !draft || !contractId || !unitId) {
    return (
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
        <View style={styles.page}>
          <DetailHeader title="Inspeção" />
          {submission ? (
            <Banner
              tone="info"
              title="Inspeção feita no aparelho"
              description="Aguardando envio ao servidor. Acompanhe em Pendências."
            />
          ) : (
            <EmptyState
              title={pack.isLoading || draftQuery.isLoading ? 'Carregando' : 'Inspeção não encontrada'}
              description="Ela pode já ter sido concluída ou cancelada. Sincronize para atualizar a lista."
            />
          )}
        </View>
      </SafeAreaView>
    )
  }

  const readOnly = Boolean(submission) || !canPerform || submitting
  const requirements = inspection.requirements
  const items = template.definition.items
  const answered = items.filter((item) => evaluateAnswer(item, draft.answers[item.key]?.value).outcome).length
  const signature = draft.evidences.find((evidence) => evidence.kind === 'SIGNATURE')
  const serverSignature = serverMedia.some((media) => media.kind === 'SIGNATURE')
  const generalPhotos = draft.evidences.filter((evidence) => evidence.kind === 'PHOTO' && !evidence.itemKey)
  const sentGeneralPhotos = serverMedia.filter((media) => media.kind === 'PHOTO' && !media.itemKey).length
  const takenByOther = Boolean(inspection.inspectorId && inspection.inspectorId !== user?.id)

  const setAnswer = (itemKey: string, answer: InspectionAnswerDraft) =>
    update((current) => ({ ...current, answers: { ...current.answers, [itemKey]: answer } }))

  const addEvidences = (evidences: InspectionEvidenceDraft[]) =>
    update((current) => ({ ...current, evidences: [...current.evidences, ...evidences] }))

  const removeEvidence = (evidence: InspectionEvidenceDraft) => {
    update((current) => ({
      ...current,
      evidences: current.evidences.filter((item) => item.id !== evidence.id),
    }))
    void removeInspectionEvidenceFiles([evidence]).catch(() => undefined)
  }

  const saveSignature = async (pngBase64: string) => {
    const evidence = await persistSignature(pngBase64)
    const previous = (latest.current ?? draft).evidences.filter((item) => item.kind === 'SIGNATURE')
    update((current) => ({
      ...current,
      evidences: [...current.evidences.filter((item) => item.kind !== 'SIGNATURE'), evidence],
    }))
    void removeInspectionEvidenceFiles(previous).catch(() => undefined)
    setSigning(false)
  }

  const discardDraft = async () => {
    const ok = await confirm(
      'Descartar rascunho?',
      'As respostas, fotos e a assinatura feitas neste aparelho serão apagadas.',
      'Descartar',
    )
    if (!ok) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
    const evidences = (latest.current ?? draft).evidences
    latest.current = null
    setEdited(null)
    await removeInspectionDraft(inspection.id)
    await removeInspectionEvidenceFiles(evidences).catch(() => undefined)
    queryClient.setQueryData(['inspection-draft', inspectionId], null)
  }

  const finish = async (complete: boolean) => {
    if (submittingRef.current || !check) return
    const current = latest.current ?? draft
    const answerErrors = items
      .map((item) => {
        const error = evaluateAnswer(item, current.answers[item.key]?.value).error
        return error ? `Item "${item.text}": ${error}` : null
      })
      .filter((error): error is string => Boolean(error))
    const errors = complete ? check.errors : answerErrors
    if (errors.length > 0) {
      Alert.alert(
        complete ? 'Falta pouco para concluir' : 'Corrija as respostas',
        errors.slice(0, MAX_ERRORS_SHOWN).join('\n') +
          (errors.length > MAX_ERRORS_SHOWN ? `\n...e mais ${errors.length - MAX_ERRORS_SHOWN}.` : ''),
      )
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    try {
      const confirmed = await confirm(
        complete ? `Concluir como "${RESULT_LABELS[check.result]}"?` : 'Enviar sem concluir?',
        complete
          ? 'Depois de concluída, a inspeção não pode ser editada. O resultado muda a disponibilidade do andaime.'
          : 'As respostas e fotos vão para o servidor. Alguém com permissão de liberação conclui a inspeção.',
        complete ? 'Concluir' : 'Enviar',
      )
      if (!confirmed) return

      let gps: InspectionGps | null = null
      if (complete && requirements.gpsRequired) gps = await captureInspectionLocation()

      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = null
      const performedAt = nowIso()
      const duration = Math.round((Date.parse(performedAt) - Date.parse(current.startedAt)) / 1000)
      await submitInspection(
        { contractId, unitId },
        {
          inspectionId: inspection.id,
          scaffoldId: inspection.scaffoldId,
          scaffoldCode: scaffold?.code ?? '',
          baseUpdatedAt: current.baseUpdatedAt,
          startedAt: current.startedAt,
          performedAt,
          complete,
          answers: items.map((item) => ({
            itemKey: item.key,
            value: current.answers[item.key]?.value?.trim() || null,
            observation: current.answers[item.key]?.observation?.trim() || null,
          })),
          evidences: current.evidences,
          restrictions:
            complete && check.result === 'APPROVED_WITH_RESTRICTION'
              ? current.restrictions.trim()
              : null,
          notes: current.notes.trim() || null,
          gps,
          durationSeconds: Number.isFinite(duration)
            ? Math.min(Math.max(duration, 0), MAX_DURATION_SECONDS)
            : null,
        },
        isConnected,
      )
      latest.current = null
      queryClient.setQueryData(['inspection-draft', inspectionId], null)
      router.back()
      Alert.alert(
        complete ? 'Inspeção concluída' : 'Respostas guardadas',
        isConnected
          ? 'Enviando ao servidor. Acompanhe em Pendências.'
          : 'Será enviada quando houver conexão. Acompanhe em Pendências.',
      )
    } catch (error) {
      Alert.alert('Não foi possível concluir', getErrorMessage(error, 'Tente novamente.'))
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const requirementText = [
    requirements.minPhotos > 0 ? `${requirements.minPhotos} foto(s)` : null,
    requirements.cameraOnly ? 'fotos só pela câmera' : null,
    requirements.inspectorSignature ? 'assinatura' : null,
    requirements.gpsRequired ? 'localização (GPS) ao concluir' : null,
  ].filter(Boolean)

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <KeyboardAvoider style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.page}>
            <DetailHeader
              title={`${TRIGGER_LABELS[inspection.trigger]} • ${scaffold?.code ?? ''}`}
              subtitle={`${template.name} v${template.version}`}
            />
            <NetworkStatusIndicator />

            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.code}>{scaffold?.code ?? 'Andaime'}</Text>
                {inspection.overdue ? (
                  <StatusBadge label="Vencida" tone="danger" />
                ) : (
                  <StatusBadge
                    label={inspection.status === 'IN_PROGRESS' ? 'Em andamento' : 'Pendente'}
                    tone={inspection.status === 'IN_PROGRESS' ? 'info' : 'warning'}
                  />
                )}
              </View>
              {scaffold?.location ? <Text style={styles.meta}>{scaffold.location}</Text> : null}
              <Text style={[styles.meta, inspection.overdue ? styles.danger : null]}>
                {inspection.dueAt ? `Prazo ${formatShortDateTime(inspection.dueAt)}` : 'Sem prazo'}
                {inspection.ruleName ? ` • ${inspection.ruleName}` : ''}
              </Text>
              {inspection.notes ? <Text style={styles.meta}>Motivo: {inspection.notes}</Text> : null}
              {requirementText.length > 0 ? (
                <Text style={styles.requirements}>Exige: {requirementText.join(', ')}.</Text>
              ) : null}
            </View>

            {submission ? (
              <Banner
                tone="info"
                title="Já registrada neste aparelho"
                description="Aguardando envio ao servidor. Acompanhe em Pendências."
              />
            ) : null}
            {!canPerform ? (
              <Banner
                tone="warning"
                title="Somente leitura"
                description="Seu perfil não tem permissão para realizar inspeções."
              />
            ) : null}
            {takenByOther && !submission ? (
              <Banner
                tone="warning"
                title={`Em andamento com ${inspection.inspectorName ?? 'outra pessoa'}`}
                description="Se ela alterar a inspeção antes do seu envio, o envio para em Pendências para revisão."
              />
            ) : null}
            {canPerform && !canRelease && !submission ? (
              <Banner
                tone="info"
                title="Conclusão exige permissão de liberação"
                description="Você pode preencher e enviar as respostas; quem tem a permissão conclui."
              />
            ) : null}

            <Text style={styles.progress}>
              {answered}/{items.length} itens respondidos
              {hasSavedDraft ? ' • rascunho salvo no aparelho' : ''}
            </Text>

            {items.map((item, index) => {
              const showSection = item.section && item.section !== items[index - 1]?.section
              return (
                <Fragment key={item.key}>
                  {showSection ? <Text style={styles.section}>{item.section}</Text> : null}
                  <ChecklistItemCard
                    item={item}
                    index={index}
                    answer={draft.answers[item.key]}
                    photos={draft.evidences.filter(
                      (evidence) => evidence.kind === 'PHOTO' && evidence.itemKey === item.key,
                    )}
                    sentPhotos={
                      serverMedia.filter((media) => media.kind === 'PHOTO' && media.itemKey === item.key)
                        .length
                    }
                    cameraOnly={requirements.cameraOnly}
                    readOnly={readOnly}
                    onAnswer={(answer) => setAnswer(item.key, answer)}
                    onAddPhotos={addEvidences}
                    onRemovePhoto={removeEvidence}
                  />
                </Fragment>
              )
            })}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Fotos gerais</Text>
              <Text style={styles.meta}>
                {requirements.minPhotos > 0
                  ? `A inspeção exige ${requirements.minPhotos} foto(s) no total${requirements.cameraOnly ? ', tiradas pela câmera' : ''}.`
                  : 'Opcional: fotos do andaime como um todo.'}
              </Text>
              <InspectionPhotos
                itemKey={null}
                photos={generalPhotos}
                sentCount={sentGeneralPhotos}
                cameraOnly={requirements.cameraOnly}
                disabled={readOnly}
                onAdd={addEvidences}
                onRemove={removeEvidence}
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                Assinatura do inspetor{requirements.inspectorSignature ? ' *' : ''}
              </Text>
              {signature ? (
                <Image source={{ uri: signature.uri }} style={styles.signature} contentFit="contain" />
              ) : serverSignature ? (
                <Text style={styles.sent}>Assinatura já enviada.</Text>
              ) : (
                <Text style={styles.meta}>
                  {requirements.inspectorSignature ? 'Obrigatória para concluir.' : 'Opcional.'}
                </Text>
              )}
              {readOnly ? null : (
                <Button variant="secondary" onPress={() => setSigning(true)}>
                  {signature ? 'Assinar de novo' : 'Assinar'}
                </Button>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Resultado previsto</Text>
              {check ? (
                <StatusBadge
                  label={RESULT_LABELS[check.result]}
                  tone={
                    check.result === 'APPROVED'
                      ? 'success'
                      : check.result === 'REJECTED'
                        ? 'danger'
                        : 'warning'
                  }
                />
              ) : null}
              {check?.result === 'APPROVED_WITH_RESTRICTION' ? (
                <TextInput
                  editable={!readOnly}
                  value={draft.restrictions}
                  onChangeText={(text) => update((current) => ({ ...current, restrictions: text }))}
                  placeholder="Restrições de uso (obrigatório)"
                  placeholderTextColor={colors.danger}
                  style={[styles.input, styles.multiline]}
                  multiline
                  maxLength={2000}
                />
              ) : null}
              <TextInput
                editable={!readOnly}
                value={draft.notes}
                onChangeText={(text) => update((current) => ({ ...current, notes: text }))}
                placeholder="Observações gerais (opcional)"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.multiline]}
                multiline
                maxLength={2000}
              />
              {check && check.errors.length > 0 && !readOnly ? (
                <View style={styles.errors}>
                  {check.errors.slice(0, MAX_ERRORS_SHOWN).map((error) => (
                    <View key={error} style={styles.errorRow}>
                      <Ionicons name="ellipse" size={6} color={colors.warning} />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  ))}
                  {check.errors.length > MAX_ERRORS_SHOWN ? (
                    <Text style={styles.errorText}>
                      ...e mais {check.errors.length - MAX_ERRORS_SHOWN} pendência(s).
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>

            {readOnly ? null : (
              <View style={styles.actions}>
                {canRelease ? (
                  <Button onPress={() => void finish(true)} loading={submitting}>
                    Concluir inspeção
                  </Button>
                ) : (
                  <Button onPress={() => void finish(false)} loading={submitting}>
                    Enviar respostas sem concluir
                  </Button>
                )}
                {hasSavedDraft ? (
                  <Pressable onPress={() => void discardDraft()} style={styles.discard}>
                    <Text style={styles.discardText}>Descartar rascunho</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoider>

      <SignaturePadModal
        visible={signing}
        signerName={user?.name ?? 'Inspetor'}
        onCancel={() => setSigning(false)}
        onSave={saveSignature}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    paddingBottom: spacing.xxxl,
  },
  page: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  card: {
    gap: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  code: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  danger: {
    color: colors.danger,
    fontWeight: '700',
  },
  requirements: {
    color: colors.primaryStrong,
    fontSize: 12,
    fontWeight: '700',
  },
  progress: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  section: {
    color: colors.primaryStrong,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  signature: {
    width: '100%',
    height: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  sent: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '700',
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
    minHeight: 64,
    textAlignVertical: 'top',
  },
  errors: {
    gap: 6,
    borderRadius: radius.md,
    backgroundColor: '#FFFBEB',
    padding: spacing.md,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    flex: 1,
    color: colors.warning,
    fontSize: 12,
    lineHeight: 17,
  },
  actions: {
    gap: spacing.sm,
  },
  discard: {
    alignSelf: 'center',
    padding: spacing.sm,
  },
  discardText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
})
