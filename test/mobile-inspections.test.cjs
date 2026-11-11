const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { test } = require('node:test')
const { loadSource } = require('./helpers/load-source.cjs')

const rules = loadSource('utils/inspection-rules.ts')
const plate = loadSource('utils/plate-qr.ts')

const requirements = { minPhotos: 0, cameraOnly: false, gpsRequired: false, inspectorSignature: false }
const definition = {
  items: [
    { key: 'base', text: 'Base nivelada', answerType: 'CONFORMITY', required: true, severity: 'BLOCKING', evidence: 'ON_FAILURE', minPhotos: 1 },
    { key: 'rodape', text: 'Rodapé', answerType: 'CONFORMITY', required: true, severity: 'RESTRICTIVE', evidence: 'NEVER', minPhotos: 0, allowNotApplicable: true },
    { key: 'altura', text: 'Altura', answerType: 'NUMBER', required: false, severity: 'OBSERVATION', evidence: 'NEVER', minPhotos: 0, min: 1, max: 30 },
  ],
}
const answer = (itemKey, value, observation = null) => ({ itemKey, value, observation })
const check = (overrides = {}) =>
  rules.checkCompletion({
    definition,
    answers: [answer('base', 'CONFORMING'), answer('rodape', 'CONFORMING')],
    media: [],
    requirements,
    allowRestrictedRelease: false,
    restrictions: null,
    hasGps: false,
    ...overrides,
  })

test('the device applies the same completion rules as the API', () => {
  assert.deepEqual(check().errors, [])
  assert.equal(check().result, 'APPROVED')

  assert.match(check({ answers: [] }).errors.join(' '), /Responda o item "Base nivelada"/)

  const failed = check({ answers: [answer('base', 'NON_CONFORMING'), answer('rodape', 'CONFORMING')] })
  assert.equal(failed.result, 'REJECTED')
  assert.ok(failed.errors.some((error) => error.includes('Justifique')))
  assert.ok(failed.errors.some((error) => error.includes('Anexe 1 foto')))

  const justified = check({
    answers: [answer('base', 'NON_CONFORMING', 'Calço solto'), answer('rodape', 'CONFORMING')],
    media: [{ kind: 'PHOTO', itemKey: 'base', source: 'GALLERY' }],
  })
  assert.deepEqual(justified.errors, [])
  const cameraOnly = check({
    answers: [answer('base', 'NON_CONFORMING', 'Calço solto'), answer('rodape', 'CONFORMING')],
    media: [{ kind: 'PHOTO', itemKey: 'base', source: 'GALLERY' }],
    requirements: { ...requirements, cameraOnly: true },
  })
  assert.ok(cameraOnly.errors.some((error) => error.includes('tiradas pela câmera')), 'gallery photos do not count')

  const restrictive = [answer('base', 'CONFORMING'), answer('rodape', 'NON_CONFORMING', 'Falta rodapé')]
  assert.equal(check({ answers: restrictive }).result, 'REJECTED')
  const restricted = check({ answers: restrictive, allowRestrictedRelease: true })
  assert.equal(restricted.result, 'APPROVED_WITH_RESTRICTION')
  assert.ok(restricted.errors.some((error) => error.includes('restrições')))
  assert.deepEqual(
    check({ answers: restrictive, allowRestrictedRelease: true, restrictions: 'Sem carga no 3º nível' }).errors,
    [],
  )

  const strict = check({ requirements: { minPhotos: 2, cameraOnly: false, gpsRequired: true, inspectorSignature: true } })
  assert.equal(strict.errors.length, 3, 'photos, signature and GPS')

  assert.equal(rules.evaluateAnswer(definition.items[2], '45').outcome, 'NON_CONFORMING')
  assert.equal(rules.evaluateAnswer(definition.items[2], '2,5').value, '2.5')
  assert.ok(rules.evaluateAnswer(definition.items[0], 'NOT_APPLICABLE').error)
  assert.equal(rules.evaluateAnswer(definition.items[1], 'NOT_APPLICABLE').outcome, 'NOT_APPLICABLE')
})

test('overdue inspections come first, then the nearest deadline', () => {
  const items = [
    { id: 'later', overdue: false, dueAt: '2026-11-20T10:00:00Z' },
    { id: 'none', overdue: false, dueAt: null },
    { id: 'overdue', overdue: true, dueAt: '2026-11-01T10:00:00Z' },
    { id: 'soon', overdue: false, dueAt: '2026-11-12T10:00:00Z' },
  ]
  assert.deepEqual(items.sort(rules.compareInspections).map((item) => item.id), ['overdue', 'soon', 'later', 'none'])
})

