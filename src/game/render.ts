// OWNER: render agent. Canvas2D renderer: inked-notebook-paper look, all sprites procedural + cached.
// Hot path rules: drawImage of cached sprites only, no per-frame allocation, no shadowBlur, no save/restore per entity.
import type { World, Enemy, EnemyKind } from '../types';
import { PALETTE, VIEW_W } from '../types';
import { input, JOY_RADIUS } from '../core/input';
import { renderPlayer } from './player';
import { renderWeapons } from './weapons';
import { renderFxWorld, renderDecals } from './fx';

type G = CanvasRenderingContext2D;

const SS = 2;               // sprite supersampling (sprites rendered at 2x world size)
const INV_SS = 1 / SS;
const PAD = 4;
const TAU = Math.PI * 2;
const SERIF = 'Georgia, "Times New Roman", serif';

let canvas: HTMLCanvasElement | null = null;
let ctx: G;
let cssW = 420, cssH = 800, dpr = 1, scale = 1, K = 1;
let viewW = VIEW_W, viewH = 800;
let vignette: HTMLCanvasElement | null = null;

// ------------------------------------------------------------------ sprite helpers
function mkc(w: number, h: number): { c: HTMLCanvasElement; g: G } {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * SS));
  c.height = Math.max(1, Math.ceil(h * SS));
  const g = c.getContext('2d')!;
  g.scale(SS, SS);
  return { c, g };
}

