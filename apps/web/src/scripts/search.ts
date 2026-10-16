// Client side of /search. Builds result rows with DOM APIs and textContent only, never innerHTML,
// so nothing from the index can become markup.

import { typeLabel, type ContentType } from '@fdf/shared/tokens';
import { query, type Hit, type SearchDoc } from '../lib/search';

const form = document.querySelector<HTMLFormElement>('[data-search-form]');
const input = document.querySelector<HTMLInputElement>('#q');
const results = document.querySelector<HTMLOListElement>('[data-results]');
const status = document.querySelector<HTMLElement>('[data-status]');
const filters = document.querySelector<HTMLElement>('[data-filters]');
const browse = document.querySelector<HTMLElement>('[data-browse]');
const surprise = document.querySelector<HTMLButtonElement>('[data-surprise]');

let docs: SearchDoc[] | null = null;
let type: ContentType | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function row(h: Hit) {
  const li = el('li', 'find');
  const a = el('a');
  a.href = h.doc.url;
  const main = el('span', 'find-main');
  const title = el('span', `find-title${h.doc.type === 'poem' ? ' poem' : ''}`, h.doc.title);
  if (h.doc.italic) {
    title.append(' ');
    title.append(el('em', undefined, h.doc.italic));
  }
  main.append(title, el('span', 'meta', `${h.doc.creator} · Haul ${h.doc.n}`));
  if (h.snippet) main.append(el('span', 'find-snippet', h.snippet));
  a.append(main, el('span', `chip t-${h.doc.type}`, typeLabel[h.doc.type]));
  li.append(a);
  return li;
}

function renderFilters(all: Hit[]) {
  if (!filters) return;
  const types = [...new Set(all.map((h) => h.doc.type))];
  filters.replaceChildren();
  filters.hidden = types.length < 2;
  if (types.length < 2) return;
  const make = (label: string, value: ContentType | null) => {
    const b = el('button', `filter${value ? ` t-${value}` : ''}`, label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(type === value));
    b.addEventListener('click', () => {
      type = type === value ? null : value;
      render();
    });
    return b;
  };
  filters.append(make('All', null), ...types.map((t) => make(typeLabel[t], t)));
}

function render() {
  if (!docs || !input || !results || !status) return;
  const q = input.value.trim();
  if (!q) {
    results.replaceChildren();
    status.textContent = '';
    if (filters) filters.hidden = true;
    if (browse) browse.hidden = false;
    type = null;
    return;
  }
  if (browse) browse.hidden = true;
  const all = query(docs, q);
  if (type && !all.some((h) => h.doc.type === type)) type = null;
  renderFilters(all);
  const hits = type ? all.filter((h) => h.doc.type === type) : all;
  results.replaceChildren(...hits.map(row));
  status.textContent = hits.length ? `${hits.length} ${hits.length === 1 ? 'find' : 'finds'}` : 'Nothing matches yet. Try a person, a place, a year or an idea.';
}

function syncUrl() {
  if (!input) return;
  const url = new URL(location.href);
  const q = input.value.trim();
  if (q) url.searchParams.set('q', q);
  else url.searchParams.delete('q');
  history.replaceState(null, '', url);
}

async function start() {
  if (!input) return;
  try {
    const res = await fetch('/search.json', { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    docs = (await res.json()) as SearchDoc[];
  } catch {
    if (status) status.textContent = 'Search could not load. The index below still works.';
    return;
  }
  const initial = new URL(location.href).searchParams.get('q');
  if (initial) input.value = initial;
  input.addEventListener('input', () => {
    render();
    syncUrl();
  });
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    render();
    syncUrl();
  });
  if (surprise && docs.length) {
    surprise.hidden = false;
    surprise.addEventListener('click', () => {
      const pick = docs![Math.floor(Math.random() * docs!.length)];
      if (pick) location.href = pick.url;
    });
  }
  render();
}

void start();
