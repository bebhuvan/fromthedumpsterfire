// Small infrastructure: a history router, toasts, data loading, autosave that never loses text,
// and keyboard helpers.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { safeGet, safeSet } from '../theme';

// ---------------------------------------------------------------- router

const listeners = new Set<() => void>();
export function navigate(to: string, replace = false) {
  if (to === location.pathname + location.search) return;
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  listeners.forEach((l) => l());
  window.scrollTo({ top: 0 });
}
window.addEventListener('popstate', () => listeners.forEach((l) => l()));

export function usePath(): { path: string; search: URLSearchParams } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return { path: location.pathname, search: new URLSearchParams(location.search) };
}

export function Link({ to, children, ...rest }: { to: string; children: ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return (
    <a
      href={to}
      {...rest}
      onClick={(e) => {
        rest.onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

/** Only http(s) links are ever rendered as hrefs; anything else (javascript:, data:) becomes inert. */
export function safeHref(u: string | null | undefined): string | undefined {
  if (!u) return undefined;
  try {
    const p = new URL(u);
    return p.protocol === 'https:' || p.protocol === 'http:' ? p.toString() : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- toasts

interface Toast {
  id: number;
  text: string;
  bad?: boolean;
}
const ToastCtx = createContext<(text: string, bad?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, bad = false) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, text, bad }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), bad ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.bad ? ' bad' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------------------------------------------------------------- data

export function useLoad<T>(load: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; reload: () => Promise<void>; setData: React.Dispatch<React.SetStateAction<T | null>> } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const n = ++seq.current;
    try {
      const d = await load();
      if (n === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (n === seq.current) setError(e instanceof Error ? e.message : String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, reload, setData };
}

/** Poll while `active` is true. */
export function usePoll(fn: () => void, active: boolean, ms = 4000) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => ref.current(), ms);
    return () => clearInterval(t);
  }, [active, ms]);
}

// ---------------------------------------------------------------- autosave

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'offline' | 'restored';

interface Draft {
  v: string;
  at: number;
  base: string;
}

/**
 * Text that is never lost. Every keystroke goes to localStorage at once; the server gets it after a
 * pause. If the page closes before the server answers, the local copy comes back next time (unless
 * the server's text has since changed from what the draft was based on).
 */
export function useAutosave(key: string, server: string, save: (v: string) => Promise<unknown>, delay = 800) {
  const storeKey = `desk:draft:${key}`;
  const [value, setValue] = useState(server);
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);
  const saveRef = useRef(save);
  saveRef.current = save;
  const serverRef = useRef(server);

  const loadedKey = useRef<string | null>(null);
  const busy = useRef(false);

  // Load: prefer an unsaved local draft that was based on the server text we now see.
  useEffect(() => {
    serverRef.current = server;
    if (loadedKey.current === key) {
      // Same field, new server text (often our own save coming back). Never overwrite typing in flight.
      if (!timer.current && !busy.current && latest.current !== server) {
        latest.current = server;
        setValue(server);
      }
      return;
    }
    loadedKey.current = key;
    let initial = server;
    let restored = false;
    try {
      const raw = safeGet(storeKey);
      const d = raw ? (JSON.parse(raw) as Draft) : null;
      if (d && d.v !== server && (d.base === server || !server)) {
        initial = d.v;
        restored = true;
      } else if (d) safeSet(storeKey, '');
    } catch {
      /* ignore */
    }
    latest.current = initial;
    setValue(initial);
    setState(restored ? 'restored' : 'idle');
    if (restored) schedule(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, server]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const v = latest.current;
    if (v === serverRef.current) {
      safeSet(storeKey, '');
      return;
    }
    setState('saving');
    busy.current = true;
    try {
      await saveRef.current(v);
      serverRef.current = v;
      if (latest.current === v) {
        safeSet(storeKey, '');
        setState('saved');
      }
    } catch {
      setState('offline');
      // Retry later; the text stays in localStorage meanwhile.
      timer.current = setTimeout(() => void flush(), 15_000);
    } finally {
      busy.current = false;
    }
  }, [storeKey]);

  function schedule(v: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), delay);
    void v;
  }

  const onChange = useCallback(
    (v: string) => {
      latest.current = v;
      setValue(v);
      setState('dirty');
      safeSet(storeKey, JSON.stringify({ v, at: Date.now(), base: serverRef.current } satisfies Draft));
      schedule(v);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storeKey, flush],
  );

  // Save on tab hide and before unload.
  useEffect(() => {
    const h = () => {
      if (document.visibilityState === 'hidden' && latest.current !== serverRef.current) void flush();
    };
    document.addEventListener('visibilitychange', h);
    window.addEventListener('pagehide', h);
    return () => {
      document.removeEventListener('visibilitychange', h);
      window.removeEventListener('pagehide', h);
      if (timer.current) void flush();
    };
  }, [flush]);

  return { value, onChange, state, flush };
}

export function SaveNote({ state }: { state: SaveState }) {
  const text =
    state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'dirty' ? 'Editing' : state === 'offline' ? 'Not saved yet. Kept on this device; it will retry.' : state === 'restored' ? 'Restored the text you had not saved.' : '';
  return <div className={`save-state${state === 'offline' ? ' warn' : ''}`}>{text}</div>;
}

// ---------------------------------------------------------------- keyboard

export const isEditable = (el: EventTarget | null) => {
  const e = el as HTMLElement | null;
  return !!e && (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA' || e.tagName === 'SELECT' || e.isContentEditable);
};

export function useKeys(map: Record<string, (e: KeyboardEvent) => void>, deps: unknown[] = []) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isEditable(e.target)) return;
      const f = map[e.key];
      if (f) {
        e.preventDefault();
        f(e);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso));
}
