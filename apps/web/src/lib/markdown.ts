// Machine-readable Markdown representations of the publication, Hauls, items, and threads.
// Serves /llms.txt, /llms-full.txt, and per-page .md mirrors (/haul/<n>.md, /haul/<n>/<item>.md,
// /haul/<n>/thread/<id>.md) so LLM crawlers, answer engines, and readers get clean, cited text
// with explicit Editor vs Machine attribution.

import { haulSlug, type Haul, type Item, type Thread } from '@fdf/shared/haul';
import { typeLabel } from '@fdf/shared/tokens';
import { formName, formOf } from './forms';
import { describeChart, licenceLine, unitsLine } from '@fdf/shared/charts/glosses';
import { collectThreads } from './store';
import {
  absolute,
  EDITOR_NAME,
  findItemAcrossHauls,
  firstSentence,
  haulLastmod,
  longDate,
  objects,
  paths,
  safeHref,
  SITE_DESCRIPTION,
  SITE_NAME,
  titleText,
} from './site';

export const HOUSE_RULES = [
  'Every quotation is matched word for word against its fetched source text. If it does not match, it does not ship.',
  'Every link is resolved against a real source and fetched before publishing; language models never emit URLs.',
  'Every machine marginal note names its source and is verified against it.',
  "The editor's words are never rewritten; voice notes are cleaned only by deleting fillers and fixing punctuation.",
  'No AI-generated images. Plates come only from public-domain archives with the holding institution and licence recorded.',
] as const;

