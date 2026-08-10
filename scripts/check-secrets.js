const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const ignoredDirectories = new Set([
  '.expo',
  '.git',
  'android',
  'dist',
  'ios',
  'node_modules',
  'web-build',
])

function shouldIgnoreFile(name) {
  if (name === '.env.example') return false
  if (name === '.env' || name.startsWith('.env.')) return true

  return name.endsWith('.jks') || name.endsWith('.keystore') || name.endsWith('.p12')
}

function listProjectFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue

    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      listProjectFiles(absolutePath, files)
    } else if (!shouldIgnoreFile(entry.name) && fs.statSync(absolutePath).size <= 2_000_000) {
      files.push(path.relative(root, absolutePath))
    }
  }

  return files
}

const files = listProjectFiles(root)

const patterns = [
  { name: 'private key', regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { name: 'AWS access key', regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { name: 'GitHub token', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g },
  { name: 'Slack token', regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
]

const secretAssignment =
  /\b(JWT_SECRET|FILE_URL_SIGNING_SECRET|EXEC_ENTRY_APPROVAL_SIGNATURE_SECRET|CONTROL_PLANE_INTERNAL_API_KEY|DATABASE_URL|SMTP_PASS)\b\s*[:=]\s*["']?([^\s"',;]{20,})/g

const findings = []
for (const file of files) {
  let content
  try {
    content = fs.readFileSync(path.join(root, file), 'utf8')
  } catch {
    continue
  }
  if (content.includes('\0')) continue

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern.regex)) {
      const line = content.slice(0, match.index).split('\n').length
      findings.push(file + ':' + line + ' possible ' + pattern.name)
    }
  }

  for (const match of content.matchAll(secretAssignment)) {
    const value = match[2].toLowerCase()
    if (value.includes('change_me') || value.includes('example')) continue
    const line = content.slice(0, match.index).split('\n').length
    findings.push(file + ':' + line + ' hard-coded ' + match[1])
  }
}

if (findings.length > 0) {
  console.error('Potential committed secrets found:')
  findings.forEach((finding) => console.error('- ' + finding))
  process.exit(1)
}

console.log('Secret scan passed for ' + files.length + ' project files.')
