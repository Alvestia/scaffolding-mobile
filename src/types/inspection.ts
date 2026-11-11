// Shapes of GET /inspections/offline-pack and of the inspection drafts kept on the
// device. Keep aligned with scaffolding-api/src/inspections.

export type AvailabilityStatus =
  | 'RELEASED'
  | 'RELEASED_WITH_RESTRICTION'
  | 'AWAITING_RELEASE'
  | 'INTERDICTED'
  | 'NOT_APPLICABLE'

export type InspectionTrigger =
  | 'INITIAL_RELEASE'
  | 'POST_MODIFICATION'
  | 'PERIODIC'
  | 'REINSPECTION'
  | 'EVENT'
  | 'AD_HOC'

export type InspectionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'SUPERSEDED'

export type AnswerType = 'CONFORMITY' | 'YES_NO' | 'OPTION' | 'TEXT' | 'NUMBER' | 'DATE'
export type FailureSeverity = 'BLOCKING' | 'RESTRICTIVE' | 'OBSERVATION'
export type EvidenceMode = 'NEVER' | 'ALWAYS' | 'ON_FAILURE'
export type InspectionMediaKind = 'PHOTO' | 'SIGNATURE' | 'DOCUMENT'
export type InspectionMediaSource = 'CAMERA' | 'GALLERY' | 'UNKNOWN'

export const NOT_APPLICABLE = 'NOT_APPLICABLE'

export type TemplateItem = {
  key: string
  section?: string
  text: string
  guidance?: string
  answerType: AnswerType
  required: boolean
  options?: string[]
  failingValues?: string[]
  allowNotApplicable?: boolean
  min?: number
  max?: number
  severity: FailureSeverity
  evidence: EvidenceMode
  minPhotos: number
  normativeReference?: string
}

export type TemplateDefinition = {
  items: TemplateItem[]
}

export type RuleRequirements = {
  minPhotos: number
  cameraOnly: boolean
  gpsRequired: boolean
  inspectorSignature: boolean
}

export type ScaffoldAvailabilityView = {
  status: AvailabilityStatus
  reason: string | null
  restrictions: string | null
  overdue: boolean
  nextDueAt: string | null
}

export type PackTemplate = {
  id: string
  version: number
  name: string
  definition: TemplateDefinition
}

export type PackAnswer = {
  itemKey: string
  value: string | null
  observation: string | null
}

export type PackMedia = {
  id: string
  kind: InspectionMediaKind
  itemKey: string | null
  source: InspectionMediaSource
}

export type PackInspection = {
  id: string
  scaffoldId: string
  trigger: InspectionTrigger
  ruleKey: string | null
  ruleName: string | null
  status: InspectionStatus
  notes: string | null
  dueAt: string | null
  overdueAt: string | null
  overdueAction: 'BLOCK' | 'ALERT'
  overdue: boolean
  startedAt: string | null
  inspectorId: string | null
  inspectorName: string | null
  createdById: string | null
  templateVersionId: string
  updatedAt: string
  requirements: RuleRequirements
  answers: PackAnswer[]
  media: PackMedia[]
}

export type PackScaffold = {
  id: string
  code: string
  description: string | null
  location: string | null
  area: string | null
  currentStatus: string
  plateHash: string | null
  availability: ScaffoldAvailabilityView | null
}

export type InspectionPack = {
  contractId: string
  enabled: boolean
  generatedAt: string
  allowRestrictedRelease: boolean
  templates: PackTemplate[]
  inspections: PackInspection[]
  scaffolds: PackScaffold[]
}

export type AvailabilityMapItem = ScaffoldAvailabilityView & { scaffoldId: string }

export type AvailabilityMap = {
  contractId: string
  enabled: boolean
  generatedAt: string
  items: AvailabilityMapItem[]
}

/** Photo or signature saved on the device, sent when the inspection syncs. */
export type InspectionEvidenceDraft = {
  id: string
  kind: InspectionMediaKind
  itemKey: string | null
  source: InspectionMediaSource
  uri: string
  fileName: string
  mimeType: string
  base64?: string
  capturedAt: string
}

export type InspectionAnswerDraft = {
  value: string | null
  observation: string
}

/** Work in progress on the device, before "Concluir". */
export type InspectionDraft = {
  inspectionId: string
  contractId: string
  /** updatedAt of the inspection when the work started: the optimistic lock. */
  baseUpdatedAt: string
  startedAt: string
  answers: Record<string, InspectionAnswerDraft>
  evidences: InspectionEvidenceDraft[]
  restrictions: string
  notes: string
  savedAt: string
}

export type InspectionGps = {
  latitude: number
  longitude: number
  accuracyM: number | null
}

/** Outbox payload: everything the server needs to record the inspection. */
export type InspectionSubmissionPayload = {
  inspectionId: string
  scaffoldId: string
  scaffoldCode: string
  baseUpdatedAt: string
  startedAt: string
  performedAt: string
  /** false: send answers and files only, someone with release permission concludes. */
  complete: boolean
  answers: { itemKey: string; value: string | null; observation: string | null }[]
  evidences: InspectionEvidenceDraft[]
  restrictions: string | null
  notes: string | null
  gps: InspectionGps | null
  durationSeconds: number | null
  /** Progress kept between sync attempts. */
  answersSent?: boolean
}

export type ManualInspectionPayload = {
  scaffoldId: string
  scaffoldCode: string
  trigger: 'EVENT' | 'AD_HOC'
  reason: string
}

export type ScaffoldInterdictionPayload = {
  scaffoldId: string
  scaffoldCode: string
  reason: string
}

/** GET /inspections/:id, only what the sync reads. */
export type RemoteInspection = {
  id: string
  status: InspectionStatus
  updatedAt: string
  inspectorId: string | null
  clientMutationId: string | null
}
