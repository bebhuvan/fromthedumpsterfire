// CSV (or tab-separated) text the editor pastes or uploads, as chart data: columns with types, rows
// with numbers parsed. Parsing never "cleans" a number: a cell is a number only when the whole cell
// reads as one; a blank, "NA", ".." or "n/a" is missing (null) and is drawn as missing.

import type { Cell, ChartColumn, ChartData, ColumnType } from './types';

const MISSING = new Set(['', 'na', 'n/a', 'nan', '..', '...', '-', '–', '—', 'null', 'none', '#n/a']);

/** Split CSV text into records (RFC 4180: quoted fields, doubled quotes, newlines inside quotes). */
export function parseCsvRecords(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const first = src.split('\n', 1)[0] ?? '';
  const d = delimiter ?? (first.split('\t').length > first.split(',').length ? '\t' : first.split(';').length > first.split(',').length ? ';' : ',');
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') quoted = true;
    else if (ch === d) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      out.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    out.push(row);
  }
  return out.filter((r) => r.some((f) => f.trim() !== ''));
}

/** A cell as a number, or null when it is not wholly a number. Thousands commas and a minus sign of any kind are read. */
export function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(/^[−–]/, '-');
  if (!/^-?(\d{1,3}(,\d{2,3})+|\d+)?(\.\d+)?([eE][-+]?\d+)?$/.test(s) || !/\d/.test(s)) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

const isMissing = (s: string) => MISSING.has(s.trim().toLowerCase());
const YEAR = /^-?\d{1,4}$/;
const DATE = /^\d{4}-\d{2}(-\d{2})?$/;

/** A column key from a header: lowercase, dashes for spaces, unique. */
export function columnKey(label: string, taken: Set<string>): string {
  let base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'col';
  if (/^\d/.test(base)) base = `c${base}`;
  let k = base;
  for (let i = 2; taken.has(k); i++) k = `${base}_${i}`;
  taken.add(k);
  return k;
}

/** Guess a column's type from its header and cells. Years need a year-like header or whole numbers 1000 to 2100. */
export function inferType(label: string, cells: string[]): ColumnType {
  const vals = cells.filter((c) => !isMissing(c)).map((c) => c.trim());
  if (!vals.length) return 'number';
  if (vals.every((v) => DATE.test(v))) return 'date';
  const yearHeader = /^(year|yr|fy|date|time|period)$/i.test(label.trim());
  if (vals.every((v) => YEAR.test(v)) && (yearHeader || vals.every((v) => Number(v) >= 1000 && Number(v) <= 2100)) && (yearHeader || new Set(vals).size > 1)) {
    return yearHeader || vals.length > 2 ? 'year' : 'number';
  }
  if (vals.every((v) => parseNumber(v) !== null)) return 'number';
  return 'text';
}

/** Parse CSV text into chart data. Problems (ragged rows, unreadable cells) are returned, not hidden. */
export function csvToData(text: string, opts: { delimiter?: string; maxRows?: number } = {}): { data: ChartData; problems: string[] } {
  const records = parseCsvRecords(text, opts.delimiter);
  const problems: string[] = [];
  if (records.length < 2) return { data: { columns: [], rows: [] }, problems: ['The table needs a header row and at least one row of data.'] };
  const header = records[0]!.map((h) => h.trim());
  const body = records.slice(1);
  const max = opts.maxRows ?? 20_000;
  if (body.length > max) problems.push(`The table has ${body.length} rows; charts take at most ${max}.`);
  body.forEach((r, i) => {
    if (r.length !== header.length) problems.push(`Row ${i + 2} has ${r.length} cells; the header has ${header.length}.`);
  });
  const taken = new Set<string>();
  const columns: ChartColumn[] = header.map((label, j) => {
    const type = inferType(label, body.map((r) => r[j] ?? ''));
    return { key: columnKey(label || `column ${j + 1}`, taken), label: label || `Column ${j + 1}`, type };
  });
  const rows: Cell[][] = body.slice(0, max).map((r, i) =>
    columns.map((c, j) => {
      const raw = (r[j] ?? '').trim();
      if (isMissing(raw)) return null;
      if (c.type === 'number' || c.type === 'year') {
        const n = parseNumber(raw);
        if (n === null) problems.push(`Row ${i + 2}, ${c.label}: "${raw}" is not a number.`);
        return n;
      }
      return raw;
    }),
  );
  return { data: { columns, rows }, problems: problems.slice(0, 20) };
}
