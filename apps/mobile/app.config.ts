import { existsSync } from 'node:fs';
import type { ConfigContext, ExpoConfig } from 'expo/config';

// app.json holds the config. This file only adds the Firebase file when it is present, so builds
// work before push is set up. google-services.json is not secret, but stays out of git by choice.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    ...(existsSync('./google-services.json') ? { googleServicesFile: './google-services.json' } : {}),
  },
});
