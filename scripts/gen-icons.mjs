// Procedurally rasterizes the ERRATA app icons to PNG using only Node built-ins.
// Usage: node scripts/gen-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'icons');
const SS = 4; // supersampling factor per axis (4x4 = 16 samples per pixel)

// Palette
const INK = [0x1b, 0x1a, 0x22];
const CREAM = [0xf3, 0xea, 0xd6];
const RED = [0xd7, 0x26, 0x3d];
const RULE = [0xa9, 0xbf, 0xdc]; // faint blue ruled lines

// Artwork geometry (art space: 0..1 square, centred on 0.5)
const PAPER_R = 0.34;
const RULE_YS = [0.37, 0.45, 0.53];
const TIP = [0.36, 0.66];
const BACK = [0.68, 0.30];
const LX = BACK[0] - TIP[0];
const LY = BACK[1] - TIP[1];
const LEN = Math.hypot(LX, LY);
const UX = LX / LEN; // along nib, tip -> back
const UY = LY / LEN;
const VX = -UY; // across nib
const VY = UX;
const HALF = 0.11; // max nib half-width
const UC = 1 - HALF / LEN; // where the rounded back cap starts (in u units)
const HOLE_U = 0.62; // breather hole position along the nib
const SPLAT = [
  { x: 0.30, y: 0.72, r: 0.028 },
  { x: 0.265, y: 0.765, r: 0.011 },
  { x: 0.325, y: 0.775, r: 0.008 },
];

function inNib(X, Y) {
  const rx = X - TIP[0];
  const ry = Y - TIP[1];
  const u = (rx * UX + ry * UY) / LEN;
  const v = rx * VX + ry * VY;
  if (u < 0 || u > 1) return false;
  if (u <= UC) return Math.abs(v) <= HALF * Math.min(1, Math.sqrt(u / 0.5));
  const du = (u - UC) * LEN;
  return du * du + v * v <= HALF * HALF;
}

function inSlit(X, Y) {
  const rx = X - TIP[0];
  const ry = Y - TIP[1];
  const u = (rx * UX + ry * UY) / LEN;
  const v = rx * VX + ry * VY;
  return u >= 0.05 && u <= HOLE_U && Math.abs(v) <= 0.0075;
}

function inHole(X, Y) {
  const rx = X - TIP[0];
  const ry = Y - TIP[1];
  const u = (rx * UX + ry * UY) / LEN;
  const v = rx * VX + ry * VY;
  const du = (u - HOLE_U) * LEN;
  return du * du + v * v <= 0.022 * 0.022;
}

// Returns [r, g, b, a] for one sample point (a is 0 or 1; edges are averaged by the caller).
// Coordinates x,y are in icon space (0..1). When maskable, the background is full-bleed and the
// artwork is scaled into the central 80% (well inside the 70% safe zone).
function sample(x, y, maskable) {
  if (!maskable) {
    const R = 0.2; // corner radius of the rounded square
    const qx = Math.max(Math.abs(x - 0.5) - (0.5 - R), 0);
    const qy = Math.max(Math.abs(y - 0.5) - (0.5 - R), 0);
    if (qx * qx + qy * qy > R * R) return [0, 0, 0, 0];
  }
  const s = maskable ? 0.8 : 1;
  const X = 0.5 + (x - 0.5) / s;
  const Y = 0.5 + (y - 0.5) / s;

  let c = INK;
  const dx = X - 0.5;
  const dy = Y - 0.5;
  if (dx * dx + dy * dy <= PAPER_R * PAPER_R) {
    c = CREAM;
    for (const ly of RULE_YS) {
      if (Math.abs(Y - ly) < 0.0045 && X > 0.2 && X < 0.8) c = RULE;
    }
    if (inNib(X, Y)) {
      c = RED;
      if (inSlit(X, Y) || inHole(X, Y)) c = INK;
    }
  }
  for (const d of SPLAT) {
    const ex = X - d.x;
    const ey = Y - d.y;
    if (ex * ex + ey * ey <= d.r * d.r) {
      c = RED;
      break;
    }
  }
  return [c[0], c[1], c[2], 1];
}

function renderRGBA(size, maskable) {
  const out = Buffer.alloc(size * size * 4);
  const N = SS * SS;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let pr = 0;
      let pg = 0;
      let pb = 0;
      let pa = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          const c = sample(x, y, maskable);
          pr += c[0] * c[3];
          pg += c[1] * c[3];
          pb += c[2] * c[3];
          pa += c[3];
        }
      }
      const o = (py * size + px) * 4;
      if (pa > 0) {
        out[o] = Math.round(pr / pa);
        out[o + 1] = Math.round(pg / pa);
        out[o + 2] = Math.round(pb / pa);
      }
      out[o + 3] = Math.round((pa / N) * 255);
    }
  }
  return out;
}

// ---- PNG encoding (RGBA, 8-bit, filter type 0) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // no interlace
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 (None)
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const TARGETS = [
  { file: 'errata-180.png', size: 180, maskable: false },
  { file: 'errata-192.png', size: 192, maskable: false },
  { file: 'errata-512.png', size: 512, maskable: false },
  { file: 'errata-maskable-512.png', size: 512, maskable: true },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const t of TARGETS) {
  const png = encodePNG(t.size, renderRGBA(t.size, t.maskable));
  writeFileSync(join(OUT_DIR, t.file), png);
  console.log(`${t.file}: ${t.size}x${t.size}, ${png.length} bytes`);
}
