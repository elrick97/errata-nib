// OWNER: render agent. Particles, rings, lines, bolts, damage numbers, splat decals, screen shake/flash.
// All state is module-local, struct-of-arrays, fixed capacity. No per-frame allocation.
import type { World } from '../types';
import { PALETTE } from '../types';

const SS = 2;            // sprite supersampling
const INV_SS = 1 / SS;

// ------------------------------------------------------------------ helpers
function mk(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * SS));
  c.height = Math.max(1, Math.ceil(h * SS));
  const g = c.getContext('2d')!;
  g.scale(SS, SS);
  return { c, g };
}
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = Math.random; // visual only; keeps sim RNG deterministic

// ------------------------------------------------------------------ particles
const PCAP = 600;
const px = new Float32Array(PCAP), py = new Float32Array(PCAP);
const pvx = new Float32Array(PCAP), pvy = new Float32Array(PCAP);
const pl = new Float32Array(PCAP), pm = new Float32Array(PCAP), psz = new Float32Array(PCAP);
const pc = new Uint8Array(PCAP);
let pHead = 0, pCount = 0;
const MAXC = 12;
const colorList: string[] = [];
const colorMap = new Map<string, number>();
const ccount = new Int32Array(MAXC);
function cidx(color: string): number {
  let i = colorMap.get(color);
  if (i === undefined) {
    if (colorList.length >= MAXC) return 0;
    i = colorList.length;
    colorList.push(color);
    colorMap.set(color, i);
  }
  return i;
}

// ------------------------------------------------------------------ rings
const RCAP = 40;
const rx = new Float32Array(RCAP), ry = new Float32Array(RCAP), rr = new Float32Array(RCAP);
const rl = new Float32Array(RCAP), rm = new Float32Array(RCAP), rw = new Float32Array(RCAP);
const rcol: string[] = new Array(RCAP).fill('#000');
let rCount = 0; // slots scanned by life>0

// ------------------------------------------------------------------ lines
const LCAP = 40;
const lx1 = new Float32Array(LCAP), ly1 = new Float32Array(LCAP), lx2 = new Float32Array(LCAP), ly2 = new Float32Array(LCAP);
const ll = new Float32Array(LCAP), lm = new Float32Array(LCAP), lw = new Float32Array(LCAP);
const lcol: string[] = new Array(LCAP).fill('#000');

// ------------------------------------------------------------------ bolts
const BCAP = 24;
const BPTS = 8;
const bpts = new Float32Array(BCAP * BPTS * 2);
const bl = new Float32Array(BCAP), bm = new Float32Array(BCAP);
const bcol: string[] = new Array(BCAP).fill('#000');

// ------------------------------------------------------------------ numbers
const NCAP = 60;
const nx = new Float32Array(NCAP), ny = new Float32Array(NCAP), nvy = new Float32Array(NCAP);
const nl = new Float32Array(NCAP), nm = new Float32Array(NCAP), npop = new Float32Array(NCAP);
const nspr: (HTMLCanvasElement | null)[] = new Array(NCAP).fill(null);
const numSprites = new Map<number, HTMLCanvasElement>();
const textSprites = new Map<string, HTMLCanvasElement>();

const NUM_FONT = 'bold 14px Georgia, "Times New Roman", serif';
const CRIT_FONT = 'italic 900 21px Georgia, "Times New Roman", serif';

let scratch: CanvasRenderingContext2D | null = null;
function measure(font: string, text: string): number {
  if (!scratch) scratch = document.createElement('canvas').getContext('2d')!;
  scratch.font = font;
  return scratch.measureText(text).width;
}

function textSprite(text: string, font: string, size: number, fill: string, rim: string, rimW: number): HTMLCanvasElement {
  const tw = Math.ceil(measure(font, text));
  const pad = rimW + 2;
  const W = tw + pad * 2, H = size + pad * 2 + 4;
  const { c, g } = mk(W, H);
  g.font = font;
  g.textBaseline = 'alphabetic';
  g.lineJoin = 'round';
  g.lineWidth = rimW;
  g.strokeStyle = rim;
  g.fillStyle = fill;
  g.strokeText(text, pad, pad + size * 0.9);
  g.fillText(text, pad, pad + size * 0.9);
  return c;
}

