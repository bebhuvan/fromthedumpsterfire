// What the server still needs to hear about this phone's notifications. Kept apart from push.ts
// (which loads native modules) so it can be tested.
//
// `registered` means the server has the current choice, on or off. Turning notifications off keeps
// the token, so a refusal that never reached the server is sent again at next launch; otherwise the
// server would keep notifying a reader who said no.

export type PushState = { on: boolean; token?: string; platform?: string; registered: boolean };

export function pendingRegistration(push: PushState): { token: string; platform: string; enabled: boolean } | null {
  if (push.registered || !push.token || !push.platform) return null;
  return { token: push.token, platform: push.platform, enabled: push.on };
}
