// Everything the reader keeps lives on their phone: preferences, saved finds, what they've read and
// where they stopped. One small JSON file, read once at launch, written on change. No accounts.

import { useSyncExternalStore } from 'react';
import { File, Paths } from 'expo-file-system';
import type { ContentType } from '@fdf/shared/tokens';
import type { Title } from '@fdf/shared/haul';

export type ThemePref = 'system' | 'light' | 'dark';
export type TextSize = 'small' | 'regular' | 'large' | 'larger';

export interface SavedFind {
  n: number;
  id: string;
  type: ContentType;
  title: Title;
  creator: string;
  savedAt: string;
}

export interface Place {
  n: number;
  item?: string; // absent means the field note
  at: string;
}

interface State {
  v: 1;
  theme: ThemePref;
  textSize: TextSize;
  keepAllHauls: boolean;
  saved: SavedFind[]; // newest first
  read: string[]; // "n:itemId"
  place: Place | null;
  /** New-Haul notifications. `registered` is false until the server has the token. */
  push: { on: boolean; token?: string; platform?: string; registered: boolean };
}

const DEFAULTS: State = { v: 1, theme: 'system', textSize: 'regular', keepAllHauls: true, saved: [], read: [], place: null, push: { on: false, registered: false } };
const file = new File(Paths.document, 'reader.json');

function load(): State {
  try {
    if (!file.exists) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(file.textSync()) as Partial<State>) };
  } catch {
    return DEFAULTS;
  }
}

let state = load();
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
  try {
    if (!file.exists) file.create();
    file.write(JSON.stringify(state));
  } catch {
    // Losing a preference is better than crashing a reader.
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useReader<T>(pick: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => pick(state));
}

export const getReader = () => state;

const key = (n: number, id: string) => `${n}:${id}`;

export const reader = {
  setTheme: (theme: ThemePref) => set({ theme }),
  setTextSize: (textSize: TextSize) => set({ textSize }),
  setKeepAll: (keepAllHauls: boolean) => set({ keepAllHauls }),

  isSaved: (n: number, id: string) => state.saved.some((s) => s.n === n && s.id === id),
  toggleSave(find: Omit<SavedFind, 'savedAt'>) {
    const has = reader.isSaved(find.n, find.id);
    set({
      saved: has
        ? state.saved.filter((s) => !(s.n === find.n && s.id === find.id))
        : [{ ...find, savedAt: new Date().toISOString() }, ...state.saved],
    });
  },

  markRead(n: number, id: string) {
    const k = key(n, id);
    if (!state.read.includes(k)) set({ read: [...state.read, k] });
  },

  setPlace: (n: number, item?: string) => set({ place: { n, item, at: new Date().toISOString() } }),
  setPush: (push: State['push']) => set({ push }),
};

export const readKey = key;