function numSprite(n: number, crit: boolean): HTMLCanvasElement {
  if (n < 0) n = 0;
  if (n > 9999) n = 9999;
  const key = crit ? n + 10000 : n;
  let s = numSprites.get(key);
  if (!s) {
    s = crit
      ? textSprite(n + '!', CRIT_FONT, 21, '#ffd23d', PALETTE.ink, 4)
      : textSprite(String(n), NUM_FONT, 14, PALETTE.ink, PALETTE.white, 3);
    numSprites.set(key, s);
  }
  return s;
}

function addNumber(x: number, y: number, spr: HTMLCanvasElement, life: number, pop: number): void {
  for (let i = 0; i < NCAP; i++) {
    if (nl[i] <= 0) {
      nx[i] = x; ny[i] = y; nvy[i] = -70;
      nl[i] = life; nm[i] = life; npop[i] = pop;
      nspr[i] = spr;
      return;
    }
  }
}

// ------------------------------------------------------------------ decals
const DCAP = 220;
const dx = new Float32Array(DCAP), dy = new Float32Array(DCAP), dsz = new Float32Array(DCAP);
const dspr: (HTMLCanvasElement | null)[] = new Array(DCAP).fill(null);
let dHead = 0, dN = 0;
const SPLAT_BASES = 6, SPLAT_ROTS = 8, SPLAT_PX = 64;
const splatCache: (HTMLCanvasElement | undefined)[] = new Array(3 * SPLAT_BASES * SPLAT_ROTS);
const SPLAT_COLORS = [PALETTE.ink, PALETTE.red, PALETTE.purple];

