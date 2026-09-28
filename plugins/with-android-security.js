const fs = require('node:fs/promises')
const path = require('node:path')
const {
  withAndroidManifest,
  withDangerousMod,
  withGradleProperties,
} = require('expo/config-plugins')

// Some vendors ignore allowBackup for transfers. Exclude offline data in both modes.
const domains = ['root', 'file', 'database', 'sharedpref', 'external']
const exclusions = domains.map((domain) => `    <exclude domain="${domain}" path="." />`).join('\n')
const backupRules = `<full-backup-content>\n${exclusions}\n</full-backup-content>\n`
const extractionRules = `<data-extraction-rules>\n  <cloud-backup>\n${exclusions}\n  </cloud-backup>\n  <device-transfer>\n${exclusions}\n  </device-transfer>\n</data-extraction-rules>\n`

module.exports = function withAndroidSecurity(config) {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest
    const permissions = manifest['uses-permission'] ?? []
    // Expo's camera activity requires this on Android 9 and older only.
    manifest['uses-permission'] = permissions.filter(
      (entry) => entry.$['android:name'] !== 'android.permission.WRITE_EXTERNAL_STORAGE',
    )
    manifest['uses-permission'].push({
      $: {
        'android:name': 'android.permission.WRITE_EXTERNAL_STORAGE',
        'android:maxSdkVersion': '28',
        'tools:replace': 'android:maxSdkVersion',
      },
    })
    const application = manifest.application[0].$
    application['android:allowBackup'] = 'false'
    application['android:usesCleartextTraffic'] = 'false'
    application['android:fullBackupContent'] = '@xml/scaffold_backup_rules'
    application['android:dataExtractionRules'] = '@xml/scaffold_data_extraction_rules'
    return config
  })
  config = withGradleProperties(config, (config) => {
    for (const key of ['android.compileSdkVersion', 'android.targetSdkVersion']) {
      config.modResults = config.modResults.filter((entry) => entry.key !== key)
      config.modResults.push({ type: 'property', key, value: '36' })
    }
    return config
  })
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const directory = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml')
      await fs.mkdir(directory, { recursive: true })
      await fs.writeFile(path.join(directory, 'scaffold_backup_rules.xml'), backupRules)
      await fs.writeFile(
        path.join(directory, 'scaffold_data_extraction_rules.xml'),
        extractionRules,
      )
      return config
    },
  ])
}