/** Render one salvaged item as standalone Markdown (or a section within a Haul). */
export function itemMarkdown(haul: Haul, item: Item, allHauls?: Haul[], headingLevel: 1 | 3 = 1): string {
  const h1 = '#'.repeat(headingLevel);
  const h2 = '#'.repeat(headingLevel + 1);
  const h3 = '#'.repeat(Math.min(6, headingLevel + 2));
  const title = titleText(item.title);
  const form = formOf(item);
  const itemUrl = absolute(paths.item(haul.number, item.id));
  const haulUrl = absolute(paths.haul(haul.number));
  const srcUrl = safeHref(item.media?.url ?? item.source.url);
  const plateUrl = item.plate ? safeHref(item.plate.url) : undefined;

  const lines: string[] = [
    `${h1} ${title} — ${item.creator}`,
    '',
    `- **Publication**: [${SITE_NAME}](${absolute(paths.home)}) · [Haul ${haulSlug(haul.number)}: ${titleText(haul.title)}](${haulUrl})`,
    `- **Canonical URL**: ${itemUrl}`,
    `- **Type**: ${typeLabel[item.type]} (${formName[form]})`,
    `- **Creator**: ${item.creator}`,
    `- **Original Source**: ${srcUrl ? `[${item.source.name}](${srcUrl})` : item.source.name} (${item.source.date})${item.minutes ? ` · ${item.minutes} minute${item.minutes === 1 ? '' : 's'}` : ''}`,
    `- **Published**: ${haul.publishedAt.slice(0, 10)}`,
    '',
    `${h2} Why it's here (Editor — ${EDITOR_NAME})`,
    '',
    item.why.text,
    ...(item.startHere ? ['', `**Start here:** ${item.startHere.url ? `[${item.startHere.at}](${item.startHere.url})` : item.startHere.at}${item.startHere.note ? ` (${item.startHere.note})` : ''}`] : []),
  ];

  if (item.excerpt) {
    lines.push(
      '',
      `${h2} Verbatim Excerpt (${item.excerpt.locator || 'Source'}, matched word for word)`,
      '',
      `> ${item.excerpt.text.replace(/\n/g, '\n> ')}`,
    );
    if (item.excerpt.highlight) {
      lines.push('', `- **Marked by editor**: "${item.excerpt.highlight}"`);
    }
  }

  // Charts: the editor's title and note, what the numbers are, the machine's description, the source.
  const charts = (item.blocks ?? []).filter((b) => b.kind === 'chart');
  charts.forEach((b, i) => {
    if (b.kind !== 'chart') return;
    const c = b.chart;
    lines.push(
      '',
      `${h2} Figure ${i + 1}: ${c.title}`,
      '',
      ...(c.note ? [c.note, ''] : []),
      `- **What the numbers are**: ${unitsLine(c)}`,
      `- **Description (Machine)**: ${describeChart(c)}`,
      `- **Source**: ${c.sources.map((s) => `${safeHref(s.url) ? `[${s.maker}, ${s.dataset}](${safeHref(s.url)})` : `${s.maker}, ${s.dataset}`}${s.via ? ` via ${safeHref(s.via.url) ? `[${s.via.name}](${safeHref(s.via.url)})` : s.via.name}` : ''}`).join('; ')}. ${licenceLine(c)}. Retrieved ${c.sources.map((s) => s.retrieved).sort().pop()}.`,
      `- **Data**: ${c.data.rows.length} rows, on the item page`,
    );
  });

  if (item.rhyme) {
    lines.push(
      '',
      `${h2} Historical Rhyme`,
      '',
      `${h3} Then (${item.rhyme.then.year})`,
      '',
      `> "${item.rhyme.then.quote}"`,
      `> — ${item.rhyme.then.cite}`,
      '',
      `${h3} Bridge (Machine)`,
      '',
      item.rhyme.bridge,
      '',
      `${h3} Now (${item.rhyme.now.year})`,
      '',
      `> "${item.rhyme.now.quote}"`,
      `> — ${item.rhyme.now.cite}`,
    );
  }

  if (item.marginalia.length) {
    lines.push('', `${h2} Machine Marginalia (Verified against cited sources)`, '');
    for (const m of item.marginalia) {
      lines.push(`- ${m.text} *(Cite: ${m.cite})*`);
    }
  }

  if (item.ideas?.length) {
    lines.push('', `${h2} The Big Ideas (Machine, each checked against the source)`, '');
    item.ideas.forEach((m, i) => {
      lines.push(`${i + 1}. ${m.text}`);
      if (m.quote) lines.push(`   > "${m.quote}"${m.locator ? ` (${m.locator})` : ''}`);
      else if (m.locator) lines.push(`   (${m.locator})`);
      if (m.reaction) lines.push(`   *Editor:* ${m.reaction}`);
    });
  }

  if (item.plate) {
    lines.push(
      '',
      `${h2} Public-Domain Plate`,
      '',
      `- **Caption**: ${item.plate.caption}`,
      `- **Credit**: ${item.plate.credit} (${item.plate.licence})`,
    );
    if (plateUrl) lines.push(`- **Image**: ${plateUrl}`);
  }

  if (item.connections.length) {
    lines.push('', `${h2} Connections (Cross-links approved by the editor)`, '');
    for (const c of item.connections) {
      const target = findItemAcrossHauls(c.itemId, haul, allHauls);
      const href = target
        ? absolute(paths.item(target.haul.number, target.item.id))
        : c.threadId
          ? absolute(paths.thread(haul.number, c.threadId))
          : undefined;
      const label = href ? `[${c.title}](${href})` : c.title;
      lines.push(`- **${c.type}** → ${label}: *${c.note}*`);
    }
  }

  if (item.wiki.length) {
    lines.push('', `${h2} Wikipedia Entities & Concepts`, '');
    for (const w of item.wiki) {
      const href = safeHref(w.url);
      lines.push(`- ${href ? `[${w.title}](${href})` : w.title}: ${w.summary}`);
    }
  }

  return lines.join('\n') + '\n';
}

