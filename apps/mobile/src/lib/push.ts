// New-Haul notifications. Opt-in only, one notification per Haul, nothing else.
//
// The app registers this device's native push token (FCM on Android, APNs on iOS) with our Worker
// at POST /v1/devices. The Worker stores it in D1 and sends through FCM when a Haul is published.
// If the server is unreachable, the preference stays on and registration retries at next launch.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getReader, reader } from './store';
import { pendingRegistration } from './pushState';

const API = process.env.EXPO_PUBLIC_API_BASE ?? 'https://api.fromthedumpsterfire.com';
const CHANNEL = 'hauls';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'New Hauls',
    description: 'One notification when a new Haul is published.',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

async function register(token: string, platform: string, enabled: boolean) {
  const res = await fetch(`${API}/v1/devices`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, platform, enabled }),
  });
  if (!res.ok) throw new Error(`register ${res.status}`);
}

export type PushResult = 'on' | 'denied' | 'unavailable';

export async function enablePush(): Promise<PushResult> {
  await ensureChannel();
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return 'denied';
  let token: Notifications.DevicePushToken;
  try {
    token = await Notifications.getDevicePushTokenAsync();
  } catch {
    return 'unavailable'; // no Firebase config in this build
  }
  reader.setPush({ on: true, token: String(token.data), platform: token.type, registered: false });
  retryPushRegistration();
  return 'on';
}

export function disablePush() {
  reader.setPush({ ...getReader().push, on: false, registered: false });
  retryPushRegistration();
}

/** Tell the server the current choice if it has not heard it; called at launch and after turning off. */
export function retryPushRegistration() {
  const pending = pendingRegistration(getReader().push);
  if (!pending) return;
  register(pending.token, pending.platform, pending.enabled).then(() => {
    const now = getReader().push;
    if (now.on === pending.enabled) reader.setPush({ ...now, registered: true });
  }, () => {});
}

/** The deep link carried by a tapped notification, e.g. https://fromthedumpsterfire.com/haul/2 */
export function urlFrom(response: Notifications.NotificationResponse | null): string | null {
  const url = response?.notification.request.content.data?.url;
  return typeof url === 'string' ? url : null;
}
