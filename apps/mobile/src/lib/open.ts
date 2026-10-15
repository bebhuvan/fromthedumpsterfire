import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { Palette } from '@fdf/shared/tokens';

// Hosts whose own apps play the thing better than a browser tab.
const NATIVE_HOSTS = /(^|\.)(youtube\.com|youtu\.be|spotify\.com|podcasts\.apple\.com|music\.apple\.com|vimeo\.com|x\.com|twitter\.com)$/;

/** Articles open in an in-app browser tab; videos and podcasts open in their own apps. */
export async function openSource(url: string, p: Palette) {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return;
  }
  if (NATIVE_HOSTS.test(host)) {
    const ok = await Linking.openURL(url).then(() => true, () => false);
    if (ok) return;
  }
  await WebBrowser.openBrowserAsync(url, {
    toolbarColor: p.bg,
    controlsColor: p.ink,
    showTitle: true,
    enableBarCollapsing: true,
  });
}
