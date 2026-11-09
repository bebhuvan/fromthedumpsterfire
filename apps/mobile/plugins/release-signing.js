// Signs release builds with the Play upload key, which lives outside the project (DECISIONS
// 2026-11-09). The key and its passwords are read at build time from a properties file:
// $FDF_KEYSTORE_PROPERTIES, else ~/.config/fdf/play/keystore.properties. Without that file a release
// build falls back to the debug key, which is fine for the emulator and which Play refuses, so a
// wrongly signed upload cannot slip through.
const { withAppBuildGradle } = require('expo/config-plugins');

const SIGNING = `
        release {
            def fdfProps = new Properties()
            def fdfFile = file(System.getenv('FDF_KEYSTORE_PROPERTIES') ?: "\${System.getProperty('user.home')}/.config/fdf/play/keystore.properties")
            if (fdfFile.exists()) {
                fdfFile.withInputStream { fdfProps.load(it) }
                storeFile file(fdfProps['storeFile'])
                storePassword fdfProps['storePassword']
                keyAlias fdfProps['keyAlias']
                keyPassword fdfProps['keyPassword']
            }
        }`;

module.exports = function releaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    let gradle = c.modResults.contents;
    if (gradle.includes('fdfProps')) return c;
    const debugBlock = /signingConfigs \{\n(\s+debug \{[^}]*\})/;
    const releaseLine = /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/;
    if (!debugBlock.test(gradle) || !releaseLine.test(gradle)) {
      throw new Error('release-signing: build.gradle no longer has the expected signing blocks');
    }
    gradle = gradle.replace(debugBlock, (m) => m + SIGNING);
    gradle = gradle.replace(
      releaseLine,
      '$1signingConfig(signingConfigs.release.storeFile ? signingConfigs.release : signingConfigs.debug)',
    );
    c.modResults.contents = gradle;
    return c;
  });
};
