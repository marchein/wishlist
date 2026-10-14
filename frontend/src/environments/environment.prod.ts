import { Capacitor } from '@capacitor/core';

/** Server the native (iOS) app talks to – the hosted web app. */
const NATIVE_SERVER = 'https://wishlist.hein.cx';
const isNative = Capacitor.isNativePlatform();

export const environment = {
  production: true,
  // Web: empty = same origin (the web container proxies /api and /uploads).
  apiBaseUrl: isNative ? NATIVE_SERVER : '',
  /** Origin used for share links; empty = the current page's origin. */
  webBaseUrl: isNative ? NATIVE_SERVER : '',
};
