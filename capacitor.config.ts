import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.cinegeek.mobile',
  appName: 'CineGeek',
  webDir: 'dist-native',
  backgroundColor: '#10151a',
  // Native app-link events can carry one-time recovery hashes. Never print
  // bridge payloads to device logs, including in development builds.
  loggingBehavior: 'none',
};

export default config;
