const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withGradleProperties,
  withProjectBuildGradle,
  withDangerousMod,
} = require('expo/config-plugins')
const fs = require('node:fs/promises')
const path = require('node:path')

// R8 is the default for all release builds after device validation on 2026-11-17.
// Backport the upstream Expo rules missing in SDK 55. Field.key is read through
// Kotlin reflection; renaming Field can throw NPE while converting SQLite options.
// https://github.com/expo/expo/blob/main/packages/expo-modules-core/android/proguard-rules.pro
const recordRules = `# @generated begin scaffold-expo-records
-keep interface expo.modules.kotlin.records.Record
-keep @interface expo.modules.kotlin.records.Field { *; }
-keepnames class * extends expo.modules.kotlin.exception.CodedException
# @generated end scaffold-expo-records`

module.exports = function withAndroidRelease(config) {
  const releaseProperties = {
    edgeToEdgeEnabled: 'true',
    'android.enableMinifyInReleaseBuilds': 'true',
    'android.enableShrinkResourcesInReleaseBuilds': 'true',
    'android.r8.optimizedResourceShrinking': 'true',
  }
  const preset = 'proguard-android-optimize.txt'
  config = withGradleProperties(config, (config) => {
    config.modResults = config.modResults.filter((entry) => !(entry.key in releaseProperties))
    for (const [key, value] of Object.entries(releaseProperties)) {
      config.modResults.push({ type: 'property', key, value })
    }
    return config
  })

  config = withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents.replace(
      /getDefaultProguardFile\(\s*(['"])proguard-android(?:-optimize)?\.txt\1\s*\)/g,
      `getDefaultProguardFile("${preset}")`,
    )
    if (!contents.includes(`getDefaultProguardFile("${preset}")`)) {
      throw new Error(
        'O template Android mudou: revise a configuração do R8 em with-android-release.js.',
      )
    }
    config.modResults.contents = contents
    return config
  })

  config = withProjectBuildGradle(config, (config) => {
    const dependency =
      /classpath\(\s*(['"])com\.android\.tools\.build:gradle(?::8\.12\.\d+)?\1\s*\)/
    if (!dependency.test(config.modResults.contents)) {
      throw new Error(
        'O template Android mudou: revise a versão do AGP em with-android-release.js.',
      )
    }
    // Keep the patched AGP version validated with the optimized release.
    config.modResults.contents = config.modResults.contents.replace(
      dependency,
      "classpath('com.android.tools.build:gradle:8.12.2')",
    )
    return config
  })

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const file = path.join(config.modRequest.platformProjectRoot, 'app/proguard-rules.pro')
      const contents = await fs.readFile(file, 'utf8')
      const clean = contents.replace(
        /\n?# @generated begin scaffold-expo-records[\s\S]*?# @generated end scaffold-expo-records\n?/g,
        '',
      )
      await fs.writeFile(file, `${clean.trimEnd()}\n\n${recordRules}\n`)
      return config
    },
  ])

  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest
    const optionalFeatures = [
      'android.hardware.screen.portrait',
      'android.hardware.wifi',
    ]
    // Play can infer these requirements from library activities/permissions.
    // Explicitly override required=true from lower-priority library manifests.
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools'
    manifest['uses-feature'] = (manifest['uses-feature'] ?? []).filter(
      (entry) => !optionalFeatures.includes(entry.$['android:name']),
    )
    for (const name of optionalFeatures) {
      manifest['uses-feature'].push({
        $: {
          'android:name': name,
          'android:required': 'false',
          'tools:replace': 'android:required',
        },
      })
    }
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults)
    // The Android app must adapt to rotation and multi-window. iOS keeps its existing orientation.
    activity.$['android:screenOrientation'] = 'unspecified'
    activity.$['android:resizeableActivity'] = 'true'
    delete activity.$['android:minAspectRatio']
    delete activity.$['android:maxAspectRatio']
    return config
  })
}