function buildSplat(set: number, base: number, rot: number): HTMLCanvasElement {
  const { c, g } = mk(SPLAT_PX, SPLAT_PX);
  const r = mulberry(base * 7919 + 13);
  g.translate(SPLAT_PX / 2, SPLAT_PX / 2);
  g.rotate((rot / SPLAT_ROTS) * Math.PI * 2 + base);
  g.fillStyle = SPLAT_COLORS[set];
  // main blob
  const n = 10, R = 13;
  const bx: number[] = [], by: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rad = R * (0.65 + r() * 0.6);
    bx.push(Math.cos(a) * rad); by.push(Math.sin(a) * rad);
  }
  g.beginPath();
  g.moveTo((bx[n - 1] + bx[0]) / 2, (by[n - 1] + by[0]) / 2);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    g.quadraticCurveTo(bx[i], by[i], (bx[i] + bx[j]) / 2, (by[i] + by[j]) / 2);
  }
  g.closePath();
  g.fill();
  // spikes / streaks
  const streaks = 2 + ((r() * 3) | 0);
  for (let i = 0; i < streaks; i++) {
    const a = r() * Math.PI * 2, len = 18 + r() * 11, wd = 1.2 + r() * 2.2;
    g.beginPath();
    g.moveTo(Math.cos(a + 1.57) * wd, Math.sin(a + 1.57) * wd);
    g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    g.lineTo(Math.cos(a - 1.57) * wd, Math.sin(a - 1.57) * wd);
    g.closePath();
    g.fill();
  }
  // droplets
  const drops = 5 + ((r() * 5) | 0);
  for (let i = 0; i < drops; i++) {
    const a = r() * Math.PI * 2, d = 16 + r() * 13, rad = 0.9 + r() * 2.6;
    g.beginPath();
    g.arc(Math.cos(a) * d, Math.sin(a) * d, rad, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function splatSprite(set: number, base: number, rot: number): HTMLCanvasElement {
  const k = (set * SPLAT_BASES + base) * SPLAT_ROTS + rot;
  let s = splatCache[k];
  if (!s) { s = buildSplat(set, base, rot); splatCache[k] = s; }
  return s;
}

// ------------------------------------------------------------------ public API
export function resetFx(): void {
  pl.fill(0); pHead = 0; pCount = 0;
  rl.fill(0); rCount = 0;
  ll.fill(0);
  bl.fill(0);
  nl.fill(0);
  for (let i = 0; i < NCAP; i++) nspr[i] = null;
  for (let i = 0; i < DCAP; i++) dspr[i] = null;
  dHead = 0; dN = 0;
}

export function updateFx(w: World, dt: number): void {
  // shake
  const cam = w.cam;
  cam.shake *= Math.exp(-10 * dt);
  if (cam.shake < 0.05) cam.shake = 0;
  if (cam.shake > 0 && w.meta.settings.shake !== false) {
    cam.ox = (rnd() * 2 - 1) * cam.shake;
    cam.oy = (rnd() * 2 - 1) * cam.shake;
  } else { cam.ox = 0; cam.oy = 0; }
  // flash
  if (w.flashA > 0) {
    w.flashA *= Math.exp(-6 * dt);
    if (w.flashA < 0.005) w.flashA = 0;
  }
  // particles
  const drag = Math.exp(-3.2 * dt);
  let cnt = 0;
  for (let c = 0; c < MAXC; c++) ccount[c] = 0;
  for (let i = 0; i < PCAP; i++) {
    const l = pl[i];
    if (l <= 0) continue;
    const nlf = l - dt;
    if (nlf <= 0) { pl[i] = 0; continue; }
    pl[i] = nlf;
    px[i] += pvx[i] * dt; py[i] += pvy[i] * dt;
    pvx[i] *= drag; pvy[i] *= drag;
    ccount[pc[i]]++;
    cnt++;
  }
  pCount = cnt;
  // rings
  let rc = 0;
  for (let i = 0; i < RCAP; i++) {
    if (rl[i] > 0) { rl[i] -= dt; if (rl[i] > 0) rc++; else rl[i] = 0; }
  }
  rCount = rc;
  for (let i = 0; i < LCAP; i++) if (ll[i] > 0) { ll[i] -= dt; if (ll[i] < 0) ll[i] = 0; }
  for (let i = 0; i < BCAP; i++) if (bl[i] > 0) { bl[i] -= dt; if (bl[i] < 0) bl[i] = 0; }
  // numbers
  const nd = Math.exp(-3.5 * dt);
  for (let i = 0; i < NCAP; i++) {
    if (nl[i] > 0) {
      nl[i] -= dt;
      if (nl[i] <= 0) { nl[i] = 0; nspr[i] = null; continue; }
      ny[i] += nvy[i] * dt;
      nvy[i] *= nd;
    }
  }
}

/** Particle burst. size in world units. */
export function burst(w: World, x: number, y: number, color: string, count: number, speed: number, size = 3): void {
  void w;
  const ci = cidx(color);
  let n = count | 0;
  const room = PCAP - pCount;
  if (room <= 0) return;
  if (n > room) n = room;
  for (let k = 0; k < n; k++) {
    // find a free slot starting at head
    let idx = pHead, tries = 0;
    while (pl[idx] > 0 && tries < PCAP) { idx = idx + 1 === PCAP ? 0 : idx + 1; tries++; }
    if (tries >= PCAP) return;
    pHead = idx + 1 === PCAP ? 0 : idx + 1;
    const a = rnd() * 6.2831853;
    const sp = speed * (0.4 + 0.6 * rnd());
    px[idx] = x; py[idx] = y;
    pvx[idx] = Math.cos(a) * sp; pvy[idx] = Math.sin(a) * sp;
    const life = 0.25 + rnd() * 0.35;
    pl[idx] = life; pm[idx] = life;
    psz[idx] = size * (0.6 + 0.8 * rnd());
    pc[idx] = ci;
    pCount++; ccount[ci]++;
  }
}

/** Expanding ring (shockwave). */
export function ring(w: World, x: number, y: number, radius: number, color: string, life = 0.4, width = 4): void {
  void w;
  let slot = -1;
  for (let i = 0; i < RCAP; i++) if (rl[i] <= 0) { slot = i; break; }
  if (slot < 0) return;
  rx[slot] = x; ry[slot] = y; rr[slot] = radius;
  rl[slot] = life; rm[slot] = life; rw[slot] = width; rcol[slot] = color;
}

/** Floating damage number. */
export function dmgNumber(w: World, x: number, y: number, amount: number, crit: boolean): void {
  void w;
  addNumber(x + (rnd() - 0.5) * 10, y - 8, numSprite(Math.round(amount), crit), crit ? 0.85 : 0.6, crit ? 1.9 : 1.55);
}

/** Floating text (e.g. "+12 HP", "CRIT!", "EVOLVED"). */
export function floatText(w: World, x: number, y: number, text: string, color: string, size = 14): void {
  void w;
  const key = text + '|' + color + '|' + size;
  let s = textSprites.get(key);
  if (!s) {
    if (textSprites.size > 300) textSprites.clear();
    s = textSprite(text, 'bold ' + size + 'px Georgia, "Times New Roman", serif', size, color, PALETTE.ink, 3.5);
    textSprites.set(key, s);
  }
  addNumber(x, y, s, 1.0, 1.7);
}

/** Persistent ink splat decal on the paper (ring buffer, capped). */
export function splat(w: World, x: number, y: number, radius: number, color: string): void {
  void w;
  const set = color === PALETTE.red || color === PALETTE.redDark || color === 'red' ? 1 : color === PALETTE.purple ? 2 : 0;
  const i = dHead;
  dHead = i + 1 === DCAP ? 0 : i + 1;
  if (dN < DCAP) dN++;
  dx[i] = x + (rnd() - 0.5) * 4; dy[i] = y + (rnd() - 0.5) * 4;
  let sz = (radius / 22) * SPLAT_PX * (0.9 + rnd() * 0.25);
  if (sz > 200) sz = 200;
  dsz[i] = sz;
  dspr[i] = splatSprite(set, (rnd() * SPLAT_BASES) | 0, (rnd() * SPLAT_ROTS) | 0);
}

/** Straight line effect (strikethrough slash, lightning). */
export function line(w: World, x1: number, y1: number, x2: number, y2: number, color: string, width: number, life: number): void {
  void w;
  for (let i = 0; i < LCAP; i++) {
    if (ll[i] <= 0) {
      lx1[i] = x1; ly1[i] = y1; lx2[i] = x2; ly2[i] = y2;
      ll[i] = life; lm[i] = life; lw[i] = width; lcol[i] = color;
      return;
    }
  }
}

/** Jagged lightning bolt between two points. */
export function bolt(w: World, x1: number, y1: number, x2: number, y2: number, color: string, life = 0.2): void {
  void w;
  let slot = -1;
  for (let i = 0; i < BCAP; i++) if (bl[i] <= 0) { slot = i; break; }
  if (slot < 0) return;
  const base = slot * BPTS * 2;
  const ddx = x2 - x1, ddy = y2 - y1;
  const len = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
  const nxp = -ddy / len, nyp = ddx / len;
  const amp = 4 + len * 0.07;
  bpts[base] = x1; bpts[base + 1] = y1;
  for (let k = 1; k < BPTS - 1; k++) {
    const t = k / (BPTS - 1);
    const o = (rnd() * 2 - 1) * amp;
    bpts[base + k * 2] = x1 + ddx * t + nxp * o;
    bpts[base + k * 2 + 1] = y1 + ddy * t + nyp * o;
  }
  bpts[base + (BPTS - 1) * 2] = x2; bpts[base + (BPTS - 1) * 2 + 1] = y2;
  bl[slot] = life; bm[slot] = life; bcol[slot] = color;
}

export function shake(w: World, amount: number): void {
  w.cam.shake = Math.min(30, Math.max(w.cam.shake, amount));
}
export function hitstop(w: World, seconds: number): void {
  w.hitstop = Math.max(w.hitstop, Math.min(seconds, 0.15));
}
export function flash(w: World, color: string, alpha: number): void {
  w.flashColor = color;
  w.flashA = Math.max(w.flashA, alpha);
}

/** Draw particles/rings/lines/numbers (world space; ctx already camera-transformed). */
export function renderFxWorld(ctx: CanvasRenderingContext2D, w: World): void {
  const hw = w.viewW * 0.5 + 40, hh = w.viewH * 0.5 + 40;
  const L = w.cam.x - hw, R = w.cam.x + hw, T = w.cam.y - hh, B = w.cam.y + hh;

  // particles, grouped by colour
  if (pCount > 0) {
    for (let c = 0; c < colorList.length; c++) {
      if (ccount[c] === 0) continue;
      ctx.fillStyle = colorList[c];
      for (let i = 0; i < PCAP; i++) {
        if (pl[i] <= 0 || pc[i] !== c) continue;
        const x = px[i], y = py[i];
        if (x < L || x > R || y < T || y > B) continue;
        const s = psz[i] * (pl[i] / pm[i]) + 0.4;
        ctx.fillRect(x - s * 0.5, y - s * 0.5, s, s);
      }
    }
  }

  // rings
  if (rCount > 0) {
    for (let i = 0; i < RCAP; i++) {
      const l = rl[i];
      if (l <= 0) continue;
      const t = 1 - l / rm[i];
      const e = 1 - (1 - t) * (1 - t) * (1 - t);
      const a = 1 - t;
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = rcol[i];
      ctx.lineWidth = rw[i] * a + 0.6;
      ctx.beginPath();
      ctx.arc(rx[i], ry[i], rr[i] * e + 0.5, 0, 6.2831853);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // lines
  ctx.lineCap = 'round';
  for (let i = 0; i < LCAP; i++) {
    const l = ll[i];
    if (l <= 0) continue;
    const f = l / lm[i];
    ctx.globalAlpha = Math.min(1, f * 1.5);
    ctx.strokeStyle = lcol[i];
    ctx.lineWidth = lw[i] * f + 0.5;
    ctx.beginPath();
    ctx.moveTo(lx1[i], ly1[i]);
    ctx.lineTo(lx2[i], ly2[i]);
    ctx.stroke();
  }

  // bolts
  ctx.lineJoin = 'round';
  for (let i = 0; i < BCAP; i++) {
    const l = bl[i];
    if (l <= 0) continue;
    const f = l / bm[i];
    const base = i * BPTS * 2;
    ctx.globalAlpha = Math.min(1, f * 2);
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass === 0 ? bcol[i] : '#ffffff';
      ctx.lineWidth = (pass === 0 ? 4.5 : 1.8) * (0.4 + 0.6 * f);
      ctx.beginPath();
      ctx.moveTo(bpts[base], bpts[base + 1]);
      for (let k = 1; k < BPTS; k++) ctx.lineTo(bpts[base + k * 2], bpts[base + k * 2 + 1]);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // numbers
  for (let i = 0; i < NCAP; i++) {
    const l = nl[i];
    if (l <= 0) continue;
    const spr = nspr[i];
    if (!spr) continue;
    const age = nm[i] - l;
    let s = 1;
    if (age < 0.14) { const t = age / 0.14; s = npop[i] + (1 - npop[i]) * (1 - (1 - t) * (1 - t)); }
    const f = l / nm[i];
    ctx.globalAlpha = f < 0.4 ? f / 0.4 : 1;
    const dw = spr.width * INV_SS * s, dh = spr.height * INV_SS * s;
    ctx.drawImage(spr, nx[i] - dw * 0.5, ny[i] - dh * 0.5, dw, dh);
  }
  ctx.globalAlpha = 1;
}

/** Draw splat decals (world space, under entities). */
export function renderDecals(ctx: CanvasRenderingContext2D, w: World): void {
  if (dN === 0) return;
  const hw = w.viewW * 0.5 + 60, hh = w.viewH * 0.5 + 60;
  const L = w.cam.x - hw, R = w.cam.x + hw, T = w.cam.y - hh, B = w.cam.y + hh;
  const full = dN >= DCAP;
  const start = full ? dHead : 0;
  ctx.globalAlpha = 0.55;
  for (let k = 0; k < dN; k++) {
    let i = start + k; if (i >= DCAP) i -= DCAP;
    if (full && k < 10) ctx.globalAlpha = 0.55 * (k + 1) / 11;
    else if (full && k === 10) ctx.globalAlpha = 0.55;
    const x = dx[i], y = dy[i], s = dsz[i], h = s * 0.5;
    if (x + h < L || x - h > R || y + h < T || y - h > B) continue;
    const spr = dspr[i];
    if (spr) ctx.drawImage(spr, x - h, y - h, s, s);
  }
  ctx.globalAlpha = 1;
}
