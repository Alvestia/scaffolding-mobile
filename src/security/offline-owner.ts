export type OfflineOwner = {
  tenantId: string
  userId: string
}

let activeOwner: OfflineOwner | null = null
let ownerGeneration = 0

function isSameOwner(left: OfflineOwner | null, right: OfflineOwner | null) {
  return left?.tenantId === right?.tenantId && left?.userId === right?.userId
}

function sanitizeStorageSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export function setOfflineOwner(
  user: { id: string; tenantId: string } | null,
) {
  const nextOwner = user
    ? {
        tenantId: user.tenantId,
        userId: user.id,
      }
    : null

  if (isSameOwner(activeOwner, nextOwner)) {
    return
  }

  activeOwner = nextOwner
  ownerGeneration += 1
}

export function getOfflineOwner() {
  return activeOwner ? { ...activeOwner } : null
}

export function requireOfflineOwner(): OfflineOwner {
  if (!activeOwner) {
    throw new Error('Acesso offline bloqueado: nenhuma identidade autenticada esta ativa.')
  }

  return { ...activeOwner }
}

export function captureOfflineOwnerContext() {
  return {
    owner: requireOfflineOwner(),
    generation: ownerGeneration,
  }
}

export function assertOfflineOwnerContext(context: {
  owner: OfflineOwner
  generation: number
}) {
  if (
    context.generation !== ownerGeneration ||
    !isSameOwner(activeOwner, context.owner)
  ) {
    throw new Error(
      'A sincronizacao foi interrompida porque a identidade ativa mudou.',
    )
  }
}

export function buildOwnedStorageKey(namespace: string) {
  const owner = requireOfflineOwner()
  return [
    sanitizeStorageSegment(namespace),
    sanitizeStorageSegment(owner.tenantId),
    sanitizeStorageSegment(owner.userId),
  ].join('.')
}

export function buildOwnedDirectorySegment() {
  const owner = requireOfflineOwner()
  return `${sanitizeStorageSegment(owner.tenantId)}-${sanitizeStorageSegment(owner.userId)}`
}
