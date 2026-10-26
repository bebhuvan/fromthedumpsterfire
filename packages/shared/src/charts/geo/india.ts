// India's 28 states and 8 union territories as a tile grid: one equal square each, laid out roughly
// where each is on the map, so a small state counts for as much on the page as a large one. A tile
// grid draws no boundaries. Codes are ISO 3166-2:IN (with UK for Uttarakhand and CG for
// Chhattisgarh, as readers know them); names include older ones a source may use.

export interface IndiaTile {
  code: string;
  name: string;
  /** Other names a source may use, matched without case, spaces or "&". */
  aka: string[];
  col: number;
  row: number;
  ut?: boolean;
}

export const INDIA_TILES: readonly IndiaTile[] = [
  { code: 'JK', name: 'Jammu and Kashmir', aka: ['Jammu & Kashmir'], col: 1, row: 0, ut: true },
  { code: 'LA', name: 'Ladakh', aka: [], col: 2, row: 0, ut: true },
  { code: 'PB', name: 'Punjab', aka: [], col: 1, row: 1 },
  { code: 'HP', name: 'Himachal Pradesh', aka: [], col: 2, row: 1 },
  { code: 'CH', name: 'Chandigarh', aka: [], col: 0, row: 2, ut: true },
  { code: 'HR', name: 'Haryana', aka: [], col: 1, row: 2 },
  { code: 'UK', name: 'Uttarakhand', aka: ['Uttaranchal'], col: 2, row: 2 },
  { code: 'AR', name: 'Arunachal Pradesh', aka: [], col: 7, row: 2 },
  { code: 'RJ', name: 'Rajasthan', aka: [], col: 0, row: 3 },
  { code: 'DL', name: 'Delhi', aka: ['NCT of Delhi', 'National Capital Territory of Delhi'], col: 1, row: 3, ut: true },
  { code: 'UP', name: 'Uttar Pradesh', aka: [], col: 2, row: 3 },
  { code: 'BR', name: 'Bihar', aka: [], col: 3, row: 3 },
  { code: 'SK', name: 'Sikkim', aka: [], col: 4, row: 3 },
  { code: 'AS', name: 'Assam', aka: [], col: 6, row: 3 },
  { code: 'NL', name: 'Nagaland', aka: [], col: 7, row: 3 },
  { code: 'GJ', name: 'Gujarat', aka: [], col: 0, row: 4 },
  { code: 'MP', name: 'Madhya Pradesh', aka: [], col: 1, row: 4 },
  { code: 'CG', name: 'Chhattisgarh', aka: ['Chattisgarh'], col: 2, row: 4 },
  { code: 'JH', name: 'Jharkhand', aka: [], col: 3, row: 4 },
  { code: 'WB', name: 'West Bengal', aka: [], col: 4, row: 4 },
  { code: 'ML', name: 'Meghalaya', aka: [], col: 5, row: 4 },
  { code: 'MN', name: 'Manipur', aka: [], col: 7, row: 4 },
  { code: 'DH', name: 'Dadra and Nagar Haveli and Daman and Diu', aka: ['DNH and DD'], col: 0, row: 5, ut: true },
  { code: 'MH', name: 'Maharashtra', aka: [], col: 1, row: 5 },
  { code: 'TG', name: 'Telangana', aka: [], col: 2, row: 5 },
  { code: 'OD', name: 'Odisha', aka: ['Orissa'], col: 3, row: 5 },
  { code: 'TR', name: 'Tripura', aka: [], col: 5, row: 5 },
  { code: 'MZ', name: 'Mizoram', aka: [], col: 6, row: 5 },
  { code: 'GA', name: 'Goa', aka: [], col: 0, row: 6 },
  { code: 'KA', name: 'Karnataka', aka: [], col: 1, row: 6 },
  { code: 'AP', name: 'Andhra Pradesh', aka: [], col: 2, row: 6 },
  { code: 'LD', name: 'Lakshadweep', aka: [], col: 0, row: 7, ut: true },
  { code: 'KL', name: 'Kerala', aka: [], col: 1, row: 7 },
  { code: 'TN', name: 'Tamil Nadu', aka: [], col: 2, row: 7 },
  { code: 'PY', name: 'Puducherry', aka: ['Pondicherry', 'Pudducherry'], col: 3, row: 7, ut: true },
  { code: 'AN', name: 'Andaman and Nicobar Islands', aka: ['Andaman & Nicobar', 'Andaman and Nicobar'], col: 5, row: 8, ut: true },
];

const key = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
const byKey = new Map<string, IndiaTile>();
for (const t of INDIA_TILES) for (const n of [t.code, t.name, ...t.aka]) byKey.set(key(n), t);
// ISO 3166-2:IN's own codes where they differ from the ones printed.
for (const [iso, code] of [['UT', 'UK'], ['CT', 'CG'], ['OR', 'OD'], ['IN-UT', 'UK'], ['IN-CT', 'CG']] as const) byKey.set(key(iso), INDIA_TILES.find((t) => t.code === code)!);

/** The tile a row names, by its code (ISO 3166-2:IN, with or without "IN-") or its name. */
export function indiaTile(nameOrCode: string): IndiaTile | undefined {
  return byKey.get(key(nameOrCode.replace(/^IN-/i, '')));
}
