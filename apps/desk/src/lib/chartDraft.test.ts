// The chart editor's pure parts: a stored chart opened in the editor and saved again comes back the
// same, and a table read in gets a form and columns that the validator can check.

import { describe, expect, it } from 'vitest';
import { csvToData, validateChart, type Chart } from '@fdf/shared/charts';
import { assemble, autoEncode, clean, draftFrom, draftOf } from './chartDraft';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const fs: Any = await import('node:fs' as string);
const path: Any = await import('node:path' as string);
const url: Any = await import('node:url' as string);
const dir = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '../../../../docs/design-comps/charts/data');
const files: string[] = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f: string) => f.endsWith('.json')) : [];

describe('the chart editor', () => {
  it.each(files)('opens and saves %s unchanged', (f) => {
    const chart = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Chart;
    const again = clean(assemble(draftOf(chart)));
    expect(again).toEqual(clean(chart));
    expect(validateChart(again).errors).toEqual([]);
  });

  it('reads a pasted table into a line chart that needs only the editor’s words and a source', () => {
    const { data } = csvToData('year,rainfall_mm\n2020,2410\n2021,3110\n2022,NA\n2023,2800\n');
    const d = draftFrom(data);
    expect(d.form).toBe('line');
    expect(d.encode).toEqual({ x: 'year', y: 'rainfall_mm' });
    const rules = validateChart(clean(assemble(d))).errors.map((e) => e.rule);
    expect(rules).toEqual(expect.arrayContaining(['title', 'units', 'geography', 'source', 'licence', 'span']));
    const done = clean(
      assemble({
        ...d,
        title: 'Mumbai’s rain',
        units: 'mm',
        geography: 'Mumbai',
        sourceSpan: { from: '1901', to: '2023' },
        sources: [{ maker: 'India Meteorological Department', dataset: 'Rainfall', url: 'https://mausam.imd.gov.in/', licence: 'GODL-India', retrieved: '2026-10-25' }],
      }),
    );
    expect(validateChart(done).errors).toEqual([]);
    expect(done.span).toEqual({ from: '2020', to: '2023' });
  });

  it('keeps bars to categories or years, never both', () => {
    const { data } = csvToData('state,year,value\nGoa,2020,1\nKerala,2020,2\n');
    expect(autoEncode('bar', data)).toEqual({ label: 'state', y: 'value' });
  });
});