/** Render one Thread timeline as standalone Markdown. */
export function threadMarkdown(haul: Haul, thread: Thread, allHauls?: Haul[], headingLevel: 1 | 3 = 1): string {
  const h1 = '#'.repeat(headingLevel);
  const h2 = '#'.repeat(headingLevel + 1);
  const title = titleText(thread.title);
  const threadUrl = absolute(paths.thread(haul.number, thread.id));
  const haulUrl = absolute(paths.haul(haul.number));
  const firstYear = thread.points[0]?.year;
  const lastYear = thread.points.at(-1)?.year;

  const lines: string[] = [
    `${h1} Thread: ${title}`,
    '',
    `- **Publication**: [${SITE_NAME}](${absolute(paths.home)}) · [Haul ${haulSlug(haul.number)}: ${titleText(haul.title)}](${haulUrl})`,
    `- **Canonical URL**: ${threadUrl}`,
    `- **Span**: ${thread.points.length} points${firstYear && lastYear ? ` (${firstYear}–${lastYear})` : ''}`,
    '',
    thread.summary,
    '',
    `${h2} Chronology`,
    '',
  ];

  for (const pt of thread.points) {
    const target = findItemAcrossHauls(pt.itemId, haul, allHauls);
    const label = target ? `[${pt.title}](${absolute(paths.item(target.haul.number, target.item.id))})` : pt.title;
    lines.push(`- **${pt.year} — ${label}** *(${pt.edge})*: ${pt.gist}`);
  }

  lines.push('', `${h2} Provenance (Machine)`, '', thread.provenance);
  return lines.join('\n') + '\n';
}

/** Render a complete Haul issue as Markdown. */
export function haulMarkdown(haul: Haul, allHauls?: Haul[]): string {
  const slug = haulSlug(haul.number);
  const title = titleText(haul.title);
  const haulUrl = absolute(paths.haul(haul.number));
  const note = haul.fieldNote;

  const lines: string[] = [
    `# Haul ${slug}: ${title}`,
    '',
    `> ${haul.deck}`,
    '',
    `- **Publication**: [${SITE_NAME}](${absolute(paths.home)})`,
    `- **Editor**: ${EDITOR_NAME}`,
    `- **Published**: ${longDate(haul.publishedAt)} (${haul.publishedAt.slice(0, 10)})`,
    `- **Last Modified**: ${haulLastmod(haul)} (version ${haul.version})`,
    `- **Contents**: ${objects(haul.items.length)}`,
    `- **Canonical URL**: ${haulUrl}`,
    '',
    `## Field Note: ${titleText(note.title)} (Editor — ${EDITOR_NAME})`,
    '',
    ...note.paragraphs.flatMap((p) => [p, '']),
  ];

  if (note.route.length) {
    lines.push('### The Route', '');
    for (const step of note.route) {
      const voice = step.by === 'machine' ? 'Machine' : `Editor (${EDITOR_NAME})`;
      const itemLink = step.itemId ? ` ([view item](${absolute(paths.item(haul.number, step.itemId))}))` : '';
      lines.push(`- **${step.day}** [${voice}]: ${step.text}${itemLink}`);
    }
    lines.push('');
  }

  lines.push(`## Salvaged Items (${haul.items.length})`, '');
  for (const item of haul.items) {
    lines.push(itemMarkdown(haul, item, allHauls, 3).trimEnd(), '');
  }

  if (haul.threads.length) {
    lines.push(`## Threads (${haul.threads.length})`, '');
    for (const t of haul.threads) {
      lines.push(threadMarkdown(haul, t, allHauls, 3).trimEnd(), '');
    }
  }

  lines.push('## Colophon', '', haul.colophon);

  if (haul.corrections?.length) {
    lines.push('', '## Corrections', '');
    for (const c of haul.corrections) {
      lines.push(`- **${c.date.slice(0, 10)}**: ${c.text}`);
    }
  }

  return lines.join('\n') + '\n';
}

