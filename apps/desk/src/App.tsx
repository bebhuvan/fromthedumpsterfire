// The shell: masthead, navigation, spend, theme, routes, and global capture by paste or drop.

import { useEffect, useState } from 'react';
import { isOnlyUrls } from '@fdf/shared/detect';
import { api, type Captured, type Spend } from './api';
import { isEditable, Link, navigate, ToastHost, usePath, useToast } from './lib/core';
import { cycleTheme } from './theme';
import { Flame } from './ui/parts';
import { Tray } from './screens/Tray';
import { ItemReview } from './screens/Item';
import { Hauls } from './screens/Hauls';
import { Composer } from './screens/Composer';
import { Settings } from './screens/Settings';
import { Links } from './screens/Links';
import { Shelf } from './screens/Shelf';
import { BookPage } from './screens/Book';
import { HaulCheck } from './screens/HaulCheck';
import { HaulSuggestions } from './screens/HaulSuggestions';

export function App() {
  return (
    <ToastHost>
      <Shell />
    </ToastHost>
  );
}

function Shell() {
  const { path } = usePath();
  const toast = useToast();
  const [spend, setSpend] = useState<Spend | null>(null);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'system');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api.get<{ spend: Spend }>('/api/me').then((r) => setSpend(r.spend), () => {});
  }, [path, tick]);

  // Paste a link anywhere (outside a text box) to capture it.
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (isEditable(e.target)) return;
      const text = e.clipboardData?.getData('text') ?? '';
      if (!text || !isOnlyUrls(text)) return;
      e.preventDefault();
      try {
        const r = await api.post<{ captured: Captured[] }>('/api/capture', { paste: text });
        const fresh = r.captured.filter((c) => !c.duplicateOf).length;
        toast(fresh ? `Captured ${fresh} link${fresh === 1 ? '' : 's'}` : 'Already in the tray');
        setTick((t) => t + 1);
        window.dispatchEvent(new Event('desk:captured'));
      } catch (err) {
        toast(`Capture failed: ${err instanceof Error ? err.message : err}`, true);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [toast]);

  // Arriving from the share target.
  useEffect(() => {
    const s = new URLSearchParams(location.search);
    const n = s.get('shared');
    if (n !== null) {
      toast(Number(n) ? `Captured ${n} from share` : 'Nothing to capture in that share');
      navigate('/', true);
    }
  }, [toast]);

  const section = path.startsWith('/haul') ? 'hauls' : path.startsWith('/shelf') ? 'shelf' : path.startsWith('/settings') ? 'settings' : path.startsWith('/links') ? 'links' : 'tray';
  let screen;
  const item = /^\/item\/([\w-]+)/.exec(path);
  const haul = /^\/haul\/([\w-]+)/.exec(path);
  const haulPart = /^\/haul\/([\w-]+)\/(check|suggestions)$/.exec(path);
  const book = /^\/shelf\/([a-z0-9-]+)/.exec(path);
  if (item) screen = <ItemReview id={item[1]!} />;
  else if (haulPart) screen = haulPart[2] === 'check' ? <HaulCheck id={haulPart[1]!} /> : <HaulSuggestions id={haulPart[1]!} />;
  else if (haul) screen = <Composer id={haul[1]!} />;
  else if (book) screen = <BookPage id={book[1]!} />;
  else if (path === '/shelf') screen = <Shelf />;
  else if (path === '/hauls') screen = <Hauls />;
  else if (path === '/settings') screen = <Settings />;
  else if (path === '/links') screen = <Links />;
  else screen = <Tray />;

  return (
    <div className="shell">
      <header className="top">
        <div className="top-in">
          <Link to="/" className="mast" aria-label="The Desk, home">
            <Flame />
            <span className="mast-name">The Desk</span>
          </Link>
          <nav className="nav" aria-label="Sections">
            <Link to="/" aria-current={section === 'tray' ? 'page' : undefined}>
              Tray
            </Link>
            <Link to="/links" aria-current={section === 'links' ? 'page' : undefined}>
              Links
            </Link>
            <Link to="/hauls" aria-current={section === 'hauls' ? 'page' : undefined}>
              Hauls
            </Link>
            <Link to="/shelf" aria-current={section === 'shelf' ? 'page' : undefined}>
              Shelf
            </Link>
            <Link to="/settings" aria-current={section === 'settings' ? 'page' : undefined}>
              Settings
            </Link>
          </nav>
          <span className="top-spacer" />
          <div className="top-meta">
            {spend && (
              <span className={`spend num ${spend.state === 'ceiling' ? 'bad' : spend.state === 'warn' ? 'warn' : ''}`} title="Model spend this month against the ceiling">
                ${spend.spentUsd.toFixed(2)} of ${spend.ceilingUsd.toFixed(0)} this month
              </span>
            )}
            <button type="button" className="btn quiet small" onClick={() => setTheme(cycleTheme())} aria-label="Change colour scheme">
              {theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'Auto'}
            </button>
          </div>
        </div>
      </header>
      <main className="page" key={section}>
        {screen}
      </main>
    </div>
  );
}

