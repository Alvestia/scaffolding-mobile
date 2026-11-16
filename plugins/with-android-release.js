const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withGradleProperties,
  withProjectBuildGradle,
} = require('expo/config-plugins')

// SDK 55 uses AGP 8.12. Keep its patched release for R8 fixes and accurate DEX metadata.
const androidGradlePluginVersion = '8.12.2'
const releaseProperties = {
  edgeToEdgeEnabled: 'true',
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
  'android.r8.optimizedResourceShrinking': 'true',
}

module.exports = function withAndroidRelease(config) {
  config = withGradleProperties(config, (config) => {
    config.modResults = config.modResults.filter((entry) => !(entry.key in releaseProperties))
    for (const [key, value] of Object.entries(releaseProperties)) {
      config.modResults.push({ type: 'property', key, value })
    }
    return config
  })

  config = withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents.replace(
      /getDefaultProguardFile\(\s*(['"])proguard-android\.txt\1\s*\)/g,
      'getDefaultProguardFile("proguard-android-optimize.txt")',
    )
    if (!/getDefaultProguardFile\(\s*['"]proguard-android-optimize\.txt['"]\s*\)/.test(contents)) {
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
    config.modResults.contents = config.modResults.contents.replace(
      dependency,
      `classpath('com.android.tools.build:gradle:${androidGradlePluginVersion}')`,
    )
    return config
  })

  return withAndroidManifest(config, (config) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults)
    // The Android app must adapt to rotation and multi-window. iOS keeps its existing orientation.
    activity.$['android:screenOrientation'] = 'unspecified'
    activity.$['android:resizeableActivity'] = 'true'
    delete activity.$['android:minAspectRatio']
    delete activity.$['android:maxAspectRatio']
    return config
  })
}
