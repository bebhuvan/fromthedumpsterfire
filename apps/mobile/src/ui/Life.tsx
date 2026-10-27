// The life (Lives): one person, the machine's profile from named sources. The website's form
// (apps/web/src/components/Life.astro): the name set large with the years under it, the editor's
// note, the label naming the machine and every source (lifeByline, never typed), the profile in the
// machine's sans in its reading blue with each paragraph's sources under it, the person's words as
// the pull quote, the numbers as a ledger, a life in dates, further reading and what it was written
// from. A portrait only if one cleared the credit rule; the page is complete without one.
import { Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Item, Life as LifeData, LifeLine } from '@fdf/shared/haul';
import { lifeByline, lifeYears, sourceKey, whereFrom } from '@fdf/shared/life';
import { fonts, usePalette, useTextScale } from '@/theme';
import { openSource } from '@/lib/open';
import { Apparatus, Key } from '@/ui/parts';
import { Credit, Picture } from '@/ui/Blocks';
import { Meta } from '@/ui/type';

const wholeWork = (kind: string) => kind === 'book' || kind === 'report';

export function LifeForm({ item, life, why }: { item: Item; life: LifeData; why: ReactNode }) {
  const p = usePalette();
  const k = useTextScale();
  const years = lifeYears(life);
  const byline = lifeByline(life);
  const where = (lines: LifeLine[]) => whereFrom(life, lines);
  const quoteAfter = Math.min(1, life.sections.length - 1);
  const figuresAfter = Math.min(2, life.sections.length - 1);
  const wordsBy = life.words ? [...new Set(life.words.cites.map((c) => c.source))].flatMap((id) => life.sources.filter((s) => s.id === id)) : [];
  const prose = { fontFamily: fonts.sans, fontSize: 16.5 * k, lineHeight: 26 * k, color: p.machineText };
  const rule = { borderTopWidth: 1, borderTopColor: p.ink };
  const hair = { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.rule };

  return (
    <View>
      <View style={st.metaLine}>
        <Key type={item.type} />
        <Meta>Lives</Meta>
      </View>
      {/* The name is the loud thing: fixed in size so it never clips at a large text setting. */}
      <Text accessibilityRole="header" maxFontSizeMultiplier={1} style={[st.name, { color: p.ink }]}>
        {life.name}
      </Text>
      {years ? <Text maxFontSizeMultiplier={1.2} style={[st.years, { color: p.ink2 }]} accessibilityLabel={`Lived ${years}`}>{years}</Text> : null}
      <Text selectable style={[st.epithet, { color: p.machine, fontSize: 16 * k, lineHeight: 22 * k }]}>{life.epithet.text}</Text>
      {life.portrait ? (
        <View style={{ marginTop: 22, width: '62%' }}>
          <Picture plate={{ ...life.portrait, caption: '' }} />
          <Meta style={{ marginTop: 6 }}>{life.portrait.caption}</Meta>
          <Credit plate={life.portrait} />
        </View>
      ) : null}

      {why}

      <View style={[{ marginTop: 26, paddingTop: 12, borderTopWidth: 2, borderTopColor: p.ink }]}>
        <Text style={[st.label, { color: p.machine, fontSize: 14 * k, lineHeight: 21 * k }]}>
          <Text style={{ fontFamily: fonts.sansBold }}>{byline.lead}</Text>{' '}
          {byline.parts.map((part, i) => (
            <Fragment key={i}>
              {i > 0 ? (i === byline.parts.length - 1 ? ' and ' : ', ') : ''}
              {part.author} {part.italic ? <Text style={{ fontFamily: fonts.textItalic, color: p.ink }}>{part.title}</Text> : `“${part.title}”`}
            </Fragment>
          ))}
          .
        </Text>
      </View>

      {life.sections.map((s, i) => (
        <View key={i}>
          <View style={{ marginTop: 30 }}>
            <Text accessibilityRole="header" style={[st.heading, { color: p.machineText, fontSize: 17 * k, lineHeight: 23 * k }]}>{s.heading}</Text>
            {s.paragraphs.map((para, j) => (
              <View key={j} style={{ marginTop: j ? 16 : 8 }}>
                <Text selectable style={prose}>{para.map((l) => l.text).join(' ')}</Text>
                <Text style={[st.cite, { color: p.machine }]} accessibilityLabel={`Sources: ${where(para)}`}>{where(para)}</Text>
              </View>
            ))}
          </View>

          {life.words && i === quoteAfter ? (
            <View style={{ marginTop: 34 }}>
              <View style={[st.pq, { borderColor: p.ink }]}>
                <Text selectable style={[st.pqText, { color: p.ink, fontSize: 32 * k, lineHeight: 36 * k }]}>
                  <Text style={{ color: p.ink2 }}>“</Text>
                  {life.words.text.charAt(0).toUpperCase() + life.words.text.slice(1)}
                  <Text style={{ color: p.ink2 }}>”</Text>
                </Text>
              </View>
              <Text style={[st.small, { color: p.machine, marginTop: 10 }]}>{life.words.context.text}</Text>
              <Meta style={{ marginTop: 3 }}>
                {wordsBy.map((s) => `As ${s.author} records it${wholeWork(s.kind) ? ` in ${s.title}` : ''}, `).join('')}matched word for word
              </Meta>
            </View>
          ) : null}

          {life.figures && i === figuresAfter ? (
            <View style={{ marginTop: 34 }}>
              <Text accessibilityRole="header" style={[st.small, { color: p.machine, fontFamily: fonts.sansMedium }]}>{life.figures.title}</Text>
              <View style={[{ marginTop: 8 }, rule]}>
                {life.figures.rows.map((r, j) => (
                  <View key={j} style={[st.ledgerRow, hair]}>
                    <Text maxFontSizeMultiplier={1.3} style={[st.figure, { color: p.ink }]}>{r.value}</Text>
                    <View style={st.ledgerLine}>
                      <Text style={[st.small, { color: p.machineText, flex: 1 }]}>{r.line.text}</Text>
                      <Text style={[st.cite, { color: p.machine, marginTop: 0 }]}>{where([r.line])}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ))}

      {life.dates.length ? (
        <View style={{ marginTop: 34 }}>
          <Apparatus>A life in dates</Apparatus>
          <View style={[{ marginTop: 8 }, rule]}>
            {life.dates.map((d, j) => (
              <View key={j} style={[st.dateRow, hair]}>
                <Text maxFontSizeMultiplier={1.3} style={[st.year, { color: p.ink }]}>{d.year}</Text>
                <Text style={[st.small, { color: p.machineText, flex: 1 }]}>{d.line.text}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {life.reading.length ? (
        <View style={{ marginTop: 34 }}>
          <Apparatus>Further reading</Apparatus>
          <View style={[{ marginTop: 8 }, rule]}>
            {life.reading.map((r, j) => (
              <Pressable
                key={j}
                disabled={!r.url}
                accessibilityRole={r.url ? 'link' : 'text'}
                onPress={() => r.url && void openSource(r.url, p)}
                style={[{ paddingVertical: 11 }, hair]}
              >
                <Text style={[st.readTitle, { color: p.ink, fontSize: 18 * k, lineHeight: 24 * k }]}>{r.title}</Text>
                <Meta style={{ marginTop: 2 }}>{r.author}{r.publisher ? `. ${r.publisher}` : ''}{r.year ? `, ${r.year}` : ''}.</Meta>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ marginTop: 34 }}>
        <Apparatus>Written from</Apparatus>
        <View style={[{ marginTop: 8 }, rule]}>
          {life.sources.map((s) => (
            <Pressable key={s.id} accessibilityRole="link" onPress={() => void openSource(s.url, p)} style={[st.srcRow, hair]}>
              <Text style={[st.small, { color: p.machine, fontFamily: fonts.sansBold, width: 78 }]}>{sourceKey(s)}</Text>
              <Text style={[st.small, { color: p.machine, flex: 1 }]}>
                {s.author}, {wholeWork(s.kind) ? <Text style={{ fontFamily: fonts.textItalic, color: p.ink }}>{s.title}</Text> : `“${s.title}”`}
                {s.publisher ? `, ${s.publisher}` : ''}
                {s.year ? `, ${s.year}` : ''}.{s.via ? ` ${s.via}.` : ''} <Text style={{ textDecorationLine: 'underline' }}>Where we read it</Text>
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={[st.small, { color: p.machine, marginTop: 12 }]}>
          {life.writer} wrote this profile from these sources only. Code found every cited passage word for word in the text we fetched, and checked every number against it; a second model read each sentence against its passages, and anything it could not confirm was left out. The editor read every sentence and approved the profile before it was published.
        </Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontFamily: fonts.display, fontSize: 64, lineHeight: 58, letterSpacing: -2.2, marginTop: 14, paddingTop: 6 },
  years: { fontFamily: fonts.displayItalic, fontSize: 30, lineHeight: 36, marginTop: 6 },
  epithet: { fontFamily: fonts.sansMedium, marginTop: 14, maxWidth: 300 },
  label: { fontFamily: fonts.sans },
  heading: { fontFamily: fonts.sansBold },
  cite: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, marginTop: 5 },
  small: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  pq: { paddingTop: 18, paddingBottom: 16, borderTopWidth: 1, borderBottomWidth: 1 },
  pqText: { fontFamily: fonts.displayItalic, letterSpacing: -0.3 },
  ledgerRow: { paddingVertical: 9 },
  ledgerLine: { flexDirection: 'row', gap: 10, alignItems: 'baseline', marginTop: 1 },
  figure: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30 },
  dateRow: { flexDirection: 'row', alignItems: 'baseline', gap: 14, paddingVertical: 7 },
  year: { fontFamily: fonts.displayRegular, fontSize: 20, lineHeight: 24, width: 52 },
  readTitle: { fontFamily: fonts.textItalic },
  srcRow: { flexDirection: 'row', gap: 10, paddingVertical: 9 },
});
