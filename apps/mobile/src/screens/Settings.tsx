import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { fonts, usePalette } from '@/theme';
import { reader, useReader, type TextSize, type ThemePref } from '@/lib/store';
import { clearDownloads, storageUsed } from '@/lib/data';
import { disablePush, enablePush } from '@/lib/push';
import { go } from '@/nav';
import { Body, Label, Meta, Note, Title } from '@/ui/type';
import { Section, TopBar } from '@/ui/parts';
import { Row, Segmented, Toggle } from '@/ui/controls';
import { Screen } from '@/ui/screen';

const EDITOR = 'editor@fromthedumpsterfire.com';

const kb = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

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
    <Screen header={<TopBar label="Back" />}>
      <Title title={{ text: 'Settings' }} size={44} style={{ marginTop: 16 }} />

      <Section title="Notifications">
        <View style={{ marginTop: 10 }}>
          <Row
            title="When a new Haul arrives"
            detail={push.on ? (push.registered ? 'One notification per Haul, nothing else.' : 'On. Connecting to the server…') : 'One notification per Haul, nothing else.'}
            right={<Toggle label="New Haul notifications" value={push.on} onChange={togglePush} />}
          />
          {pushNote ? <Meta style={{ marginTop: 4 }}>{pushNote}</Meta> : null}
        </View>
      </Section>

      <Section title="Reading">
        <Label muted style={{ marginTop: 16, marginBottom: 10 }}>Appearance</Label>
        <Segmented<ThemePref>
          label="Appearance"
          value={theme}
          onChange={reader.setTheme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
        <Label muted style={{ marginTop: 22, marginBottom: 10 }}>Text size</Label>
        <Segmented<TextSize>
          label="Text size"
          value={textSize}
          onChange={reader.setTextSize}
          options={[
            { value: 'small', label: 'Small' },
            { value: 'regular', label: 'Regular' },
            { value: 'large', label: 'Large' },
            { value: 'larger', label: 'Larger' },
          ]}
        />
        <View style={[styles.preview, { backgroundColor: p.plate }]}>
          <Note>Everyone cites the memex and almost nobody reads the essay.</Note>
          <Body style={{ marginTop: 8 }}>The summation of human experience is being expanded at a prodigious rate.</Body>
        </View>
      </Section>

      <Section title="Offline">
        <View style={{ marginTop: 10 }}>
          <Row
            title="Keep every Haul on this phone"
            detail="Lets search and threads work offline. Hauls are small."
            right={<Toggle label="Keep every Haul offline" value={keepAll} onChange={reader.setKeepAll} />}
          />
          <Row
            title="Downloaded Hauls"
            detail={storage.count ? `${storage.count} ${storage.count === 1 ? 'Haul' : 'Hauls'} · ${kb(storage.bytes)}` : 'Nothing downloaded beyond what ships with the app'}
            onPress={storage.count ? clear : undefined}
            right={storage.count ? <Label muted>Remove</Label> : undefined}
          />
        </View>
      </Section>

      <Section title="The editor">
        <View style={{ marginTop: 10 }}>
          <Row title="Send a find or a note" detail={EDITOR} onPress={() => Linking.openURL(`mailto:${EDITOR}?subject=${encodeURIComponent('For the Dumpster Fire')}`)} right={<Text style={[styles.ext, { color: p.ink2 }]}>↗</Text>} />
          <Row title="How it's made" detail="Two voices, and what we promise" onPress={go.about} right={<Text style={[styles.ext, { color: p.ink2 }]}>→</Text>} />
        </View>
      </Section>

      <Section title="Privacy">
        <Body style={{ marginTop: 10, fontSize: 16.5, lineHeight: 24 }}>
          No accounts and no tracking. What you save and read stays on this phone. If you turn on notifications, we store only a device token so we can tell you when a Haul arrives.
        </Body>
      </Section>

      <Meta style={{ marginTop: 36 }}>Version {Constants.expoConfig?.version ?? '0'} · fromthedumpsterfire.com</Meta>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { marginTop: 14, borderRadius: 16, padding: 16 },
  ext: { fontFamily: fonts.sansMedium, fontSize: 15 },
});
