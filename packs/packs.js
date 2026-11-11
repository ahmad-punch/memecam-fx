// Brand packs: a folder under packs/ with a pack.json and its pictures.
// Listed in packs/index.json (extensions can't list their own folders).
// Shared by the popup and the effects engine. See docs/BRAND-PACKS.md.

export const DEFAULT_PACK = 'classic';

const FALLBACK = {
  id: 'classic',
  name: 'Classic',
  description: '',
  theme: {
    accent: '#ffcf4a', accentInk: '#1a1520', bg: '#141118', card: '#1e1a24',
    line: '#2e2836', text: '#eee8f4', dim: '#9a90a8',
  },
  cinema: { label: 'Absolute Cinema', image: null, caption: 'ABSOLUTE CINEMA' },
  facepalm: { label: 'Facepalm', image: null, opacity: 0.5 },
  rain: {
    label: 'Cash rain', style: 'bills', symbol: '$', value: '100', items: [],
    palette: [['#a9d18e', '#5f8f45'], ['#b7d9a0', '#6b9a52'], ['#9cc784', '#557f3d']],
  },
  dust: { colors: ['#423a34'] },
};

const HEX = /^#[0-9a-f]{6}$/i;
const str = (v, d, max = 60) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : d);
const hex = (v, d) => (typeof v === 'string' && HEX.test(v) ? v : d);
const num = (v, d, lo, hi) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

const url = (path) => chrome.runtime.getURL(path);

async function fetchJSON(path) {
  const r = await fetch(url(path));
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

// Asset paths in pack.json are relative to the pack folder ("../_shared/x.png" works).
function asset(id, p) {
  if (typeof p !== 'string' || !p) return null;
  const full = new URL(p, `https://x/packs/${id}/`).pathname.slice(1);
  if (!full.startsWith('packs/')) return null;   // stay inside packs/
  return url(full);
}

export function normalizePack(id, raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const F = FALLBACK;
  const t = r.theme || {}, c = r.cinema || {}, f = r.facepalm || {}, rn = r.rain || {}, d = r.dust || {};
  const style = ['bills', 'emoji', 'images'].includes(rn.style) ? rn.style : F.rain.style;
  const items = Array.isArray(rn.items) ? rn.items.filter((x) => typeof x === 'string' && x).slice(0, 12) : [];
  const palette = Array.isArray(rn.palette)
    ? rn.palette.filter((p) => Array.isArray(p) && HEX.test(p[0]) && HEX.test(p[1])).slice(0, 6) : [];
  const dust = (Array.isArray(d.colors) ? d.colors : []).filter((x) => HEX.test(x)).slice(0, 8);
  return {
    id,
    name: str(r.name, id, 30),
    description: str(r.description, '', 120),
    theme: Object.fromEntries(Object.entries(F.theme).map(([k, v]) => [k, hex(t[k], v)])),
    cinema: {
      label: str(c.label, F.cinema.label, 30),
      image: asset(id, c.image),
      caption: str(c.caption, F.cinema.caption, 40),
    },
    facepalm: {
      label: str(f.label, F.facepalm.label, 30),
      image: asset(id, f.image),
      opacity: num(f.opacity, F.facepalm.opacity, 0.1, 1),
    },
    rain: {
      label: str(rn.label, F.rain.label, 30),
      style: style === 'bills' || items.length ? style : 'bills',
      symbol: str(rn.symbol, F.rain.symbol, 3),
      value: str(rn.value, F.rain.value, 5),
      items: style === 'images' ? items.map((p) => asset(id, p)).filter(Boolean) : items,
      palette: palette.length ? palette : F.rain.palette,
    },
    dust: { colors: dust.length ? dust : F.dust.colors },
  };
}

export async function listPackIds() {
  try {
    const idx = await fetchJSON('packs/index.json');
    const ids = (idx.packs || []).filter((x) => typeof x === 'string' && /^[a-z0-9_-]+$/i.test(x));
    return ids.length ? ids : [DEFAULT_PACK];
  } catch (e) {
    console.warn('[MemeCam FX] could not read packs/index.json', e);
    return [DEFAULT_PACK];
  }
}

// Never throws: a broken pack falls back to the default pack, then to built-in defaults.
export async function loadPack(id) {
  for (const tryId of [id, DEFAULT_PACK]) {
    if (!tryId || !/^[a-z0-9_-]+$/i.test(tryId)) continue;
    try { return normalizePack(tryId, await fetchJSON(`packs/${tryId}/pack.json`)); }
    catch (e) { console.warn(`[MemeCam FX] pack "${tryId}" failed to load`, e); }
  }
  return normalizePack(DEFAULT_PACK, FALLBACK);
}

export async function listPacks() {
  const ids = await listPackIds();
  const packs = [];
  for (const id of ids) {
    try { packs.push(normalizePack(id, await fetchJSON(`packs/${id}/pack.json`))); }
    catch (e) { console.warn(`[MemeCam FX] pack "${id}" skipped`, e); }
  }
  return packs.length ? packs : [normalizePack(DEFAULT_PACK, FALLBACK)];
}
