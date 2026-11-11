// Checks every brand pack before you ship: index entries exist, pack.json
// parses, colors are valid, and every referenced picture is really there.
// Run: node scripts/validate-packs.mjs   (exits non-zero on problems)
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packsDir = join(root, 'packs');
const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[a-z0-9_-]+$/i;
const THEME_KEYS = ['accent', 'accentInk', 'bg', 'card', 'line', 'text', 'dim'];
const IMG = /\.(png|jpe?g|webp|gif)$/i;
const MAX_IMG = 2 * 1024 * 1024;

let errors = 0, warnings = 0;
const err = (p, m) => { errors++; console.error(`✗ ${p}: ${m}`); };
const warn = (p, m) => { warnings++; console.warn(`! ${p}: ${m}`); };

function checkAsset(id, rel, what) {
  if (rel == null) return;
  if (typeof rel !== 'string' || !rel) return err(id, `${what} must be a file path`);
  const full = resolve(packsDir, id, rel);
  if (relative(packsDir, full).startsWith('..')) return err(id, `${what} "${rel}" points outside packs/`);
  if (!existsSync(full)) return err(id, `${what} "${rel}" does not exist`);
  if (!IMG.test(full)) err(id, `${what} "${rel}" should be .png, .jpg, .webp or .gif`);
  if (statSync(full).size > MAX_IMG) warn(id, `${what} "${rel}" is over 2 MB; shrink it to keep the extension light`);
}

let index;
try { index = JSON.parse(readFileSync(join(packsDir, 'index.json'), 'utf8')); }
catch (e) { err('index.json', e.message); process.exit(1); }
if (!Array.isArray(index.packs) || !index.packs.length) err('index.json', '"packs" must be a non-empty list');
if (!index.packs.includes('classic')) err('index.json', '"classic" must stay listed: it is the fallback pack');

for (const id of new Set(index.packs || [])) {
  if (!ID.test(id)) { err(id, 'pack ids may only use letters, numbers, - and _'); continue; }
  let p;
  try { p = JSON.parse(readFileSync(join(packsDir, id, 'pack.json'), 'utf8')); }
  catch (e) { err(id, `pack.json: ${e.message}`); continue; }

  if (typeof p.name !== 'string' || !p.name.trim()) err(id, '"name" is required');
  else if (p.name.length > 30) warn(id, '"name" is cut to 30 characters');
  for (const k of THEME_KEYS) if (p.theme && p.theme[k] !== undefined && !HEX.test(p.theme[k])) err(id, `theme.${k} must look like #a1b2c3`);
  if (p.theme) for (const k of Object.keys(p.theme)) if (!THEME_KEYS.includes(k)) warn(id, `theme.${k} is not used (known: ${THEME_KEYS.join(', ')})`);

  checkAsset(id, p.cinema && p.cinema.image, 'cinema.image');
  if (p.cinema && p.cinema.caption && p.cinema.caption.length > 40) warn(id, 'cinema.caption is cut to 40 characters');
  checkAsset(id, p.facepalm && p.facepalm.image, 'facepalm.image');
  if (p.facepalm && p.facepalm.opacity !== undefined && !(p.facepalm.opacity >= 0.1 && p.facepalm.opacity <= 1)) err(id, 'facepalm.opacity must be between 0.1 and 1');

  const r = p.rain || {};
  if (r.style && !['bills', 'emoji', 'images'].includes(r.style)) err(id, 'rain.style must be "bills", "emoji" or "images"');
  if ((r.style === 'emoji' || r.style === 'images') && !(Array.isArray(r.items) && r.items.length)) err(id, `rain.items is required for style "${r.style}"`);
  if (r.style === 'images') (r.items || []).forEach((it, i) => checkAsset(id, it, `rain.items[${i}]`));
  if (Array.isArray(r.items) && r.items.length > 12) warn(id, 'only the first 12 rain.items are used');
  if (r.palette) (r.palette || []).forEach((pair, i) => { if (!Array.isArray(pair) || !HEX.test(pair[0]) || !HEX.test(pair[1])) err(id, `rain.palette[${i}] must be ["#hex", "#hex"]`); });

  if (p.dust && p.dust.colors) p.dust.colors.forEach((c, i) => { if (!HEX.test(c)) err(id, `dust.colors[${i}] must look like #a1b2c3`); });

  if (!errors) console.log(`✓ ${id} (${p.name})`);
}

console.log(errors ? `\n${errors} problem(s), ${warnings} warning(s)` : `\nAll packs OK${warnings ? ` (${warnings} warning(s))` : ''}`);
process.exit(errors ? 1 : 0);