test('the plate QR Code is recognised by the same hash the API sends', () => {
  const token = 'Ab3_-xYz0123456789abcdefghijklmn'
  assert.equal(token.length, 32)
  assert.equal(plate.extractPlateToken(`https://scaffold.example.com/placa/${token}`), token)
  assert.equal(plate.extractPlateToken(`https://scaffold.example.com/placa/${token}?utm=1`), token)
  assert.equal(plate.extractPlateToken(token), token)
  assert.equal(plate.extractPlateToken('https://example.com/placa/curto'), null)
  assert.equal(plate.extractPlateToken('qualquer texto'), null)
  assert.equal(plate.plateTokenHash(token), createHash('sha256').update(token).digest('hex'))
})

function syncHarness({ remote, failUploadAt = -1, permissions = [] } = {}) {
  const owner = loadSource('security/offline-owner.ts')
  owner.setOfflineOwner({ id: 'user', tenantId: 'tenant' })
  const calls = []
  let current = { id: 'insp', status: 'PENDING', updatedAt: '2026-11-11T10:00:00.000Z', inspectorId: null, clientMutationId: null, ...remote }
  let uploads = 0
  const bump = (patch) => {
    current = { ...current, ...patch, updatedAt: new Date(Date.parse(current.updatedAt) + 1000).toISOString() }
    return current
  }
  const services = {
    getRemoteInspection: async () => {
      calls.push(['get'])
      return current
    },
    startRemoteInspection: async (id, body) => {
      calls.push(['start', body])
      assert.equal(body.expectedUpdatedAt, current.updatedAt)
      return bump({ status: 'IN_PROGRESS', inspectorId: 'user' })
    },
    saveRemoteAnswers: async (id, body) => {
      calls.push(['answers', body])
      assert.equal(body.expectedUpdatedAt, current.updatedAt)
      return bump({ status: 'IN_PROGRESS', inspectorId: 'user' })
    },
    uploadInspectionEvidence: async (id, evidence, key) => {
      if (uploads++ === failUploadAt) throw Object.assign(new Error('offline'), {})
      calls.push(['upload', evidence.id, key])
      return {}
    },
    completeRemoteInspection: async (id, body) => {
      calls.push(['complete', body])
      assert.equal(body.expectedUpdatedAt, current.updatedAt)
      return bump({ status: 'COMPLETED', clientMutationId: body.clientMutationId })
    },
    createManualInspection: async (payload, key) => calls.push(['manual', key]),
    interdictScaffold: async () => {
      calls.push(['interdict'])
      throw Object.assign(new Error('O andaime já está interditado.'), { response: { status: 409 } })
    },
    removeInspectionEvidenceFiles: async (evidences) => calls.push(['cleanup', evidences.map((e) => e.id)]),
    fetchInspectionPack: async () => calls.push(['pack']),
    fetchAvailabilityMap: async () => calls.push(['map']),
  }
  const outbox = {
    updatePayload: async (localId, payload) => calls.push(['payload', payload]),
    renewLease: async () => {},
    remove: async (localId) => calls.push(['removed', localId]),
  }
  const sync = loadSource('sync/inspection-sync.ts', {
    '@/security/offline-owner': owner,
    '@/services/inspections.service': services,
    '@/database/repositories/outbox-repository': { outboxRepository: outbox },
    '@/store/auth-store': { useAuthStore: { getState: () => ({ user: { permissions } }) } },
  })
  return { sync, calls, context: owner.captureOfflineOwnerContext() }
}

const submission = (payload = {}) => ({
  localId: 'inspection_1',
  idempotencyKey: 'inspection_1',
  leaseOwner: 'lease',
  payload: {
    inspectionId: 'insp',
    scaffoldId: 'scaffold',
    scaffoldCode: 'AND-01',
    baseUpdatedAt: '2026-11-11T10:00:00.000Z',
    startedAt: '2026-11-11T09:30:00.000Z',
    performedAt: '2026-11-11T09:50:00.000Z',
    complete: true,
    answers: [{ itemKey: 'base', value: 'CONFORMING', observation: null }],
    evidences: [{ id: 'photo1' }, { id: 'sign1' }],
    restrictions: null,
    notes: null,
    gps: { latitude: -23.5, longitude: -46.6, accuracyM: 8 },
    durationSeconds: 1200,
    ...payload,
  },
})