/** Generate /llms.txt following the llms.txt standard for LLM agents and search crawlers. */
export function llmsTxt(hauls: Haul[]): string {
  const threads = collectThreads(hauls);
  const lines: string[] = [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    `${SITE_NAME} is an irregular, eclectic magazine of essays, talks, papers, poems, podcasts, book passages, historical rhymes, and Wikipedia rabbit holes salvaged before they burn. One human editor (${EDITOR_NAME}) chooses and annotates every piece, mostly by voice. Language models read closely, find typed connections across time, and check facts; their prose is always marked as the machine's voice.`,
    '',
    '## House Rules & Verification Invariants',
    '',
    ...HOUSE_RULES.map((r, i) => `${i + 1}. ${r}`),
    '',
    '## Machine-Readable Endpoints',
    '',
    `- [Complete Markdown Corpus](${absolute(paths.llmsFull)}): Every published Haul, field note, verbatim quotation, cited machine note, and thread in one file.`,
    `- [RSS 2.0 Feed](${absolute(paths.feed)}): Full-content RSS feed of every published Haul.`,
    `- [Search Index JSON](${absolute('/search.json')}): Structured JSON index of all salvaged items, creators, sources, and Wikipedia concepts.`,
    `- [XML Sitemap](${absolute('/sitemap.xml')}): Canonical URLs with last-modified dates.`,
    `- [How It's Made](${absolute(paths.about)}): The two voices, house rules, and key to the printed forms.`,
    `- [Every Haul (Archive)](${absolute(paths.archive)}): Back issues in reverse chronological order.`,
    `- [Threads](${absolute(paths.threads)}): Living timelines connecting ideas across years and Hauls.`,
  ];

  lines.push('', '## Published Hauls', '');
  if (!hauls.length) {
    lines.push('- Haul 001 is currently being gathered.');
  } else {
    for (const h of hauls) {
      const url = absolute(paths.haul(h.number));
      const mdUrl = absolute(paths.haulMd(h.number));
      lines.push(
        `- [Haul ${haulSlug(h.number)}: ${titleText(h.title)}](${url}) ([Markdown](${mdUrl})) — ${h.publishedAt.slice(0, 10)} · ${objects(h.items.length).toLowerCase()}: ${h.deck}`,
      );
    }
  }

  if (hauls.length) {
    lines.push('', '## Salvaged Items', '');
    for (const h of hauls) {
      for (const item of h.items) {
        const url = absolute(paths.item(h.number, item.id));
        const mdUrl = absolute(paths.itemMd(h.number, item.id));
        lines.push(
          `- [${titleText(item.title)}](${url}) ([Markdown](${mdUrl})) — ${item.creator} (${item.source.name}, ${item.source.date}) · ${typeLabel[item.type]} in Haul ${haulSlug(h.number)}: ${firstSentence(item.why.text)}`,
        );
      }
    }
  }

  if (threads.length) {
    lines.push('', '## Threads', '');
    for (const { thread, n } of threads) {
      const url = absolute(paths.thread(n, thread.id));
      const mdUrl = absolute(paths.threadMd(n, thread.id));
      const firstYear = thread.points[0]?.year;
      const lastYear = thread.points.at(-1)?.year;
      const span = firstYear && lastYear ? ` (${firstYear}–${lastYear})` : '';
      lines.push(
        `- [${titleText(thread.title)}](${url}) ([Markdown](${mdUrl}))${span}: ${thread.summary}`,
      );
    }
  }

  return lines.join('\n') + '\n';
}

/** Generate /llms-full.txt: the complete Markdown corpus of every published Haul. */
export function llmsFullTxt(hauls: Haul[]): string {
  const header = [
    `# ${SITE_NAME} — Complete Corpus`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    `- **Canonical Site**: ${absolute(paths.home)}`,
    `- **Editor**: ${EDITOR_NAME}`,
    `- **Index**: ${absolute(paths.llms)}`,
    `- **RSS Feed**: ${absolute(paths.feed)}`,
    '',
    '## House Rules & Verification Invariants',
    '',
    ...HOUSE_RULES.map((r, i) => `${i + 1}. ${r}`),
    '',
  ].join('\n');

  if (!hauls.length) {
    return `${header}\nHaul 001 is currently being gathered.\n`;
  }

  const body = hauls.map((h) => haulMarkdown(h, hauls).trimEnd()).join('\n\n---\n\n');
  return `${header}\n---\n\n${body}\n`;
}