const sprites = new Map<string, HTMLCanvasElement>();
/** Cached offscreen sprite helper usable by other modules. Drawn at 2x; use drawSprite / dw,dh in world units. */
export function getSprite(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  let c = sprites.get(key);
  if (!c) {
    const m = mkc(w, h);
    draw(m.g);
    c = m.c;
    sprites.set(key, c);
  }
  return c;
}
/** Draw a sprite made by getSprite at world position (top-left) with world size w,h. */
export function drawSprite(g: CanvasRenderingContext2D, spr: HTMLCanvasElement, x: number, y: number, w: number, h: number): void {
  g.drawImage(spr, x, y, w, h);
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

function tint(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

let scratch: G | null = null;
function measure(font: string, text: string): number {
  if (!scratch) scratch = document.createElement('canvas').getContext('2d')!;
  scratch.font = font;
  return scratch.measureText(text).width;
}

// ------------------------------------------------------------------ init / resize
export function initRender(cv: HTMLCanvasElement): void {
  canvas = cv;
  ctx = cv.getContext('2d', { alpha: false })!;
}

export function resizeRender(cw: number, ch: number, d: number): { viewW: number; viewH: number } {
  cssW = cw; cssH = ch; dpr = d;
  scale = cw / VIEW_W;
  viewW = VIEW_W;
  viewH = ch / scale;
  K = scale * d;
  if (canvas) {
    canvas.width = Math.max(1, Math.round(cw * d));
    canvas.height = Math.max(1, Math.round(ch * d));
  }
  buildVignette();
  return { viewW, viewH };
}

function buildVignette(): void {
  const vw = 96;
  const vh = Math.max(16, Math.round(vw * cssH / Math.max(1, cssW)));
  vignette = document.createElement('canvas');
  vignette.width = vw; vignette.height = vh;
  const g = vignette.getContext('2d')!;
  g.setTransform(1, 0, 0, vh / vw, 0, 0);
  const gr = g.createRadialGradient(vw / 2, vw / 2, vw * 0.28, vw / 2, vw / 2, vw * 0.78);
  gr.addColorStop(0, 'rgba(215,38,61,0)');
  gr.addColorStop(0.55, 'rgba(215,38,61,0.12)');
  gr.addColorStop(1, 'rgba(180,20,40,0.85)');
  g.fillStyle = gr;
  g.fillRect(0, 0, vw, vw);
}

// ------------------------------------------------------------------ paper
const TILE = 560; // 20 ruled lines
let paperPattern: CanvasPattern | null = null;
function getPaper(): CanvasPattern | null {
  if (paperPattern) return paperPattern;
  const { c, g } = mkc(TILE, TILE);
  g.fillStyle = PALETTE.paper;
  g.fillRect(0, 0, TILE, TILE);
  const r = mulberry(4242);
  // soft mottled patches
  for (let i = 0; i < 26; i++) {
    const x = r() * TILE, y = r() * TILE, rad = 30 + r() * 70;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(200,180,140,0.07)');
    gr.addColorStop(1, 'rgba(200,180,140,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // grain specks
  for (let i = 0; i < 1400; i++) {
    const x = r() * TILE, y = r() * TILE;
    g.fillStyle = r() < 0.5 ? 'rgba(120,95,60,0.10)' : 'rgba(255,255,255,0.35)';
    g.fillRect(x, y, 0.6 + r() * 0.9, 0.6 + r() * 0.9);
  }
  // fibres
  g.strokeStyle = 'rgba(120,95,60,0.07)';
  g.lineWidth = 0.5;
  for (let i = 0; i < 70; i++) {
    const x = r() * TILE, y = r() * TILE, a = r() * TAU, l = 4 + r() * 8;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // coffee ring stain
  {
    const cx = 150 + r() * 200, cy = 150 + r() * 200, rad = 34;
    g.strokeStyle = 'rgba(120,80,40,0.10)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx, cy, rad, 0.3, TAU - 0.4);
    g.stroke();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(120,80,40,0.08)';
    g.beginPath();
    g.arc(cx + 1, cy - 1, rad - 3, 1, TAU - 1.2);
    g.stroke();
    const gr = g.createRadialGradient(cx, cy, rad * 0.5, cx, cy, rad);
    gr.addColorStop(0, 'rgba(150,100,50,0)');
    gr.addColorStop(1, 'rgba(150,100,50,0.035)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx, cy, rad, 0, TAU); g.fill();
  }
  // ruled lines every 28u
  g.fillStyle = PALETTE.rule;
  for (let y = 0; y < TILE; y += 28) g.fillRect(0, y, TILE, 1.2);
  const cv = c;
  const p = ctx.createPattern(cv, 'repeat');
  if (p) {
    try { p.setTransform(new DOMMatrix().scale(INV_SS, INV_SS)); } catch { /* old browsers */ }
  }
  paperPattern = p;
  return p;
}

function drawPaper(g: G, L: number, T: number, R: number, B: number): void {
  const p = getPaper();
  g.fillStyle = p ?? PALETTE.paper;
  g.fillRect(L - 2, T - 2, R - L + 4, B - T + 4);
  // red double margin line every 840u
  g.fillStyle = PALETTE.margin;
  for (let mx = Math.floor(L / 840) * 840; mx < R; mx += 840) {
    g.fillRect(mx - 1, T - 2, 1.6, B - T + 4);
    g.fillRect(mx + 4, T - 2, 1.2, B - T + 4);
  }
}

// ------------------------------------------------------------------ enemy sprites
interface KindDef { idx: number; nom: number; keyed: boolean; clamp: boolean; walk: boolean; }
const KD: Record<EnemyKind, KindDef> = {
  typo: { idx: 0, nom: 10, keyed: true, clamp: true, walk: true },
  smudge: { idx: 1, nom: 16, keyed: false, clamp: false, walk: true },
  smudgelet: { idx: 2, nom: 9, keyed: false, clamp: false, walk: true },
  blot: { idx: 3, nom: 11, keyed: false, clamp: false, walk: false },
  dangler: { idx: 4, nom: 12, keyed: true, clamp: true, walk: false },
  widow: { idx: 5, nom: 13, keyed: false, clamp: false, walk: false },
  redaction: { idx: 6, nom: 20, keyed: false, clamp: false, walk: true },
  boss_runon: { idx: 7, nom: 30, keyed: false, clamp: false, walk: false },
  boss_runon_seg: { idx: 8, nom: 14, keyed: true, clamp: false, walk: false },
  boss_redactor: { idx: 9, nom: 40, keyed: false, clamp: false, walk: false },
  boss_purple: { idx: 10, nom: 36, keyed: false, clamp: false, walk: false },
};
const NK = 11;
const emaps: Map<string, HTMLCanvasElement>[] = [];
for (let i = 0; i < NK * 3; i++) emaps.push(new Map());

function squiggle(g: G, x0: number, x1: number, y: number, amp: number, period: number): void {
  g.beginPath();
  for (let x = x0; x <= x1; x += 1.5) {
    const yy = y + Math.sin(((x - x0) / period) * TAU) * amp;
    if (x === x0) g.moveTo(x, yy); else g.lineTo(x, yy);
  }
  g.stroke();
}

function blobPath(g: G, cx: number, cy: number, R: number, seed: number, n: number): void {
  const r = mulberry(seed);
  const bx: number[] = [], by: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rad = R * (0.82 + r() * 0.32);
    bx.push(cx + Math.cos(a) * rad); by.push(cy + Math.sin(a) * rad);
  }
  g.beginPath();
  g.moveTo((bx[n - 1] + bx[0]) / 2, (by[n - 1] + by[0]) / 2);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    g.quadraticCurveTo(bx[i], by[i], (bx[i] + bx[j]) / 2, (by[i] + by[j]) / 2);
  }
  g.closePath();
}

function eye(g: G, x: number, y: number, rad: number, iris: string): void {
  g.fillStyle = PALETTE.white;
  g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
  g.fillStyle = iris;
  g.beginPath(); g.arc(x + rad * 0.15, y + rad * 0.2, rad * 0.5, 0, TAU); g.fill();
}

function roundRect(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

function buildText(glyph: string, size: number, dangler: boolean): HTMLCanvasElement {
  const font = 'italic 700 ' + size + 'px ' + SERIF;
  const tw = Math.ceil(measure(font, glyph));
  const W = tw + PAD * 2 + 4, H = size + PAD * 2 + 9;
  const { c, g } = mkc(W, H);
  const base = PAD + size * 0.85;
  g.font = font; g.textBaseline = 'alphabetic';
  g.fillStyle = PALETTE.ink;
  g.fillText(glyph, PAD + 2, base);
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (!dangler) {
    g.strokeStyle = PALETTE.red; g.lineWidth = 1.8;
    squiggle(g, PAD + 1, W - PAD - 1, base + 4.5, 1.7, 5);
  } else {
    // dangling tail with a hook
    g.strokeStyle = PALETTE.ink; g.lineWidth = 2;
    const x = W - PAD - 6;
    g.beginPath();
    g.moveTo(x, base + 1);
    g.bezierCurveTo(x + 4, base + 4, x - 4, base + 6, x + 1, base + 9);
    g.stroke();
    g.strokeStyle = PALETTE.red; g.lineWidth = 1.6;
    squiggle(g, PAD + 1, x - 6, base + 4.5, 1.3, 5);
  }
  return c;
}

function buildBlob(R0: number, seed: number, eyeR: number, eyes: number): HTMLCanvasElement {
  const half = R0 * 1.3 + PAD;
  const { c, g } = mkc(half * 2, half * 2);
  const cx = half, cy = half;
  g.fillStyle = PALETTE.ink;
  blobPath(g, cx, cy, R0, seed, 11);
  g.fill();
  // little drips / satellites
  const r = mulberry(seed * 3 + 1);
  for (let i = 0; i < 4; i++) {
    const a = r() * TAU, d = R0 * (0.95 + r() * 0.2);
    g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, R0 * (0.06 + r() * 0.08), 0, TAU); g.fill();
  }
  // sheen
  g.fillStyle = PALETTE.inkSoft;
  g.beginPath(); g.ellipse(cx - R0 * 0.35, cy - R0 * 0.5, R0 * 0.3, R0 * 0.15, -0.5, 0, TAU); g.fill();
  if (eyes === 2) {
    eye(g, cx - R0 * 0.32, cy - R0 * 0.1, eyeR, PALETTE.ink);
    eye(g, cx + R0 * 0.32, cy - R0 * 0.1, eyeR, PALETTE.ink);
  }
  return c;
}

function buildBlot(): HTMLCanvasElement {
  const R0 = 11;
  const half = R0 * 1.7 + PAD;
  const { c, g } = mkc(half * 2, half * 2);
  const cx = half, cy = half + R0 * 0.35;
  g.fillStyle = PALETTE.ink;
  g.beginPath();
  g.moveTo(cx, cy - R0 * 1.7);
  g.bezierCurveTo(cx + R0 * 0.2, cy - R0 * 1.0, cx + R0 * 1.0, cy - R0 * 0.55, cx + R0, cy);
  g.arc(cx, cy, R0, 0, Math.PI, false);
  g.bezierCurveTo(cx - R0 * 1.0, cy - R0 * 0.55, cx - R0 * 0.2, cy - R0 * 1.0, cx, cy - R0 * 1.7);
  g.closePath();
  g.fill();
  g.fillStyle = PALETTE.inkSoft;
  g.beginPath(); g.ellipse(cx - R0 * 0.4, cy - R0 * 0.3, R0 * 0.18, R0 * 0.3, 0.4, 0, TAU); g.fill();
  eye(g, cx, cy + R0 * 0.1, R0 * 0.5, PALETTE.red);
  return c;
}

function buildWidow(): HTMLCanvasElement {
  const size = 34;
  const font = 'bold ' + size + 'px ' + SERIF;
  const tw = Math.ceil(measure(font, '¶'));
  const W = tw + PAD * 2 + 4, H = size + PAD * 2 + 4;
  const { c, g } = mkc(W, H);
  g.font = font; g.textBaseline = 'alphabetic';
  g.fillStyle = PALETTE.ink;
  g.fillText('¶', PAD + 2, PAD + size * 0.85);
  g.fillStyle = PALETTE.red;
  g.beginPath(); g.arc(W * 0.42, H * 0.38, 2.4, 0, TAU); g.fill();
  g.fillStyle = PALETTE.white;
  g.beginPath(); g.arc(W * 0.42 - 0.6, H * 0.38 - 0.6, 0.9, 0, TAU); g.fill();
  return c;
}

function buildRedaction(): HTMLCanvasElement {
  const R0 = 20;
  const bw = R0 * 3, bh = R0 * 1.2;
  const { c, g } = mkc(bw + PAD * 2, bh + PAD * 2);
  g.fillStyle = PALETTE.ink;
  roundRect(g, PAD, PAD, bw, bh, 5); g.fill();
  g.save();
  roundRect(g, PAD, PAD, bw, bh, 5); g.clip();
  g.fillStyle = PALETTE.inkSoft;
  for (let x = PAD + 4; x < PAD + bw; x += 7) g.fillRect(x, PAD, 2.5, bh);
  g.restore();
  // red stamp
  g.save();
  g.translate(PAD + bw / 2, PAD + bh / 2);
  g.rotate(-0.1);
  g.strokeStyle = PALETTE.red; g.lineWidth = 1.4;
  g.strokeRect(-bw * 0.38, -5.5, bw * 0.76, 11);
  g.fillStyle = PALETTE.red;
  g.font = 'bold 9px ' + SERIF; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('REDACTED', 0, 0.5);
  g.restore();
  return c;
}

function buildRunOn(): HTMLCanvasElement {
  const font = 'italic 900 46px ' + SERIF;
  const tw = Math.ceil(measure(font, 'AND'));
  const W = tw + 24 + PAD * 2, H = 74 + PAD * 2;
  const { c, g } = mkc(W, H);
  const cx = W / 2, base = PAD + 54;
  g.lineCap = 'round'; g.lineJoin = 'round';
  // scribbly aura
  g.strokeStyle = PALETTE.ink; g.lineWidth = 1.5;
  const r = mulberry(99);
  for (let i = 0; i < 14; i++) {
    const a = r() * TAU, d1 = 30 + r() * 8, d2 = d1 + 5 + r() * 8;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * d1 * 1.5, H / 2 + Math.sin(a) * d1 * 0.85);
    g.lineTo(cx + Math.cos(a + 0.1) * d2 * 1.5, H / 2 + Math.sin(a + 0.1) * d2 * 0.85);
    g.stroke();
  }
  g.font = font; g.textBaseline = 'alphabetic'; g.textAlign = 'center';
  g.fillStyle = PALETTE.ink;
  g.fillText('AND', cx, base);
  // red scribble underline
  g.strokeStyle = PALETTE.red; g.lineWidth = 2.2;
  squiggle(g, cx - tw / 2, cx + tw / 2, base + 7, 2.4, 7);
  // eyes + fangs
  eye(g, cx - tw * 0.3, base - 26, 5.5, PALETTE.red);
  eye(g, cx + tw * 0.02, base - 26, 5.5, PALETTE.red);
  g.fillStyle = PALETTE.white; g.strokeStyle = PALETTE.ink; g.lineWidth = 1.2;
  for (let i = -1; i <= 1; i += 2) {
    const fx = cx + i * tw * 0.2;
    g.beginPath();
    g.moveTo(fx - 4, base - 4); g.lineTo(fx + 4, base - 4); g.lineTo(fx, base + 6); g.closePath();
    g.fill(); g.stroke();
  }
  return c;
}

function buildRunOnSeg(glyph: string): HTMLCanvasElement {
  const R0 = 14;
  const half = R0 * 1.25 + PAD;
  const { c, g } = mkc(half * 2, half * 2);
  g.fillStyle = PALETTE.ink;
  blobPath(g, half, half, R0, 31, 9); g.fill();
  g.fillStyle = PALETTE.white;
  g.font = 'bold 19px ' + SERIF; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(glyph || 'a', half, half + 1);
  return c;
}

function buildRedactor(): HTMLCanvasElement {
  const bw = 100, bh = 76;
  const { c, g } = mkc(bw + PAD * 2 + 8, bh + PAD * 2 + 8);
  const ox = PAD + 4, oy = PAD + 4;
  g.fillStyle = PALETTE.ink;
  roundRect(g, ox, oy, bw, bh, 8); g.fill();
  g.save();
  roundRect(g, ox, oy, bw, bh, 8); g.clip();
  g.fillStyle = PALETTE.inkSoft;
  for (let y = oy + 5; y < oy + bh; y += 9) g.fillRect(ox, y, bw, 2.5);
  g.restore();
  // glaring eye
  g.fillStyle = PALETTE.white;
  g.beginPath(); g.ellipse(ox + bw / 2, oy + 24, 16, 11, 0, 0, TAU); g.fill();
  g.fillStyle = PALETTE.red;
  g.beginPath(); g.arc(ox + bw / 2, oy + 24, 7, 0, TAU); g.fill();
  g.fillStyle = PALETTE.ink;
  g.fillRect(ox + bw / 2 - 1.2, oy + 17, 2.4, 14);
  // stamp
  g.save();
  g.translate(ox + bw / 2, oy + bh - 18);
  g.rotate(-0.14);
  g.strokeStyle = PALETTE.white; g.lineWidth = 2;
  g.strokeRect(-38, -9, 76, 18);
  g.fillStyle = PALETTE.white;
  g.font = 'bold 13px ' + SERIF; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('CLASSIFIED', 0, 1);
  g.restore();
  return c;
}

function buildPurple(): HTMLCanvasElement {
  const R0 = 36;
  const half = R0 * 1.5 + PAD;
  const { c, g } = mkc(half * 2, half * 2);
  g.translate(half, half);
  g.lineCap = 'round';
  // ornate swirl ring
  g.strokeStyle = PALETTE.purple; g.lineWidth = 2.4;
  g.beginPath(); g.arc(0, 0, R0 * 1.2, 0, TAU); g.stroke();
  g.lineWidth = 1.4;
  g.beginPath(); g.arc(0, 0, R0 * 1.05, 0, TAU); g.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const x = Math.cos(a) * R0 * 1.3, y = Math.sin(a) * R0 * 1.3;
    g.beginPath(); g.arc(x, y, 5, a + 1.2, a + 1.2 + 4.4); g.stroke();
  }
  // petals
  for (let i = 0; i < 8; i++) {
    g.save();
    g.rotate((i / 8) * TAU);
    g.fillStyle = i % 2 ? PALETTE.purple : '#9a5fe0';
    g.strokeStyle = PALETTE.ink; g.lineWidth = 1.2;
    g.beginPath(); g.ellipse(R0 * 0.52, 0, R0 * 0.48, R0 * 0.22, 0, 0, TAU);
    g.fill(); g.stroke();
    g.restore();
  }
  g.fillStyle = PALETTE.highlight;
  g.strokeStyle = PALETTE.ink; g.lineWidth = 1.5;
  g.beginPath(); g.arc(0, 0, R0 * 0.28, 0, TAU); g.fill(); g.stroke();
  eye(g, 0, 0, R0 * 0.16, PALETTE.purple);
  return c;
}

function buildBase(kind: EnemyKind, glyph: string): HTMLCanvasElement {
  switch (kind) {
    case 'typo': return buildText(glyph || 'teh', 15, false);
    case 'dangler': return buildText(glyph || '—ing', 17, true);
    case 'smudge': return buildBlob(16, 7, 3.8, 2);
    case 'smudgelet': return buildBlob(9, 19, 2.4, 2);
    case 'blot': return buildBlot();
    case 'widow': return buildWidow();
    case 'redaction': return buildRedaction();
    case 'boss_runon': return buildRunOn();
    case 'boss_runon_seg': return buildRunOnSeg(glyph);
    case 'boss_redactor': return buildRedactor();
    default: return buildPurple();
  }
}

const OFF8X = [1, 0.7071, 0, -0.7071, -1, -0.7071, 0, 0.7071];
const OFF8Y = [0, 0.7071, 1, 0.7071, 0, -0.7071, -1, -0.7071];

function makeVariant(base: HTMLCanvasElement, v: number): HTMLCanvasElement {
  const W = base.width * INV_SS, H = base.height * INV_SS;
  const { c, g } = mkc(W, H);
  if (v === 1) {
    const dark = tint(base, PALETTE.ink);
    for (let i = 0; i < 8; i++) g.drawImage(dark, OFF8X[i] * 1.2, OFF8Y[i] * 1.2, W, H);
    g.drawImage(tint(base, '#ffffff'), 0, 0, W, H);
  } else {
    const red = tint(base, PALETTE.red);
    for (let i = 0; i < 8; i++) g.drawImage(red, OFF8X[i] * 1.8, OFF8Y[i] * 1.8, W, H);
    g.drawImage(base, 0, 0, W, H);
  }
  return c;
}

function enemySprite(e: Enemy, kd: KindDef, v: number): HTMLCanvasElement {
  const key = kd.keyed ? e.glyph : '';
  const m = emaps[v * NK + kd.idx];
  let s = m.get(key);
  if (s === undefined) {
    const bm = emaps[kd.idx];
    let b = bm.get(key);
    if (b === undefined) { b = buildBase(e.kind, e.glyph); bm.set(key, b); }
    s = v === 0 ? b : makeVariant(b, v);
    if (v !== 0) m.set(key, s);
  }
  return s;
}

function drawEnemies(c: G, w: World, L: number, T: number, R: number, B: number): void {
  const items = w.enemies.items;
  const n = items.length;
  for (let i = 0; i < n; i++) {
    const e = items[i];
    if (!e.active) continue;
    const m = e.boss ? 220 : 60;
    const x = e.x, y = e.y;
    if (x < L - m || x > R + m || y < T - m || y > B + m) continue;
    const kd = KD[e.kind];
    if (kd === undefined) continue;
    const v = e.flash > 0 ? 1 : (e.elite ? 2 : 0);
    const spr = enemySprite(e, kd, v);
    let f = e.r / kd.nom;
    if (kd.clamp) f = f < 0.9 ? 0.9 : f > 1.6 ? 1.6 : f;
    else f = f < 0.4 ? 0.4 : f > 4 ? 4 : f;
    const dw0 = spr.width * INV_SS * f, dh0 = spr.height * INV_SS * f;
    let sx = 1, sy = 1;
    if (kd.walk) {
      sy = 1 + 0.08 * Math.sin(e.t * 10 + e.id * 1.7);
      sx = 2 - sy;
    } else if (e.kind === 'widow') {
      sx = sy = 1 + 0.1 * Math.sin(e.t * 6 + e.id);
    } else if (e.kind === 'blot') {
      sx = sy = e.state > 0 ? 1.12 + 0.1 * Math.sin(e.t * 28) : 1 + 0.03 * Math.sin(e.t * 3 + e.id);
    }
    const dw = dw0 * sx, dh = dh0 * sy;
    if (e.boss && (e.kind === 'boss_purple' || e.kind === 'boss_runon')) {
      const a = e.kind === 'boss_purple' ? e.t * 0.8 : Math.sin(e.t * 3) * 0.07;
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.drawImage(spr, -dw * 0.5, -dh * 0.5, dw, dh);
      c.restore();
    } else {
      if (e.kind === 'dangler' && e.vx * e.vx + e.vy * e.vy > 32400) {
        // dash afterimages
        const k1 = 0.022, k2 = 0.045;
        c.globalAlpha = 0.18;
        c.drawImage(spr, x - e.vx * k2 - dw * 0.5, y - e.vy * k2 - dh * 0.5, dw, dh);
        c.globalAlpha = 0.34;
        c.drawImage(spr, x - e.vx * k1 - dw * 0.5, y - e.vy * k1 - dh * 0.5, dw, dh);
        c.globalAlpha = 1;
      }
      c.drawImage(spr, x - dw * 0.5, y - dh * 0.5, dw, dh);
    }
    if (e.elite && !e.boss && e.hp < e.maxHp) {
      const bw = 26, by = y - dh * 0.5 - 3;
      c.fillStyle = PALETTE.ink;
      c.fillRect(x - bw * 0.5 - 1, by - 1, bw + 2, 5);
      c.fillStyle = PALETTE.paperDark;
      c.fillRect(x - bw * 0.5, by, bw, 3);
      c.fillStyle = PALETTE.red;
      c.fillRect(x - bw * 0.5, by, bw * Math.max(0, e.hp / e.maxHp), 3);
    }
  }
}

// ------------------------------------------------------------------ enemy bullets
const BDIR = 8;
const BS = 24;
const bulletSprites: HTMLCanvasElement[][] = [[], [], [], []]; // drop, petal, block, shard
const BNOM = 5;

function buildBullet(kind: number, dir: number): HTMLCanvasElement {
  const { c, g } = mkc(BS, BS);
  g.translate(BS / 2, BS / 2);
  g.rotate((dir / BDIR) * TAU);
  g.lineJoin = 'round';
  g.strokeStyle = PALETTE.white;
  g.lineWidth = 3.4;
  if (kind === 0) {
    // ink drop: round head toward travel (+x), tail behind
    const hx = 1.5, r = 4.8, d = 9.5;
    const ang = Math.acos(r / d);
    g.beginPath();
    g.moveTo(hx - d, 0);
    g.lineTo(hx + Math.cos(Math.PI - ang) * r, Math.sin(Math.PI - ang) * r);
    g.arc(hx, 0, r, Math.PI - ang, Math.PI + ang, true);
    g.closePath();
    g.stroke();
    g.fillStyle = PALETTE.ink; g.fill();
    g.fillStyle = PALETTE.red;
    g.beginPath(); g.arc(hx, 0, 2, 0, TAU); g.fill();
  } else if (kind === 1) {
    g.beginPath();
    g.moveTo(-7, 0);
    g.quadraticCurveTo(-1, -6.5, 8, 0);
    g.quadraticCurveTo(-1, 6.5, -7, 0);
    g.closePath();
    g.stroke();
    g.fillStyle = PALETTE.purple; g.fill();
    g.strokeStyle = '#c79cf5'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-4, 0); g.lineTo(5, 0); g.stroke();
  } else if (kind === 2) {
    g.rotate(0.3);
    g.beginPath(); g.rect(-4.5, -4.5, 9, 9);
    g.stroke();
    g.fillStyle = PALETTE.ink; g.fill();
  } else {
    g.beginPath();
    g.moveTo(8.5, 0); g.lineTo(0, -4); g.lineTo(-8.5, 0); g.lineTo(0, 4);
    g.closePath();
    g.stroke();
    g.fillStyle = PALETTE.ink; g.fill();
  }
  return c;
}

function bulletSprite(kind: number, dir: number): HTMLCanvasElement {
  const arr = bulletSprites[kind];
  const d = kind === 2 ? 0 : dir;
  let s = arr[d];
  if (!s) { s = buildBullet(kind, d); arr[d] = s; }
  return s;
}

function drawEBullets(c: G, w: World, L: number, T: number, R: number, B: number): void {
  const items = w.ebullets.items;
  const n = items.length;
  for (let i = 0; i < n; i++) {
    const b = items[i];
    if (!b.active) continue;
    const x = b.x, y = b.y;
    if (x < L - 20 || x > R + 20 || y < T - 20 || y > B + 20) continue;
    const k = b.kind === 'drop' ? 0 : b.kind === 'petal' ? 1 : b.kind === 'block' ? 2 : 3;
    const dir = (((Math.atan2(b.vy, b.vx) / TAU) * BDIR + BDIR + 0.5) | 0) % BDIR;
    const spr = bulletSprite(k, dir);
    let f = b.r / BNOM;
    f = f < 0.7 ? 0.7 : f > 2.5 ? 2.5 : f;
    const s = BS * f;
    c.drawImage(spr, x - s * 0.5, y - s * 0.5, s, s);
  }
}

// ------------------------------------------------------------------ pickups
const xpSprites = new Map<string, HTMLCanvasElement>();
let healSpr: HTMLCanvasElement | null = null, magnetSpr: HTMLCanvasElement | null = null;
let chestSpr: HTMLCanvasElement | null = null, glowSpr: HTMLCanvasElement | null = null, inkSpr: HTMLCanvasElement | null = null;

function heart(g: G, cx: number, cy: number, s: number): void {
  g.beginPath();
  g.moveTo(cx, cy + s * 0.9);
  g.bezierCurveTo(cx - s * 1.5, cy - s * 0.1, cx - s * 0.8, cy - s * 1.2, cx, cy - s * 0.4);
  g.bezierCurveTo(cx + s * 0.8, cy - s * 1.2, cx + s * 1.5, cy - s * 0.1, cx, cy + s * 0.9);
  g.closePath();
}

function buildXp(glyph: string): HTMLCanvasElement {
  const { c, g } = mkc(20, 20);
  g.save();
  g.translate(10, 10); g.rotate(-0.08);
  g.fillStyle = 'rgba(160,120,0,0.3)';
  roundRect(g, -7, -6.2, 14, 14, 3.5); g.fill();
  g.fillStyle = PALETTE.highlight;
  roundRect(g, -7, -7.5, 14, 14, 3.5); g.fill();
  g.strokeStyle = 'rgba(200,150,0,0.55)'; g.lineWidth = 0.8; g.stroke();
  g.restore();
  g.fillStyle = PALETTE.ink;
  g.font = 'bold 11px ' + SERIF; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(glyph, 10, 10.5);
  return c;
}

function pickupSprite(kind: string, glyph: string): HTMLCanvasElement {
  switch (kind) {
    case 'xp': {
      let s = xpSprites.get(glyph);
      if (!s) { s = buildXp(glyph || 'a'); xpSprites.set(glyph, s); }
      return s;
    }
    case 'heal':
      return healSpr ?? (healSpr = getSprite('pk:heal', 24, 24, (g) => {
        g.save(); g.translate(12, 12); g.rotate(0.08);
        g.fillStyle = PALETTE.white; g.strokeStyle = PALETTE.ink; g.lineWidth = 1.2;
        roundRect(g, -9, -9, 18, 18, 3); g.fill(); g.stroke();
        g.restore();
        g.fillStyle = PALETTE.green; g.strokeStyle = PALETTE.ink; g.lineWidth = 1;
        heart(g, 12, 12.5, 6); g.fill(); g.stroke();
      }));
    case 'magnet':
      return magnetSpr ?? (magnetSpr = getSprite('pk:magnet', 26, 26, (g) => {
        g.lineCap = 'butt';
        g.strokeStyle = PALETTE.ink; g.lineWidth = 8.5;
        g.beginPath(); g.moveTo(6.5, 5); g.lineTo(6.5, 13); g.arc(13, 13, 6.5, Math.PI, 0, true); g.lineTo(19.5, 5); g.stroke();
        g.strokeStyle = PALETTE.red; g.lineWidth = 6;
        g.beginPath(); g.moveTo(6.5, 5); g.lineTo(6.5, 13); g.arc(13, 13, 6.5, Math.PI, 0, true); g.lineTo(19.5, 5); g.stroke();
        g.fillStyle = PALETTE.white;
        g.fillRect(3.5, 3.5, 6, 4); g.fillRect(16.5, 3.5, 6, 4);
      }));
    case 'chest':
      return chestSpr ?? (chestSpr = getSprite('pk:chest', 32, 28, (g) => {
        g.translate(16, 14);
        g.fillStyle = PALETTE.ink; roundRect(g, -13, -10, 26, 21, 3); g.fill();
        g.fillStyle = '#8a5a2b'; roundRect(g, -12, -9, 24, 19, 2.5); g.fill();
        g.fillStyle = PALETTE.paper; g.fillRect(9, -7, 2.5, 15);
        g.fillStyle = PALETTE.gold; g.fillRect(-12, -9, 24, 3.5); g.fillRect(-12, 6.5, 24, 3.5);
        g.fillRect(-2.5, -9, 5, 19);
        g.fillStyle = PALETTE.ink; g.beginPath(); g.arc(0, 1, 1.8, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(-11, -5, 7, 1.5);
      }));
    default:
      return inkSpr ?? (inkSpr = getSprite('pk:ink', 20, 20, (g) => {
        g.fillStyle = PALETTE.ink;
        g.beginPath(); g.moveTo(10, 2); g.bezierCurveTo(11, 6, 16, 9, 16, 12.5); g.arc(10, 12.5, 6, 0, Math.PI, false);
        g.bezierCurveTo(4, 9, 9, 6, 10, 2); g.closePath(); g.fill();
        g.fillStyle = PALETTE.white; g.beginPath(); g.ellipse(7.8, 11.5, 1.2, 2.4, 0.4, 0, TAU); g.fill();
      }));
  }
}

function getGlow(): HTMLCanvasElement {
  return glowSpr ?? (glowSpr = getSprite('pk:glow', 64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 6, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,214,70,0.65)');
    gr.addColorStop(0.7, 'rgba(232,169,28,0.25)');
    gr.addColorStop(1, 'rgba(232,169,28,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(232,169,28,0.9)'; g.lineWidth = 2;
    g.beginPath(); g.arc(32, 32, 24, 0, TAU); g.stroke();
  }));
}

function drawPickups(c: G, w: World, L: number, T: number, R: number, B: number): void {
  const items = w.pickups.items;
  const n = items.length;
  for (let i = 0; i < n; i++) {
    const p = items[i];
    if (!p.active) continue;
    const x = p.x, y0 = p.y;
    if (x < L - 40 || x > R + 40 || y0 < T - 40 || y0 > B + 40) continue;
    const y = p.magnet ? y0 : y0 + Math.sin(p.t * 4 + x * 0.07) * 1.6;
    const kind = p.kind;
    const spr = pickupSprite(kind, p.glyph);
    let dw = spr.width * INV_SS, dh = spr.height * INV_SS;
    if (kind === 'xp') {
      const f = 1 + (p.value > 20 ? 20 : p.value) * 0.02;
      dw *= f; dh *= f;
    } else if (kind === 'chest') {
      const gl = getGlow();
      const pu = 1 + 0.15 * Math.sin(p.t * 5);
      const gs = 64 * pu;
      c.globalAlpha = 0.6 + 0.3 * Math.sin(p.t * 5);
      c.drawImage(gl, x - gs * 0.5, y - gs * 0.5, gs, gs);
      c.globalAlpha = 1;
    }
    c.drawImage(spr, x - dw * 0.5, y - dh * 0.5, dw, dh);
  }
}

// ------------------------------------------------------------------ main render
export function render(w: World, realDt: number): void {
  void realDt;
  if (!canvas) return;
  const c = ctx;
  const shk = w.meta.settings.shake !== false;
  const ox = shk ? w.cam.ox : 0, oy = shk ? w.cam.oy : 0;
  const camX = w.cam.x + ox, camY = w.cam.y + oy;
  const tx = Math.round((viewW / 2 - camX) * K), ty = Math.round((viewH / 2 - camY) * K);
  c.setTransform(K, 0, 0, K, tx, ty);
  const L = camX - viewW / 2, T = camY - viewH / 2, R = camX + viewW / 2, B = camY + viewH / 2;

  drawPaper(c, L, T, R, B);
  renderDecals(c, w);
  drawPickups(c, w, L, T, R, B);
  drawEnemies(c, w, L, T, R, B);
  renderWeapons(c, w);
  renderPlayer(c, w);
  drawEBullets(c, w, L, T, R, B);
  renderFxWorld(c, w);

  // ---- screen space (CSS px)
  c.setTransform(dpr, 0, 0, dpr, 0, 0);

  // low-HP vignette
  const p = w.player;
  const hpf = p.maxHp > 0 ? p.hp / p.maxHp : 1;
  if (hpf < 0.35 && p.alive && vignette) {
    const sev = (0.35 - hpf) / 0.35;
    const a = Math.min(1, 0.3 + sev * 0.5 + 0.2 * Math.sin(w.time * (5 + sev * 5)));
    c.globalAlpha = a < 0 ? 0 : a;
    c.drawImage(vignette, 0, 0, cssW, cssH);
    c.globalAlpha = 1;
  }

  // off-screen boss arrow
  const boss = w.boss;
  if (boss && boss.active) {
    const hx = cssW * 0.5, hy = cssH * 0.5;
    const ddx = (boss.x - camX) * scale, ddy = (boss.y - camY) * scale;
    const lx = hx - 26, ly = ddy < 0 ? hy - 70 : hy - 28;
    const ax = ddx < 0 ? -ddx : ddx, ay = ddy < 0 ? -ddy : ddy;
    if (ax > lx + 30 || ay > ly + 30) {
      const t = Math.min(ax > 0 ? lx / ax : 1e9, ay > 0 ? ly / ay : 1e9);
      const bx = hx + ddx * t, by = hy + ddy * t;
      const ang = Math.atan2(ddy, ddx);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const sz = 13 + 2 * Math.sin(w.time * 8);
      c.beginPath();
      c.moveTo(bx + ca * sz, by + sa * sz);
      c.lineTo(bx - ca * sz * 0.6 - sa * sz * 0.7, by - sa * sz * 0.6 + ca * sz * 0.7);
      c.lineTo(bx - ca * sz * 0.6 + sa * sz * 0.7, by - sa * sz * 0.6 - ca * sz * 0.7);
      c.closePath();
      c.lineJoin = 'round';
      c.lineWidth = 3; c.strokeStyle = PALETTE.white; c.stroke();
      c.fillStyle = PALETTE.red; c.fill();
      c.lineWidth = 1.2; c.strokeStyle = PALETTE.ink; c.stroke();
    }
  }

  // full-screen flash
  if (w.flashA > 0.004) {
    c.globalAlpha = w.flashA > 1 ? 1 : w.flashA;
    c.fillStyle = w.flashColor;
    c.fillRect(0, 0, cssW, cssH);
    c.globalAlpha = 1;
  }

  // joystick
  const inp = w.input;
  if (inp.active && !inp.usingKeys) {
    c.fillStyle = PALETTE.ink;
    c.globalAlpha = 0.07;
    c.beginPath(); c.arc(inp.joyX, inp.joyY, JOY_RADIUS, 0, TAU); c.fill();
    c.globalAlpha = 0.3;
    c.strokeStyle = PALETTE.ink; c.lineWidth = 2;
    c.beginPath(); c.arc(inp.joyX, inp.joyY, JOY_RADIUS, 0, TAU); c.stroke();
    c.globalAlpha = 0.38;
    c.beginPath(); c.arc(inp.knobX, inp.knobY, 22, 0, TAU); c.fill();
    c.globalAlpha = 0.6;
    c.strokeStyle = PALETTE.red; c.lineWidth = 1.5;
    c.beginPath(); c.arc(inp.knobX, inp.knobY, 22, 0, TAU); c.stroke();
    c.globalAlpha = 1;
  }
  void input;
}

// ------------------------------------------------------------------ idle (title) backdrop
const IDLE_WORDS = ['teh', 'recieve', 'seperate', 'definately', 'occured', 'wich', 'alot', 'untill', 'accomodate', 'thier', 'becuase', 'goverment'];
interface IdleWord { x: number; y0: number; sp: number; ph: number; spr: HTMLCanvasElement | null; word: string; rot: number; }
let idleWords: IdleWord[] | null = null;

function idleSprite(word: string): HTMLCanvasElement {
  const font = 'italic 700 34px ' + SERIF;
  const tw = Math.ceil(measure(font, word));
  return getSprite('idle:' + word, tw + 8, 52, (g) => {
    g.font = font; g.textBaseline = 'alphabetic';
    g.fillStyle = PALETTE.ink;
    g.fillText(word, 4, 34);
    g.strokeStyle = PALETTE.red; g.lineWidth = 2.2; g.lineCap = 'round';
    squiggle(g, 4, tw + 4, 44, 2.4, 8);
  });
}

export function renderIdle(t: number): void {
  if (!canvas) return;
  const c = ctx;
  if (!idleWords) {
    const r = mulberry(777);
    idleWords = [];
    for (let i = 0; i < IDLE_WORDS.length; i++) {
      idleWords.push({ x: 10 + r() * (VIEW_W - 150), y0: r() * 1000, sp: 12 + r() * 20, ph: r() * 3, spr: null, word: IDLE_WORDS[i], rot: 0 });
    }
  }
  const camY = t * 22;
  c.setTransform(K, 0, 0, K, 0, Math.round(-camY * K));
  drawPaper(c, 0, camY, viewW, camY + viewH);
  c.setTransform(K, 0, 0, K, 0, 0);
  const loop = viewH + 160;
  for (let i = 0; i < idleWords.length; i++) {
    const iw = idleWords[i];
    if (!iw.spr) iw.spr = idleSprite(iw.word);
    let y = (iw.y0 - t * iw.sp) % loop;
    if (y < 0) y += loop;
    y -= 80;
    const dw = iw.spr.width * INV_SS, dh = iw.spr.height * INV_SS;
    c.globalAlpha = 0.17;
    c.drawImage(iw.spr, iw.x, y, dw, dh);
    // animated red strikethrough
    let q = (t * 0.4 + iw.ph) % 2.6;
    if (q < 0) q += 2.6;
    if (q < 1.9) {
      const len = (q < 1 ? q : 1) * (dw - 4);
      c.globalAlpha = 0.5;
      c.fillStyle = PALETTE.red;
      c.fillRect(iw.x, y + dh * 0.45, len + 4, 2.6);
    }
  }
  c.globalAlpha = 1;
}
