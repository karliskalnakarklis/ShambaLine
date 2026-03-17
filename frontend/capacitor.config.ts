import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.shambaline.app',
  appName: 'ShambaLine',
  webDir: 'dist',
  ios: {
    allowsLinkPreview: false
  }
};

export default config;
