const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const MAX_IMAGE_BYTES = 50 * 1024 * 1024

// Keep aligned with scaffolding-api/src/files/multer-config.ts.
export function validateEvidenceAsset(asset: {
  mimeType?: string | null
  base64?: string | null
  fileSize?: number
}) {
  if (!asset.mimeType || !ALLOWED_IMAGE_TYPES.has(asset.mimeType)) {
    throw new Error('Use uma foto JPEG, PNG, GIF ou WebP.')
  }
  if (!asset.base64) throw new Error('Não foi possível ler a foto selecionada.')
  const padding = asset.base64.endsWith('==') ? 2 : asset.base64.endsWith('=') ? 1 : 0
  const decodedSize = Math.floor((asset.base64.length * 3) / 4) - padding
  if ((asset.fileSize ?? decodedSize) > MAX_IMAGE_BYTES || decodedSize > MAX_IMAGE_BYTES) {
    throw new Error('Cada foto deve ter no máximo 50 MB.')
  }
}
