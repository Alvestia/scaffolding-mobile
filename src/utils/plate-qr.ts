import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

// The plate QR Code opens <front>/placa/<token> (scaffolding-api/docs/placa-andaime.md).
const PLATE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/
const PLATE_PATH_PATTERN = /\/placa\/([A-Za-z0-9_-]{32})(?:[/?#]|$)/

/** Token read from the plate QR Code, or null when it is not a scaffold plate. */
export function extractPlateToken(data: string | null | undefined): string | null {
  const text = data?.trim() ?? ''
  if (!text) return null
  if (PLATE_TOKEN_PATTERN.test(text)) return text
  const match = PLATE_PATH_PATTERN.exec(text)
  return match ? match[1] : null
}

/** Same hash the API sends in the offline pack (SHA-256 of the token, hex). */
export function plateTokenHash(token: string) {
  return bytesToHex(sha256(new TextEncoder().encode(token)))
}
