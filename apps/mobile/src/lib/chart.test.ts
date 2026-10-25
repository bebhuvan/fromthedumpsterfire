import { describe, expect, it } from 'vitest';
import type { Chart } from '@fdf/shared/charts';
import type { Item } from '@fdf/shared/haul';
import { chartPictureUrls, chartTable, firstChart, pictureFileName } from './chart';
import { formName, formOf } from './forms';
import { seedData } from './seedData';

const chart: Chart = {
  form: 'bar',
  title: 'Rain',
  units: '₹ crore',
  geography: 'India',
  sources: [{ maker: 'RBI', dataset: 'Handbook', url: 'https://rbi.org.in/', licence: 'GODL-India', retrieved: '2026-10-25' }],
  measure: { basis: 'absolute', money: { currency: 'INR', prices: 'nominal' } },
  data: {
    columns: [
      { key: 'state', label: 'State', type: 'text' },
      { key: 'v', label: 'Spending', type: 'number', unit: '₹ crore' },
      { key: 'd', label: 'Day', type: 'date' },
    ],
    rows: [
      ['Kerala', 1234567.5, '2024-03-12'],
      ['Goa', null, '2024-03-13'],
      ['Assam', -42, '2024-03-14'],
    ],
  },
  encode: { label: 'state', y: 'v' },
};

describe('chart pictures on the phone', () => {
  it('keeps a published picture under its immutable path, inside the downloads', () => {
    expect(pictureFileName('https://files.fromthedumpsterfire.com/hauls/001/media/rain-1-chart-light.png')).toBe('hauls__001__media__rain-1-chart-light.png');
  });
  it('keeps nothing else', () => {
    expect(pictureFileName('http://files.fromthedumpsterfire.com/hauls/001/x.png')).toBeNull();
    expect(pictureFileName('https://files.fromthedumpsterfire.com/seed/x.png')).toBeNull();
    expect(pictureFileName('https://files.fromthedumpsterfire.com/hauls/../x.png')).toBeNull();
    expect(pictureFileName('https://files.fromthedumpsterfire.com/hauls/001/x.jpg')).toBeNull();
  });
  it('lists both themes of every chart in a Haul', () => {
    const img = (s: string) => ({ url: `https://f.example/hauls/001/media/a-${s}.png`, width: 1125, height: 900 });
    const items = [{ blocks: [{ kind: 'chart', chart, images: { light: img('l'), dark: img('d') } }, { kind: 'chart', chart }] }] as unknown as Item[];
    expect(chartPictureUrls({ items })).toEqual([img('l').url, img('d').url]);
  });
});

describe('the numbers behind a chart', () => {
  it('prints every column, rupees in Indian grouping, missing values as a dash', () => {
    const t = chartTable(chart);
    expect(t.head).toEqual(['State', 'Spending (₹ crore)', 'Day']);
    expect(t.numeric).toEqual([false, true, false]);
    expect(t.rows[0]).toEqual(['Kerala', '12,34,567.5', '12 Mar 2024']);
    expect(t.rows[1]![1]).toBe('–');
    expect(t.rows[2]![1]).toBe('–42');
  });
});

describe('the figure', () => {
  it('sets a chart-led item as the figure, and one without a chart as an opening', () => {
    expect(formOf({ type: 'chart', blocks: [{ kind: 'chart', chart }] })).toBe('figure');
    expect(formOf({ type: 'chart' })).toBe('opening');
    expect(formName.figure).toBe('The figure');
  });
  it('leads with the first chart', () => {
    const blocks = [{ kind: 'quote', text: 'x' }, { kind: 'chart', chart }] as Item['blocks'];
    expect(firstChart(blocks)).toBe(blocks![1]);
  });
  it('draws a table for every sample chart', () => {
    const charts = Object.values(seedData.hauls).flatMap((h) => h.items.flatMap((i) => i.blocks ?? [])).filter((b) => b.kind === 'chart');
    for (const b of charts) {
      const t = chartTable(b.chart);
      expect(t.rows.length).toBe(b.chart.data.rows.length);
      expect(t.rows.every((r) => r.length === t.head.length)).toBe(true);
    }
  });
});
