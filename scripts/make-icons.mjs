// Draws the MemeCam FX icon at every size Chrome needs and writes PNGs to icons/.
// No dependencies: shapes are drawn with signed-distance functions and
// encoded with node's zlib. Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [16, 32, 48, 128];

// ---- shapes in a 0..1 coordinate space (signed distance, negative = inside)
const roundRect = (x, y, cx, cy, hw, hh, r) => {
  const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const circle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
const star = (x, y, cx, cy, r) => {
  // 4-point sparkle
  const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
  return Math.pow(dx, 0.5) + Math.pow(dy, 0.5) - Math.pow(r, 0.5);
};

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const C_TOP = hex('#7c3aed'), C_BOT = hex('#f43f5e'), WHITE = [255, 255, 255], INK = hex('#2a1640'), GOLD = hex('#ffd23f');

function shade(x, y) {
  // returns [r,g,b,a] (0..255) for one sample point
  let col = [0, 0, 0], a = 0;
  const over = (c, cov) => { if (cov <= 0) return; col = mix(col, c, a > 0 ? cov : 1); a = a + cov * (1 - a); };
  // background tile
  if (roundRect(x, y, 0.5, 0.5, 0.47, 0.47, 0.2) < 0) over(mix(C_TOP, C_BOT, Math.min(1, Math.max(0, (x + y) / 2))), 1);
  // camera body
  if (roundRect(x, y, 0.47, 0.56, 0.3, 0.21, 0.07) < 0) over(WHITE, 1);
  // viewfinder bump
  if (roundRect(x, y, 0.36, 0.33, 0.09, 0.05, 0.03) < 0) over(WHITE, 1);
  // lens ring + lens
  if (circle(x, y, 0.47, 0.57, 0.15) < 0) over(INK, 1);
  if (circle(x, y, 0.47, 0.57, 0.1) < 0) over(mix(C_TOP, C_BOT, 0.4), 1);
  if (circle(x, y, 0.43, 0.53, 0.035) < 0) over(WHITE, 0.9);
  // sparkle
  if (star(x, y, 0.8, 0.22, 0.15) < 0) over(GOLD, 1);
  return [...col, a * 255];
}

function render(size) {
  const ss = size <= 32 ? 6 : 4;
  const px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) for (let qx = 0; qx < size; qx++) {
    let r = 0, g = 0, b = 0, al = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const [cr, cg, cb, ca] = shade((qx + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size);
      r += cr * ca; g += cg * ca; b += cb * ca; al += ca;
    }
    const o = (py * size + qx) * 4, n = ss * ss;
    px[o] = al ? r / al : 0; px[o + 1] = al ? g / al : 0; px[o + 2] = al ? b / al : 0; px[o + 3] = al / n;
  }
  return png(size, size, px);
}

// ---- minimal PNG encoder
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(join(root, 'icons'), { recursive: true });
for (const s of SIZES) writeFileSync(join(root, 'icons', `icon${s}.png`), render(s));
console.log('icons written:', SIZES.join(', '));
