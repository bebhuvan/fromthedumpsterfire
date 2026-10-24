import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { Plate, Title as TitleData } from '@fdf/shared/haul';
import { fonts, typeColor, usePalette } from '@/theme';
import { Title } from './type';

/**
 * A book's jacket, as the book form sets it: the book in type on a 2:3 lilac jacket with its spine on
 * the left edge, or its own cover when the editor uploaded one. On the shelf the spine edge takes the
 * book's cloth, so the jacket and the spine on the shelf are the same book.
 */
export function Jacket({ title, author, publisher, cover, spine }: { title: TitleData; author: string; publisher?: string; cover?: Plate; spine?: string }) {
  const p = usePalette();
  const [failed, setFailed] = useState(false);
  if (cover && !failed)
    return <Image source={{ uri: cover.url }} onError={() => setFailed(true)} accessible={false} resizeMode="cover" style={[st.cover, { aspectRatio: cover.width / cover.height, borderColor: p.rule }]} />;
  return (
    <View style={[st.jacket, { backgroundColor: typeColor(p, 'book'), borderColor: p.rule }]} accessible={false}>
      <View style={[st.spine, spine ? { backgroundColor: spine, width: 9 } : { backgroundColor: p.ink, opacity: 0.09 }]} />
      {/* The jacket is a fixed 2:3 object: its type grows with the phone's text size only so far. */}
      <Title title={title} size={28} style={{ lineHeight: 29 }} maxScale={1.3} />
      <View>
        <Text maxFontSizeMultiplier={1.3} style={[st.author, { color: p.ink, borderTopColor: p.rule }]}>{author}</Text>
        {publisher ? <Text maxFontSizeMultiplier={1.3} style={[st.pub, { color: p.ink2 }]}>{publisher.toUpperCase()}</Text> : null}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  jacket: { width: 200, aspectRatio: 2 / 3, paddingLeft: 26, paddingRight: 18, paddingTop: 24, paddingBottom: 16, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'space-between' },
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 7 },
  author: { fontFamily: fonts.textItalic, fontSize: 16, lineHeight: 21, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  pub: { marginTop: 16, fontFamily: fonts.sansMedium, fontSize: 10.5, letterSpacing: 1.3 },
  cover: { width: 200, borderWidth: StyleSheet.hairlineWidth },
});
