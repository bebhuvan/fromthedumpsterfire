// Settings, set as a page: groups under quiet sans labels and ink rules, each setting named in sans
// with what it does in the serif, controls drawn in the house style. Everything here stays on the phone.
import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { fonts, TEXT_SCALE, usePalette } from '@/theme';
import { reader, useReader, type TextSize, type ThemePref } from '@/lib/store';
import { clearDownloads, storageUsed } from '@/lib/data';
import { disablePush, enablePush } from '@/lib/push';
import { go } from '@/nav';
import { Body, Meta, Note, Title } from '@/ui/type';
import { Flame, TopBar } from '@/ui/parts';
import { AppearanceChoice, Group, Setting, SizeChoice, TextButton, Toggle } from '@/ui/controls';
import { Screen } from '@/ui/screen';

export const EDITOR = 'bhuvan@bebhuvan.com';

const kb = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

export const mailEditor = () => Linking.openURL(`mailto:${EDITOR}?subject=${encodeURIComponent('For the Dumpster Fire')}`);

export function Settings() {
  const p = usePalette();
  const theme = useReader((s) => s.theme);
  const textSize = useReader((s) => s.textSize);
  const keepAll = useReader((s) => s.keepAllHauls);
  const push = useReader((s) => s.push);
  const [pushNote, setPushNote] = useState<string | null>(null);
  const [storage, setStorage] = useState(storageUsed);

  const togglePush = async (on: boolean) => {
    setPushNote(null);
    if (!on) return disablePush();
    const r = await enablePush();
    if (r === 'denied') setPushNote('Notifications are off for this app in your phone settings.');
    if (r === 'unavailable') setPushNote('Notifications are not set up in this build yet.');
  };

  const clear = () =>
    Alert.alert('Remove downloaded Hauls?', 'Your saved finds and reading history stay. Hauls download again when you open them.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          clearDownloads();
          setStorage(storageUsed());
        },
      },
    ]);

  return (
    <Screen header={<TopBar label="Menu" />}>
      <Title title={{ text: 'Settings' }} size={44} style={{ marginTop: 18 }} />
      <Body style={{ marginTop: 10, color: p.ink2, fontSize: 17, lineHeight: 25 }}>Everything you choose here stays on this phone.</Body>

      <Group label="Reading">
        <Setting
          first
          title="Appearance"
          detail="Follow the phone, or keep the page light or dark."
          below={
            <AppearanceChoice<ThemePref>
              value={theme}
              onChange={reader.setTheme}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          }
        />
        <Setting
          title="Text size"
          detail="For the reading text, on top of your phone's own size."
          below={
            <SizeChoice<TextSize>
              value={textSize}
              onChange={reader.setTextSize}
              options={(['small', 'regular', 'large', 'larger'] as const).map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1), scale: TEXT_SCALE[v] }))}
            />
          }
        />
        <View style={[styles.proof, { borderColor: p.rule }]}>
          <Text style={[styles.proofLabel, { color: p.ink2 }]}>A proof at this size</Text>
          <Note style={{ marginTop: 10 }}>Everyone cites the memex and almost nobody reads the essay.</Note>
          <Body style={{ marginTop: 8 }}>The summation of human experience is being expanded at a prodigious rate.</Body>
        </View>
      </Group>

      <Group label="Notifications">
        <Setting
          first
          title="When a new Haul arrives"
          detail={push.on && !push.registered ? 'On. Connecting to the server…' : 'One notification per Haul, and nothing else.'}
          right={<Toggle label="New Haul notifications" value={push.on} onChange={togglePush} />}
        />
        {pushNote ? <Meta style={{ marginTop: -4, marginBottom: 8 }}>{pushNote}</Meta> : null}
      </Group>

      <Group label="Offline">
        <Setting
          first
          title="Keep every Haul on this phone"
          detail="Search and threads then work without a connection. Hauls are small."
          right={<Toggle label="Keep every Haul offline" value={keepAll} onChange={reader.setKeepAll} />}
        />
        <Setting
          title="Downloaded Hauls"
          detail={storage.count ? `${storage.count} ${storage.count === 1 ? 'Haul' : 'Hauls'}, ${kb(storage.bytes)}` : 'Nothing beyond what came with the app.'}
          right={storage.count ? <TextButton label="Remove" onPress={clear} /> : undefined}
        />
      </Group>

      <Group label="The editor">
        <Setting first title="Send a find or a note" detail={EDITOR} onPress={mailEditor} accessibilityRole="link" right={<Text style={[styles.ext, { color: p.ink2 }]}>↗</Text>} />
        <Setting title="How it's made" detail="Two voices, and what we promise." onPress={go.about} accessibilityRole="link" right={<Text style={[styles.ext, { color: p.ink2 }]}>→</Text>} />
      </Group>

      <Group label="Privacy">
        <Body style={{ marginTop: 14, fontSize: 16.5, lineHeight: 25 }}>
          No accounts and no tracking. What you save and read stays on this phone. If you turn on notifications, we keep only a device token so we can tell you when a Haul arrives, and turning them off deletes it.
        </Body>
      </Group>

      <View style={[styles.colophon, { borderTopColor: p.rule }]}>
        <Flame size={8} />
        <Meta>Version {Constants.expoConfig?.version ?? '0'} · fromthedumpsterfire.com</Meta>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  proof: { marginTop: 4, paddingVertical: 18, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  proofLabel: { fontFamily: fonts.sansMedium, fontSize: 12, includeFontPadding: false },
  ext: { fontFamily: fonts.sansMedium, fontSize: 16 },
  colophon: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 44, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
});
