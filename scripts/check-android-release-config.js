/* global __dirname */
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { AndroidConfig } = require('expo/config-plugins')

// Exercise the actual Expo mods without changing the checkout, reading .env, or contacting EAS.
const projectRoot = path.resolve(__dirname, '..')
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-android-release-'))
const keep = process.argv.includes('--keep')
const generatedFiles = [
  'android/gradle.properties',
  'android/build.gradle',
  'android/app/build.gradle',
  'android/app/proguard-rules.pro',
  'android/app/src/main/AndroidManifest.xml',
]

function prebuild() {
  try {
    execFileSync(
      process.execPath,
      [
        path.join(projectRoot, 'node_modules/expo/bin/cli'),
        'prebuild',
        '--platform',
        'android',
        '--no-install',
        '--template',
        path.join(projectRoot, 'node_modules/expo/template.tgz'),
      ],
      {
        cwd: directory,
        env: {
          ...process.env,
          CI: '1',
          EXPO_OFFLINE: '1',
          EXPO_NO_DOTENV: '1',
          EXPO_NO_TELEMETRY: '1',
        },
        stdio: 'pipe',
        timeout: 120_000,
      },
    )
  } catch (error) {
    process.stderr.write(error.stdout ?? '')
    process.stderr.write(error.stderr ?? '')
    throw error
  }
}

async function main() {
  for (const file of ['app.json', 'package.json', 'package-lock.json']) {
    fs.copyFileSync(path.join(projectRoot, file), path.join(directory, file))
  }
  for (const folder of ['assets', 'plugins']) {
    fs.cpSync(path.join(projectRoot, folder), path.join(directory, folder), { recursive: true })
  }
  fs.symlinkSync(
    path.join(projectRoot, 'node_modules'),
    path.join(directory, 'node_modules'),
    'junction',
  )
  prebuild()
  const read = (file) => fs.readFileSync(path.join(directory, file), 'utf8')
  const properties = read('android/gradle.properties')
  for (const [key, value] of Object.entries({
    'android.enableMinifyInReleaseBuilds': 'true',
    'android.enableShrinkResourcesInReleaseBuilds': 'true',
    'android.r8.optimizedResourceShrinking': 'true',
    'android.compileSdkVersion': '36',
    'android.targetSdkVersion': '36',
    edgeToEdgeEnabled: 'true',
  })) {
    const entries = properties.split('\n').filter((line) => line.startsWith(`${key}=`))
    assert.deepEqual(entries, [`${key}=${value}`], `Missing or conflicting property: ${key}`)
  }
  const appGradle = read('android/app/build.gradle')
  assert.match(appGradle, /minifyEnabled enableMinifyInReleaseBuilds/)
  assert.match(appGradle, /shrinkResources enableShrinkResources.toBoolean\(\)/)
  assert.match(appGradle, /proguard-android-optimize\.txt/)
  assert.doesNotMatch(appGradle, /['"]proguard-android\.txt['"]|minifyEnabled\s+false/)
  assert.match(read('android/build.gradle'), /com\.android\.tools\.build:gradle:8\.12\.2/)
  const rules = read('android/app/proguard-rules.pro')
  assert.match(rules, /-keep class com\.swmansion\.reanimated/)
  assert.match(rules, /-keep class com\.facebook\.react\.turbomodule/)
  assert.doesNotMatch(rules, /^\s*-(dontobfuscate|dontoptimize|dontshrink)\b/m)
  const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(
    path.join(directory, 'android/app/src/main/AndroidManifest.xml'),
  )
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest).$
  assert.equal(activity['android:screenOrientation'], 'unspecified')
  assert.equal(activity['android:resizeableActivity'], 'true')
  assert.equal(activity['android:maxAspectRatio'], undefined)
  assert.equal(activity['android:minAspectRatio'], undefined)
  assert.equal(manifest.manifest.application[0].$['android:allowBackup'], 'false')
  assert.equal(manifest.manifest.application[0].$['android:usesCleartextTraffic'], 'false')
  const firstPass = generatedFiles.map(read)
  prebuild()
  assert.deepEqual(generatedFiles.map(read), firstPass, 'Prebuild must remain idempotent')
  process.stdout.write(
    'PASS: Android release R8, resource shrinking, AGP patch, adaptive orientation, edge-to-edge, security settings and repeated prebuild.\n',
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    if (keep) process.stdout.write(`Generated project: ${directory}\n`)
    else fs.rmSync(directory, { recursive: true, force: true })
  })
