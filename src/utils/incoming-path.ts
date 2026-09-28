// Validate before Expo Router/query-string processes externally supplied links.
// Reject malformed percent encodings that trigger the vulnerable decoder fallback.
export function sanitizeIncomingPath(path: string) {
  if (
    path.length > 2048 ||
    Array.from(path).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return '/'
  try {
    decodeURIComponent(path)
    return path
  } catch {
    return '/'
  }
}
