// A chart, as the website sets it: the editor's title and note in the serif, what the numbers are in
// quiet sans, the plot, the machine's glosses in its blue sans, the credit, and the numbers behind it.
// The app has no SVG, so the plot is the picture the editor's side drew at publish from the website's
// own scene (one per theme, kept on the phone with the Haul). Without it the table stands in, never a
// broken image.
import { memo, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
// The light entry: words and formats only, not the renderer (the app shows the published pictures).
import { chartGlosses, describeChart, licenceLine, retrievedLine, unitsLine } from '@fdf/shared/charts/glosses';
import { fonts, usePalette, useScheme, useTextScale } from '@/theme';
import { chartTable, type ChartBlock } from '@/lib/chart';
import { pictureUri } from '@/lib/pictures';
import { openSource } from '@/lib/open';
import { Machine, Meta, Note } from './type';

/** Rows shown before "Show all": a daily chart can carry thousands, and the page must stay quick. */
const FIRST_ROWS = 60;

/**
 * `lead`: the figure form's chart, the loud thing on the page. The item's title already heads the
 * page, so the chart's own title reads as its caption, under the plot.
 */
export const Chart = memo(function Chart({ block, lead }: { block: ChartBlock; lead?: boolean }) {
  const p = usePalette();
  const scheme = useScheme();
  const k = useTextScale();
  const { chart, images } = block;
  const image = images?.[scheme];
  const [failed, setFailed] = useState(false);
  const shown = Boolean(image) && !failed;
  const glosses = useMemo(() => chartGlosses(chart), [chart]);
  const describe = useMemo(() => describeChart(chart), [chart]);

  const title = <Text style={[lead ? st.caption : st.title, { color: p.ink, fontSize: (lead ? 19 : 23) * k, lineHeight: (lead ? 25 : 27) * k }]}>{chart.title}</Text>;
  return (
    <View style={[st.wrap, { borderTopColor: p.ink }]}>
      {lead ? null : title}
      {!lead && chart.note ? <Note style={st.note}>{chart.note}</Note> : null}
      <Meta style={{ marginTop: lead ? 0 : 10 }}>{unitsLine(chart)}</Meta>
      {shown ? (
        <Image
          source={{ uri: pictureUri(image!.url) }}
          onError={() => setFailed(true)}
          accessible
          accessibilityRole="image"
          accessibilityLabel={describe}
          resizeMode="contain"
          style={{ width: '100%', aspectRatio: image!.width / image!.height, marginTop: 10, backgroundColor: p.bg }}
        />
      ) : (
        <Meta style={{ marginTop: 10 }}>{images ? 'The chart could not be loaded here; its numbers are below.' : 'This chart is drawn on the website, and in an updated app; its numbers are below.'}</Meta>
      )}
      {lead ? title : null}
      {lead && chart.note ? <Note style={st.note}>{chart.note}</Note> : null}
      {glosses.length ? (
        <View style={st.glosses}>
          {glosses.map((g, i) => (
            <Machine key={i} style={st.gloss}>
              {g}
            </Machine>
          ))}
        </View>
      ) : null}
      <Credit block={block} />
      <Numbers block={block} open={!shown} />
    </View>
  );
});

/** Who made the data and where it lives (each a link), the licences as stated, and when it was fetched. */
function Credit({ block }: { block: ChartBlock }) {
  const p = usePalette();
  const { chart } = block;
  const link = (url: string) => () => void openSource(url, p);
  return (
    <Meta style={{ marginTop: 12 }}>
      {'Source: '}
      {chart.sources.map((s, i) => (
        <Text key={i}>
          {i ? '; ' : ''}
          <Text accessibilityRole="link" onPress={link(s.url)} style={st.link}>
            {`${s.maker}, ${s.dataset}`}
          </Text>
          {s.via ? (
            <>
              {', via '}
              <Text accessibilityRole="link" onPress={link(s.via.url)} style={st.link}>
                {s.via.name}
              </Text>
            </>
          ) : null}
        </Text>
      ))}
      {`. ${licenceLine(chart)}. Retrieved ${retrievedLine(chart)}.`}
    </Meta>
  );
}

/** "The numbers": the rows behind the chart, every column, as a table that scrolls sideways. */
function Numbers({ block, open: startOpen }: { block: ChartBlock; open: boolean }) {
  const p = usePalette();
  const k = useTextScale();
  const [open, setOpen] = useState(startOpen);
  const [all, setAll] = useState(false);
  const table = useMemo(() => chartTable(block.chart), [block.chart]);
  const isOpen = open || startOpen;
  const rows = all ? table.rows : table.rows.slice(0, FIRST_ROWS);
  // Each column as wide as its longest cell (an estimate from the character count; capped).
  const widths = table.head.map((h, j) => Math.min(220, Math.max(56, Math.max(h.length * 6.6, ...table.rows.slice(0, 400).map((r) => (r[j] ?? '').length * 8.2)) * k + 14)));
  return (
    <View style={{ marginTop: 14 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        onPress={() => setOpen(!isOpen)}
        hitSlop={6}
        style={({ pressed }) => [st.numbersRow, { borderTopColor: p.rule, borderBottomColor: isOpen ? p.ink : p.rule, opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[st.numbersLabel, { color: p.ink }]}>The numbers</Text>
        <Text style={[st.numbersMeta, { color: p.ink2 }]}>
          {`${table.rows.length.toLocaleString('en-IN')} ${table.rows.length === 1 ? 'row' : 'rows'}  ${isOpen ? 'Hide' : 'Show'}`}
        </Text>
      </Pressable>
      {isOpen ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingBottom: 6 }}>
            <View>
              <View style={[st.tr, { borderBottomColor: p.rule }]}>
                {table.head.map((h, j) => (
                  <Text key={j} style={[st.th, { width: widths[j], color: p.ink2, fontSize: 11.5 * k, textAlign: table.numeric[j] ? 'right' : 'left' }]}>
                    {h}
                  </Text>
                ))}
              </View>
              {rows.map((r, i) => (
                <View key={i} style={[st.tr, { borderBottomColor: p.rule }]}>
                  {r.map((c, j) => (
                    <Text key={j} selectable style={[st.td, { width: widths[j], color: p.ink, fontSize: 13.5 * k, lineHeight: 19 * k, textAlign: table.numeric[j] ? 'right' : 'left', fontFamily: table.numeric[j] ? fonts.sans : fonts.text }]}>
                      {c}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
          {!all && table.rows.length > FIRST_ROWS ? (
            <Pressable accessibilityRole="button" onPress={() => setAll(true)} hitSlop={6} style={st.more}>
              <Text style={[st.moreText, { color: p.ink2 }]}>{`Show all ${table.rows.length.toLocaleString('en-IN')} rows`}</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { borderTopWidth: 1, paddingTop: 14 },
  title: { fontFamily: fonts.display, includeFontPadding: false },
  caption: { fontFamily: fonts.displayItalic, includeFontPadding: false, marginTop: 12 },
  note: { fontSize: 17, lineHeight: 25, marginTop: 8 },
  glosses: { marginTop: 10, gap: 4 },
  gloss: { fontSize: 13.5, lineHeight: 20 },
  link: { textDecorationLine: 'underline' },
  numbersRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  numbersLabel: { fontFamily: fonts.sansMedium, fontSize: 14, includeFontPadding: false },
  numbersMeta: { fontFamily: fonts.sans, fontSize: 12.5, includeFontPadding: false },
  tr: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 6, gap: 12 },
  th: { fontFamily: fonts.sansMedium, includeFontPadding: false },
  td: { includeFontPadding: false, fontVariant: ['tabular-nums'] },
  more: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  moreText: { fontFamily: fonts.sansMedium, fontSize: 13, textDecorationLine: 'underline' },
});