test('an inspection done offline is started, answered, uploaded and concluded once', async () => {
  const { sync, calls, context } = syncHarness()
  await sync.syncInspectionSubmission(submission(), context)
  const steps = calls.map(([name]) => name)
  assert.deepEqual(steps, ['get', 'start', 'answers', 'payload', 'upload', 'upload', 'get', 'complete', 'cleanup', 'removed'])
  assert.equal(calls[1][1].startedAt, '2026-11-11T09:30:00.000Z', 'device start time')
  assert.equal(calls[4][2], 'inspection_1-photo1', 'upload key per file')
  const complete = calls.find(([name]) => name === 'complete')[1]
  assert.equal(complete.clientMutationId, 'inspection_1')
  assert.equal(complete.latitude, -23.5)
  assert.equal(complete.gpsAccuracyM, 8)
  assert.equal(complete.durationSeconds, 1200)
})

test('a resend after the server already concluded it only cleans up', async () => {
  const { sync, calls, context } = syncHarness({ remote: { status: 'COMPLETED', clientMutationId: 'inspection_1' } })
  await sync.syncInspectionSubmission(submission(), context)
  assert.deepEqual(calls.map(([name]) => name), ['get', 'cleanup', 'removed'])
})

test('concluded or taken by someone else stops as a conflict, without writing', async () => {
  for (const remote of [
    { status: 'COMPLETED', clientMutationId: 'other' },
    { status: 'IN_PROGRESS', inspectorId: 'other-user', updatedAt: '2026-11-11T11:00:00.000Z' },
  ]) {
    const { sync, calls, context } = syncHarness({ remote })
    await assert.rejects(sync.syncInspectionSubmission(submission(), context), (error) => {
      assert.equal(error.response.status, 409)
      return true
    })
    assert.deepEqual(calls.map(([name]) => name), ['get'])
  }
})

test('my own earlier progress on the server is not a conflict', async () => {
  const { sync, calls, context } = syncHarness({
    remote: { status: 'IN_PROGRESS', inspectorId: 'user', updatedAt: '2026-11-11T11:00:00.000Z' },
  })
  await sync.syncInspectionSubmission(submission(), context)
  assert.ok(calls.some(([name]) => name === 'complete'))
  assert.ok(!calls.some(([name]) => name === 'start'), 'already in progress')
})

test('a failed upload keeps only the files still to send and does not resend the answers', async () => {
  const { sync, calls, context } = syncHarness({ failUploadAt: 1 })
  await assert.rejects(sync.syncInspectionSubmission(submission(), context), /offline/)
  const saved = calls.filter(([name]) => name === 'payload').at(-1)[1]
  assert.equal(saved.answersSent, true)
  assert.deepEqual(saved.evidences.map((e) => e.id), ['sign1'])
  assert.deepEqual(calls.find(([name]) => name === 'cleanup')[1], ['photo1'])
  assert.ok(!calls.some(([name]) => name === 'removed'))

  const retry = syncHarness({ remote: { status: 'IN_PROGRESS', inspectorId: 'user', updatedAt: '2026-11-11T10:00:02.000Z' } })
  await retry.sync.syncInspectionSubmission({ ...submission(), payload: saved }, retry.context)
  assert.deepEqual(retry.calls.map(([name]) => name), ['get', 'upload', 'get', 'complete', 'cleanup', 'removed'])
})

test('answers sent without concluding skip the completion', async () => {
  const { sync, calls, context } = syncHarness()
  await sync.syncInspectionSubmission(submission({ complete: false, evidences: [] }), context)
  assert.ok(!calls.some(([name]) => name === 'complete'))
  assert.ok(calls.some(([name]) => name === 'removed'))
})

test('manual inspection resends with its key; an interdiction already in place is done', async () => {
  const { sync, calls, context } = syncHarness()
  await sync.syncManualInspection({ localId: 'inspmanual_1', idempotencyKey: 'inspmanual_1', payload: {} }, context)
  assert.deepEqual(calls.at(-2), ['manual', 'inspmanual_1'])
  await sync.syncScaffoldInterdiction({ localId: 'interdiction_1', payload: { scaffoldId: 's', reason: 'Risco' } }, context)
  assert.deepEqual(calls.at(-1), ['removed', 'interdiction_1'])
})

test('the offline copy is refreshed only with the permissions the user has', async () => {
  const scope = { contractId: 'contract', unitId: 'unit' }
  const viewer = syncHarness({ permissions: ['inspection:view', 'scaffold:view'] })
  await viewer.sync.syncInspectionData(viewer.context, scope)
  assert.deepEqual(viewer.calls.map(([name]) => name).sort(), ['map', 'pack'])
  const executor = syncHarness({ permissions: ['scaffold:view'] })
  await executor.sync.syncInspectionData(executor.context, scope)
  assert.deepEqual(executor.calls.map(([name]) => name), ['map'])
})
