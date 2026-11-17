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
        '--max-old-space-size=256',
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
  const profiles = JSON.parse(fs.readFileSync(path.join(projectRoot, 'eas.json'), 'utf8')).build
  assert.equal(profiles.preview.android.buildType, 'apk')
  assert.equal(profiles.production.android.buildType, 'app-bundle')
  assert.equal(profiles.preview.env.SCAFFOLD_ANDROID_R8, undefined)
  assert.equal(profiles.production.env.SCAFFOLD_ANDROID_R8, undefined)
  assert.equal(profiles['preview-obfuscated'], undefined)
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
  const preset = 'proguard-android-optimize.txt'
  assert.ok(appGradle.includes(`getDefaultProguardFile("${preset}")`))
  assert.doesNotMatch(appGradle, /minifyEnabled\s+(?:true|false)|shrinkResources\s+(?:true|false)/)
  assert.match(read('android/build.gradle'), /com\.android\.tools\.build:gradle:8\.12\.2/)
  const rules = read('android/app/proguard-rules.pro')
  assert.match(rules, /-keep class com\.swmansion\.reanimated/)
  assert.match(rules, /-keep class com\.facebook\.react\.turbomodule/)
  assert.match(rules, /^-keep interface expo\.modules\.kotlin\.records\.Record$/m)
  assert.match(rules, /^-keep @interface expo\.modules\.kotlin\.records\.Field \{ \*; \}$/m)
  assert.match(
    rules,
    /^-keepnames class \* extends expo\.modules\.kotlin\.exception\.CodedException$/m,
  )
  assert.equal(rules.match(/# @generated begin scaffold-expo-records/g)?.length, 1)
  assert.doesNotMatch(rules, /^\s*-keep(?:,\S+)? class (?:expo|expo\.modules)\.\*\*/m)
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
  assert.equal(manifest.manifest.$['xmlns:tools'], 'http://schemas.android.com/tools')
  const optionalFeatures = [
    'android.hardware.screen.portrait',
    'android.hardware.wifi',
  ]
  for (const name of optionalFeatures) {
    const declarations = (manifest.manifest['uses-feature'] ?? []).filter(
      (entry) => entry.$['android:name'] === name,
    )
    assert.equal(declarations.length, 1, `Expected one explicit declaration for ${name}`)
    assert.equal(declarations[0].$['android:required'], 'false', `${name} must be optional`)
    assert.equal(declarations[0].$['tools:replace'], 'android:required')
  }
  const firstPass = generatedFiles.map(read)
  // Reproduce the previous rollback settings in an existing native project.
  // The next prebuild must remove them, not merely succeed on a clean template.
  fs.writeFileSync(
    path.join(directory, 'android/gradle.properties'),
    properties.replace(
      /^(android\.(?:enableMinifyInReleaseBuilds|enableShrinkResourcesInReleaseBuilds|r8\.optimizedResourceShrinking))=(?:true|false)$/gm,
      '$1=false',
    ),
  )
  fs.writeFileSync(
    path.join(directory, 'android/app/build.gradle'),
    appGradle.replace(preset, 'proguard-android.txt'),
  )
  fs.writeFileSync(
    path.join(directory, 'android/build.gradle'),
    read('android/build.gradle').replace(
      /com\.android\.tools\.build:gradle(?::8\.12\.2)?/,
      'com.android.tools.build:gradle',
    ),
  )
  // Also repair an existing manifest that made these features mandatory,
  // including duplicate declarations left by earlier plugins/prebuilds.
  for (const feature of manifest.manifest['uses-feature'] ?? []) {
    if (optionalFeatures.includes(feature.$['android:name'])) {
      feature.$['android:required'] = 'true'
      delete feature.$['tools:replace']
    }
  }
  manifest.manifest['uses-feature'].push({
    $: { 'android:name': 'android.hardware.wifi', 'android:required': 'true' },
  })
  await AndroidConfig.Manifest.writeAndroidManifestAsync(
    path.join(directory, 'android/app/src/main/AndroidManifest.xml'),
    manifest,
  )
  prebuild()
  assert.deepEqual(
    generatedFiles.map(read),
    firstPass,
    'Prebuild must repair old R8/AGP and required hardware settings without duplicates',
  )
  prebuild()
  assert.deepEqual(generatedFiles.map(read), firstPass, 'Prebuild must remain idempotent')
  process.stdout.write(
    'PASS: Android release R8 enabled by default for preview/production, Expo Record/Field rules, optional portrait/Wi-Fi hardware, old settings repaired, orientation/security and idempotence. No APK/AAB compiled.\n',
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
