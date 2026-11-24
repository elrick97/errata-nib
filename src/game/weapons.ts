// OWNER: combat agent. Contract — keep signatures.
// All weapons live here. No per-frame allocation: scratch arrays + fixed-size typed arrays only.
import type { World, Enemy, Bullet, BulletKind, WeaponInst } from '../types';
import { PALETTE } from '../types';
import { damageEnemy, clearEnemyBulletsInRadius } from './enemies';
import * as fx from './fx';
import { getSprite } from './render';
import { healPlayer } from './player';
// per-enemy paren hit cooldown (enemy scratch fields belong to enemies.ts)
const parenHitId = new Int32Array(4096);
const parenHitT = new Float32Array(4096);

/** Per-level tables (index = level-1). Shared with upgrades.ts for card text. */
export const WT = {
  dart: { cd: [0.55, 0.5, 0.45, 0.4, 0.35], dmg: [10, 12, 15, 18, 22], n: [1, 1, 2, 2, 3], pierce: [0, 0, 1, 1, 2] },
  comma: { cd: [1.4, 1.3, 1.2, 1.1, 1.0], dmg: [14, 18, 22, 26, 30], n: [1, 1, 2, 2, 3], range: 220 },
  paren: { n: [2, 2, 3, 3, 4], r: [70, 75, 80, 85, 90], dmg: [8, 10, 13, 15, 18] },
  asterisk: { cd: [1.2, 1.1, 1.0, 0.9, 0.8], n: [1, 1, 2, 2, 3], r: [60, 68, 77, 86, 95], dmg: [25, 32, 40, 47, 55] },
  strike: { cd: [2.2, 2.0, 1.8, 1.6, 1.4], n: [1, 1, 2, 2, 3], dmg: [20, 26, 32, 38, 45] },
  bang: { cd: [1.6, 1.55, 1.5, 1.4, 1.3], n: [1, 2, 2, 3, 4], dmg: [30, 37, 45, 52, 60], chain: [1, 1, 2, 2, 3] },
  highlighter: { r: [55, 65, 75, 85, 95], dmg: [6, 8, 10, 12, 14], tick: [0.28, 0.25, 0.22, 0.19, 0.16] },
  eraser: { cd: [3, 2.75, 2.5, 2.25, 2], r: [90, 105, 120, 135, 150], dmg: [12, 16, 20, 24, 28] },
};

const RED = PALETTE.red;
const PINK = PALETTE.highlightPink;
const YEL = PALETTE.highlight;

// ----------------------------------------------------------------- scratch
const qE: Enemy[] = [];   // explosions / strikes / eraser
const qM: Enemy[] = [];   // mine triggers
const qB: Enemy[] = [];   // bullets
const qP: Enemy[] = [];   // paren / aura
const usedIds = new Int32Array(16);

let curWorld: World | null = null;
let aS = 1;               // area * size this frame
let cdMul = 1;            // cooldown multiplier this frame
let nearE: Enemy | null = null;

// mines
const MAX_MINES = 40;
const mOn = new Uint8Array(MAX_MINES);
const mX = new Float32Array(MAX_MINES);
const mY = new Float32Array(MAX_MINES);
const mT = new Float32Array(MAX_MINES);
// queued mini explosions (Footnote Barrage)
const MAX_MINI = 64;
const qOn = new Uint8Array(MAX_MINI);
const qLead = new Uint8Array(MAX_MINI);
const qX = new Float32Array(MAX_MINI);
const qY = new Float32Array(MAX_MINI);
const qD = new Float32Array(MAX_MINI);
let miniHead = 0;
// semicolon ink trail zones
const MAX_ZONE = 96;
const zOn = new Uint8Array(MAX_ZONE);
const zX = new Float32Array(MAX_ZONE);
const zY = new Float32Array(MAX_ZONE);
const zLife = new Float32Array(MAX_ZONE);
const zTick = new Float32Array(MAX_ZONE);
const zDmg = new Float32Array(MAX_ZONE);
const zR = new Float32Array(MAX_ZONE);
let zoneHead = 0;
// orbit blades
const MAX_BLADES = 16;
const bX = new Float32Array(MAX_BLADES);
const bY = new Float32Array(MAX_BLADES);
const bA = new Float32Array(MAX_BLADES);
let bladeN = 0;
// aura
let auraOn = false, auraEvo = false, auraR = 0, auraFlash = 0;

function syncWorld(w: World): void {
  if (curWorld === w) return;
  curWorld = w;
  mOn.fill(0); qOn.fill(0); zOn.fill(0);
  bladeN = 0; auraOn = false; auraFlash = 0; nearE = null;
}

// ----------------------------------------------------------------- helpers
function rollCrit(w: World): boolean { return w.rng.next() < w.stats.crit; }

function hit(w: World, e: Enemy, base: number, kx: number, ky: number, forceCrit: boolean): boolean {
  const crit = forceCrit || w.rng.next() < w.stats.crit;
  return damageEnemy(w, e, crit ? base * w.stats.critMult : base, crit, kx, ky);
}

function hasHit(b: Bullet, id: number): boolean {
  const n = b.nHits < 8 ? b.nHits : 8;
  for (let i = 0; i < n; i++) if (b.hits[i] === id) return true;
  return false;
}
function addHit(b: Bullet, id: number): void { b.hits[b.nHits & 7] = id; b.nHits++; }

function spawnBullet(w: World, kind: BulletKind, x: number, y: number, vx: number, vy: number,
  r: number, dmg: number, pierce: number, life: number, knock: number, split: number): Bullet | null {
  const b = w.bullets.spawn();
  if (!b) return null;
  b.kind = kind; b.x = x; b.y = y; b.vx = vx; b.vy = vy;
  b.r = r; b.dmg = dmg; b.pierce = pierce; b.life = life;
  b.nHits = 0; b.knock = knock; b.crit = w.stats.crit;
  b.t = 0; b.a = 0; b.b = 0; b.split = split;
  return b;
}

function findNearest(w: World): void {
  const p = w.player;
  const items = w.enemies.items;
  const lim = w.viewH * 0.6;
  let best = lim * lim;
  nearE = null;
  for (let i = 0; i < items.length; i++) {
    const e = items[i];
    if (!e.active) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) { best = d2; nearE = e; }
  }
}

function randomOnScreen(w: World, nUsed: number): Enemy | null {
  const p = w.player;
  const items = w.enemies.items;
  const N = items.length;
  const s = (w.rng.next() * N) | 0;
  const hx = w.viewW * 0.5 + 10, hy = w.viewH * 0.5 + 10;
  for (let k = 0; k < N; k++) {
    let idx = s + k; if (idx >= N) idx -= N;
    const e = items[idx];
    if (!e.active) continue;
    if (Math.abs(e.x - p.x) > hx || Math.abs(e.y - p.y) > hy) continue;
    let dup = false;
    for (let u = 0; u < nUsed; u++) if (usedIds[u] === e.id) { dup = true; break; }
    if (dup) continue;
    return e;
  }
  return null;
}

function nearestOther(w: World, x: number, y: number, maxD: number, nUsed: number): Enemy | null {
  const items = w.enemies.items;
  let best = maxD * maxD;
  let res: Enemy | null = null;
  for (let i = 0; i < items.length; i++) {
    const e = items[i];
    if (!e.active) continue;
    let dup = false;
    for (let u = 0; u < nUsed; u++) if (usedIds[u] === e.id) { dup = true; break; }
    if (dup) continue;
    const dx = e.x - x, dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) { best = d2; res = e; }
  }
  return res;
}

// ----------------------------------------------------------------- update
export function updateWeapons(w: World, dt: number): void {
  syncWorld(w);
  const p = w.player;
  const st = w.stats;
  auraOn = false; bladeN = 0;
  if (auraFlash > 0) auraFlash -= dt;
  updateMiniQueue(w, dt);
  if (!p.alive) return;
  aS = st.area * st.size;
  cdMul = st.cooldown / Math.max(0.1, st.fireRate);
  findNearest(w);

  const ws = w.weapons;
  for (let i = 0; i < ws.length; i++) {
    const wp = ws[i];
    wp.timer -= dt;
    switch (wp.id) {
      case 'dart': updDart(w, wp); break;
      case 'comma': updComma(w, wp); break;
      case 'paren': updParen(w, wp, dt); break;
      case 'asterisk': updAsterisk(w, wp); break;
      case 'strike': updStrike(w, wp); break;
      case 'bang': updBang(w, wp); break;
      case 'highlighter': updHighlighter(w, wp, dt); break;
      case 'eraser': updEraser(w, wp); break;
    }
  }
  updateMines(w, dt);
}

function rearm(wp: WeaponInst, cd: number): void {
  wp.timer += cd;
  if (wp.timer < 0) wp.timer = 0;
}

// ---- dart
function updDart(w: World, wp: WeaponInst): void {
  if (wp.timer > 0) return;
  const t = nearE;
  if (!t) { wp.timer = 0; return; }
  const p = w.player, st = w.stats, l = wp.level - 1, evo = wp.evolved;
  const n = WT.dart.n[l] + st.amount;
  const base = Math.atan2(t.y - p.y, t.x - p.x);
  const spd = 520 * st.projSpeed;
  const dmg = WT.dart.dmg[l] * st.damage * (evo ? 1.2 : 1);
  const pierce = WT.dart.pierce[l] + (evo ? 1 : 0);
  const r = 4.5 * aS * (evo ? 1.2 : 1);
  const life = 1.25 * st.duration;
  for (let i = 0; i < n; i++) {
    const a = base + (i - (n - 1) * 0.5) * 0.1745;
    const c = Math.cos(a), s = Math.sin(a);
    spawnBullet(w, 'dart', p.x + c * 12, p.y + s * 12, c * spd, s * spd, r, dmg, pierce, life, 110 * st.knock, evo ? 6 : 0);
  }
  const bc = Math.cos(base), bs = Math.sin(base);
  fx.burst(w, p.x + bc * 18, p.y + bs * 18, RED, evo ? 5 : 3, 150, 2);
  w.events.sfx('shoot');
  rearm(wp, Math.max(0.08, WT.dart.cd[l] * cdMul));
}

// ---- comma / semicolon
function updComma(w: World, wp: WeaponInst): void {
  if (wp.timer > 0) return;
  const t = nearE;
  if (!t) { wp.timer = 0; return; }
  const p = w.player, st = w.stats, l = wp.level - 1, evo = wp.evolved;
  const n = WT.comma.n[l] + st.amount + (evo ? 2 : 0);
  const base = Math.atan2(t.y - p.y, t.x - p.x);
  const spd = 330 * st.projSpeed * (evo ? 1.3 : 1);
  const dmg = WT.comma.dmg[l] * st.damage * (evo ? 1.25 : 1);
  const range = WT.comma.range * st.duration * (0.85 + 0.15 * aS);
  const r = 9 * aS;
  for (let i = 0; i < n; i++) {
    const a = base + (i - (n - 1) * 0.5) * (evo ? 0.7 : 0.5);
    const c = Math.cos(a), s = Math.sin(a);
    const b = spawnBullet(w, evo ? 'semicolon' : 'comma', p.x, p.y, c * spd, s * spd, r, dmg, 999, 14, 90 * st.knock, 0);
    if (b) b.b = range;
  }
  fx.burst(w, p.x + Math.cos(base) * 14, p.y + Math.sin(base) * 14, RED, 3, 120, 2);
  w.events.sfx('swoosh');
  rearm(wp, Math.max(0.1, WT.comma.cd[l] * cdMul * (evo ? 0.85 : 1)));
}

function spawnZone(x: number, y: number, dmg: number, r: number): void {
  const i = zoneHead; zoneHead = (zoneHead + 1) % MAX_ZONE;
  zOn[i] = 1; zX[i] = x; zY[i] = y; zLife[i] = 0.75; zTick[i] = 0.05; zDmg[i] = dmg; zR[i] = r;
}

// ---- parentheses
function updParen(w: World, wp: WeaponInst, dt: number): void {
  const p = w.player, st = w.stats, l = wp.level - 1, evo = wp.evolved;
  let n = evo ? 6 + st.amount : WT.paren.n[l] + st.amount;
  if (n > MAX_BLADES) n = MAX_BLADES;
  const rad = WT.paren.r[l] * (0.8 + 0.2 * aS) * (evo ? 1.4 : 1);
  wp.a += 3 * st.projSpeed * dt;
  const dmg = WT.paren.dmg[l] * st.damage * (evo ? 1.4 : 1);
  const br = 16 * aS;
  const step = 6.2831853 / n;
  const clear = evo && w.ebullets.count > 0;
  let hits = 0;
  bladeN = n;
  for (let i = 0; i < n; i++) {
    const a = wp.a + i * step;
    const x = p.x + Math.cos(a) * rad, y = p.y + Math.sin(a) * rad;
    bX[i] = x; bY[i] = y; bA[i] = a;
    if (clear) clearEnemyBulletsInRadius(w, x, y, 18 * aS + 6);
    const cnt = w.grid.query(x, y, br, qP);
    for (let j = 0; j < cnt; j++) {
      const e = qP[j];
      if (!e.active) continue;
      const dx = e.x - x, dy = e.y - y;
      const rr = br + e.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      const slot = e.id & 4095;
      if (parenHitId[slot] === e.id && w.time - parenHitT[slot] < 0.35) continue;
      parenHitId[slot] = e.id; parenHitT[slot] = w.time;
      const ox = e.x - p.x, oy = e.y - p.y;
      const od = Math.sqrt(ox * ox + oy * oy) || 1;
      const kb = 190 * st.knock;
      hit(w, e, dmg, ox / od * kb, oy / od * kb, false);
      hits++;
      fx.burst(w, x, y, RED, 2, 120, 2);
    }
  }
  if (hits > 0) {
    w.events.sfx('hit', 0.5);
    if (evo) {
      wp.b += hits;
      while (wp.b >= 25) { wp.b -= 25; healPlayer(w, 1); }
    }
  }
}

// ---- asterisk (mines)
function updAsterisk(w: World, wp: WeaponInst): void {
  if (wp.timer > 0) return;
  const p = w.player, st = w.stats, l = wp.level - 1;
  const n = WT.asterisk.n[l] + (st.amount > 0 ? (st.amount + 1) >> 1 : 0);
  let placed = 0;
  for (let k = 0; k < n; k++) {
    let slot = -1;
    for (let i = 0; i < MAX_MINES; i++) if (!mOn[i]) { slot = i; break; }
    if (slot < 0) break;
    const off = n > 1 ? 22 : 0;
    const a = w.rng.next() * 6.2832;
    mOn[slot] = 1; mT[slot] = 0;
    mX[slot] = p.x + Math.cos(a) * off * w.rng.next();
    mY[slot] = p.y + Math.sin(a) * off * w.rng.next();
    placed++;
  }
  if (placed > 0) rearm(wp, Math.max(0.15, WT.asterisk.cd[l] * cdMul));
  else wp.timer = 0.2;
}

function findWeapon(w: World, id: string): WeaponInst | null {
  const ws = w.weapons;
  for (let i = 0; i < ws.length; i++) if (ws[i].id === id) return ws[i];
  return null;
}

function updateMines(w: World, dt: number): void {
  const wp = findWeapon(w, 'asterisk');
  if (!wp) return;
  const st = w.stats, l = wp.level - 1, evo = wp.evolved;
  const R = WT.asterisk.r[l] * aS * (evo ? 1.1 : 1);
  const dmg = WT.asterisk.dmg[l] * st.damage * (evo ? 1.2 : 1);
  const expire = 4 * st.duration;
  for (let i = 0; i < MAX_MINES; i++) {
    if (!mOn[i]) continue;
    mT[i] += dt;
    let boom = mT[i] >= expire;
    if (!boom && mT[i] > 0.3) {
      const x = mX[i], y = mY[i];
      const cnt = w.grid.query(x, y, 22, qM);
      for (let j = 0; j < cnt; j++) {
        const e = qM[j];
        if (!e.active) continue;
        const dx = e.x - x, dy = e.y - y;
        const rr = 22 + e.r * 0.6;
        if (dx * dx + dy * dy < rr * rr) { boom = true; break; }
      }
    }
    if (boom) {
      mOn[i] = 0;
      explodeAt(w, mX[i], mY[i], R, dmg, true, true);
      if (evo) {
        const base = w.rng.next() * 6.2832;
        for (let k = 0; k < 4; k++) {
          const a = base + k * 1.5708;
          const q = miniHead; miniHead = (miniHead + 1) % MAX_MINI;
          qOn[q] = 1; qLead[q] = k === 0 ? 1 : 0;
          qX[q] = mX[i] + Math.cos(a) * 50; qY[q] = mY[i] + Math.sin(a) * 50;
          qD[q] = 0.15;
          // mini radius/damage derived from R/dmg at fire time via stored copies
        }
      }
    }
  }
}

function updateMiniQueue(w: World, dt: number): void {
  const wp = findWeapon(w, 'asterisk');
  for (let q = 0; q < MAX_MINI; q++) {
    if (!qOn[q]) continue;
    qD[q] -= dt;
    if (qD[q] > 0) continue;
    qOn[q] = 0;
    if (!wp) continue;
    const st = w.stats, l = wp.level - 1;
    const R = WT.asterisk.r[l] * aS * 1.1 * 0.65;
    const dmg = WT.asterisk.dmg[l] * st.damage * 1.2 * 0.6;
    explodeAt(w, qX[q], qY[q], R, dmg, false, qLead[q] === 1);
  }
}

function explodeAt(w: World, x: number, y: number, R: number, dmg: number, big: boolean, sfx: boolean): void {
  const st = w.stats;
  const n = w.grid.query(x, y, R, qE);
  for (let j = 0; j < n; j++) {
    const e = qE[j];
    if (!e.active) continue;
    const dx = e.x - x, dy = e.y - y;
    const rr = R + e.r * 0.6;
    const d2 = dx * dx + dy * dy;
    if (d2 > rr * rr) continue;
    const d = Math.sqrt(d2) || 1;
    const kb = 220 * st.knock;
    hit(w, e, dmg, dx / d * kb, dy / d * kb, false);
  }
  fx.ring(w, x, y, R, RED, big ? 0.35 : 0.25, big ? 6 : 4);
  fx.burst(w, x, y, RED, big ? 12 : 6, 240, big ? 4 : 3);
  if (big) { fx.shake(w, 3); fx.splat(w, x, y, R * 0.4, RED); }
  if (sfx) w.events.sfx('explode', big ? 0.8 : 0.35);
}

// ---- strikethrough
function updStrike(w: World, wp: WeaponInst): void {
  if (wp.timer > 0) return;
  const p = w.player, st = w.stats, l = wp.level - 1;
  const n = Math.min(8, WT.strike.n[l] + st.amount);
  const dmg = WT.strike.dmg[l] * st.damage;
  const half = 10 * aS;
  const L = Math.max(w.viewW, w.viewH) * 0.9;
  const items = w.enemies.items;
  let fired = 0;
  for (let k = 0; k < n; k++) {
    const t = randomOnScreen(w, k);
    if (!t) break;
    usedIds[k] = t.id;
    const diag = wp.level >= 3 && ((wp.a + k) & 1) === 1;
    const ang = diag ? (w.rng.next() < 0.5 ? 0.62 : -0.62) : (w.rng.next() - 0.5) * 0.1;
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const nx = -uy, ny = ux;
    fx.line(w, t.x - ux * L, t.y - uy * L, t.x + ux * L, t.y + uy * L, RED, 6 + 2 * aS, 0.25);
    for (let i = 0; i < items.length; i++) {
      const e = items[i];
      if (!e.active) continue;
      const rx = e.x - t.x, ry = e.y - t.y;
      const dd = rx * nx + ry * ny;
      if (dd > half + e.r || dd < -(half + e.r)) continue;
      const al = rx * ux + ry * uy;
      if (al > L || al < -L) continue;
      const side = dd >= 0 ? 1 : -1;
      hit(w, e, dmg, nx * side * 140 * st.knock, ny * side * 140 * st.knock, false);
    }
    fired++;
  }
  wp.a++;
  if (fired > 0) {
    fx.shake(w, 2);
    w.events.sfx('swoosh');
    rearm(wp, Math.max(0.2, WT.strike.cd[l] * cdMul));
  } else {
    wp.timer = 0;
  }
  void p;
}

// ---- exclamation
function updBang(w: World, wp: WeaponInst): void {
  if (wp.timer > 0) return;
  const st = w.stats, l = wp.level - 1, evo = wp.evolved;
  const n = Math.min(10, WT.bang.n[l] + st.amount);
  const dmg = WT.bang.dmg[l] * st.damage * (evo ? 1.25 : 1);
  const chain = WT.bang.chain[l] + (evo ? 4 : 0);
  let fired = 0;
  for (let k = 0; k < n; k++) {
    const t = randomOnScreen(w, k);
    if (!t) break;
    usedIds[k] = t.id;
    bangStrike(w, t, dmg, chain, evo);
    fired++;
  }
  if (fired > 0) {
    w.events.sfx('zap');
    fx.shake(w, evo ? 2.5 : 1.5);
    rearm(wp, Math.max(0.2, WT.bang.cd[l] * cdMul));
  } else {
    wp.timer = 0;
  }
}

function bangStrike(w: World, t: Enemy, dmg: number, chain: number, evo: boolean): void {
  const st = w.stats;
  const col = evo ? PALETTE.gold : RED;
  const crit = evo || rollCrit(w);
  const base = crit ? dmg * st.critMult : dmg;
  const R = 30 * aS;
  const tx = t.x, ty = t.y;
  fx.bolt(w, tx + (w.rng.next() - 0.5) * 24, ty - 300, tx, ty, col, 0.2);
  fx.ring(w, tx, ty, R, col, 0.25, 4);
  fx.burst(w, tx, ty, col, 7, 200, 3);
  const n = w.grid.query(tx, ty, R, qE);
  for (let j = 0; j < n; j++) {
    const e = qE[j];
    if (!e.active) continue;
    const dx = e.x - tx, dy = e.y - ty;
    const rr = R + e.r;
    if (dx * dx + dy * dy > rr * rr) continue;
    damageEnemy(w, e, base, crit, 0, 0);
  }
  let cur: Enemy = t;
  let cx = tx, cy = ty;
  let nUsed = 1;
  let d = base;
  for (let j = 0; j < chain && nUsed < 16; j++) {
    const nx = nearestOther(w, cx, cy, 120, nUsed);
    if (!nx) break;
    usedIds[nUsed++] = nx.id;
    d *= 0.7;
    fx.bolt(w, cx, cy, nx.x, nx.y, col, 0.18);
    fx.burst(w, nx.x, nx.y, col, 4, 160, 2);
    cx = nx.x; cy = nx.y;
    cur = nx;
    damageEnemy(w, cur, d, crit, 0, 0);
  }
}

// ---- highlighter
function updHighlighter(w: World, wp: WeaponInst, dt: number): void {
  const p = w.player, st = w.stats, l = wp.level - 1, evo = wp.evolved;
  const R = WT.highlighter.r[l] * aS * (evo ? 2 : 1);
  auraOn = true; auraEvo = evo; auraR = R;
  if (evo) {
    const cnt = w.grid.query(p.x, p.y, R, qP);
    for (let j = 0; j < cnt; j++) {
      const e = qP[j];
      if (!e.active || e.boss) continue;
      const dx = p.x - e.x, dy = p.y - e.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > R * R || d2 < 28 * 28) continue;
      const d = Math.sqrt(d2);
      e.kx += dx / d * 900 * dt;
      e.ky += dy / d * 900 * dt;
    }
  }
  if (wp.timer > 0) return;
  const dmg = WT.highlighter.dmg[l] * st.damage * (evo ? 1.5 : 1);
  const cnt = w.grid.query(p.x, p.y, R, qP);
  let any = false;
  for (let j = 0; j < cnt; j++) {
    const e = qP[j];
    if (!e.active) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const rr = R + e.r * 0.5;
    if (dx * dx + dy * dy > rr * rr) continue;
    if (e.slow < 0.3) e.slow = 0.3;
    if (e.burn < 1.5) e.burn = 1.5;
    hit(w, e, dmg, 0, 0, false);
    any = true;
  }
  if (evo) {
    const items = w.pickups.items;
    const R2 = R * R;
    for (let i = 0; i < items.length; i++) {
      const pk = items[i];
      if (!pk.active || pk.magnet || pk.kind !== 'xp') continue;
      const dx = pk.x - p.x, dy = pk.y - p.y;
      if (dx * dx + dy * dy < R2) pk.magnet = true;
    }
  }
  if (any) auraFlash = 0.12;
  rearm(wp, Math.max(0.07, WT.highlighter.tick[l] * cdMul));
}

// ---- eraser
function updEraser(w: World, wp: WeaponInst): void {
  if (wp.timer > 0) return;
  const p = w.player, st = w.stats, l = wp.level - 1;
  const R = WT.eraser.r[l] * aS;
  const cnt = w.grid.query(p.x, p.y, R, qE);
  const dmg = WT.eraser.dmg[l] * st.damage;
  let any = false;
  for (let j = 0; j < cnt; j++) {
    const e = qE[j];
    if (!e.active) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const rr = R + e.r * 0.5;
    const d2 = dx * dx + dy * dy;
    if (d2 > rr * rr) continue;
    const d = Math.sqrt(d2) || 1;
    const kb = (e.boss ? 160 : 420 + (1 - d / R) * 220) * st.knock;
    hit(w, e, dmg, dx / d * kb, dy / d * kb, false);
    any = true;
  }
  const eb = clearEnemyBulletsInRadius(w, p.x, p.y, R);
  if (!any && eb === 0) { wp.timer = 0; return; }
  fx.ring(w, p.x, p.y, R, PINK, 0.4, 9);
  fx.ring(w, p.x, p.y, R * 0.6, '#ffffff', 0.25, 4);
  fx.burst(w, p.x, p.y, PINK, 14, 300, 3);
  fx.shake(w, 2);
  w.events.sfx('explode', 0.3);
  rearm(wp, Math.max(0.3, WT.eraser.cd[l] * cdMul));
}

// ----------------------------------------------------------------- bullets
export function updateBullets(w: World, dt: number): void {
  syncWorld(w);
  const p = w.player;
  const items = w.bullets.items;
  const lim = w.viewH * 1.2;
  const lim2 = lim * lim;
  for (let i = 0; i < items.length; i++) {
    const b = items[i];
    if (!b.active) continue;
    b.t += dt;
    const kind = b.kind;
    if (kind === 'comma' || kind === 'semicolon') { updBoomerang(w, b, dt); continue; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) { w.bullets.free(b); continue; }
    const px = b.x - p.x, py = b.y - p.y;
    if (px * px + py * py > lim2) { w.bullets.free(b); continue; }
    if (collideBullet(w, b, false)) w.bullets.free(b);
  }
  updateZones(w, dt);
}

/** Returns true if the bullet should die. */
function collideBullet(w: World, b: Bullet, boom: boolean): boolean {
  const n = w.grid.query(b.x, b.y, b.r, qB);
  for (let j = 0; j < n; j++) {
    const e = qB[j];
    if (!e.active) continue;
    const dx = e.x - b.x, dy = e.y - b.y;
    const rr = b.r + e.r;
    if (dx * dx + dy * dy > rr * rr) continue;
    if (hasHit(b, e.id)) continue;
    addHit(b, e.id);
    const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
    const crit = w.rng.next() < b.crit;
    damageEnemy(w, e, crit ? b.dmg * w.stats.critMult : b.dmg, crit, b.vx / sp * b.knock, b.vy / sp * b.knock);
    if (!boom) fx.burst(w, b.x, b.y, RED, crit ? 4 : 2, 130, 2);
    if (b.split > 0) spawnShards(w, b, e.id);
    if (!boom) {
      if (b.pierce > 0) b.pierce--;
      else return true;
    }
  }
  return false;
}

function spawnShards(w: World, b: Bullet, parentId: number): void {
  if (w.bullets.count > w.bullets.capacity * 0.85) return;
  const base = w.rng.next() * 6.2832;
  const r = 3 * aS;
  for (let k = 0; k < b.split; k++) {
    const a = base + k * (6.2831853 / b.split);
    const s = spawnBullet(w, 'shard', b.x, b.y, Math.cos(a) * 380, Math.sin(a) * 380, r, b.dmg * 0.4, 0, 0.45, 40, 0);
    if (s) { s.hits[0] = parentId; s.nHits = 1; }
  }
}

function updBoomerang(w: World, b: Bullet, dt: number): void {
  const p = w.player;
  if (b.a === 0) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.b -= Math.sqrt(b.vx * b.vx + b.vy * b.vy) * dt;
    if (b.b <= 0 || b.t > 6) { b.a = 1; b.nHits = 0; }
  } else {
    const dx = p.x - b.x, dy = p.y - b.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < p.r + 10 || b.t > 14) { w.bullets.free(b); return; }
    let sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    sp = Math.min(sp * (1 + 2.2 * dt), 1000);
    if (sp < 260) sp = 260;
    b.vx = dx / d * sp; b.vy = dy / d * sp;
    b.x += b.vx * dt; b.y += b.vy * dt;
  }
  if (b.kind === 'semicolon' && (b.t % 0.07) < dt) spawnZone(b.x, b.y, b.dmg * 0.4, 15 * aS);
  collideBullet(w, b, true);
}

function updateZones(w: World, dt: number): void {
  for (let i = 0; i < MAX_ZONE; i++) {
    if (!zOn[i]) continue;
    zLife[i] -= dt;
    if (zLife[i] <= 0) { zOn[i] = 0; continue; }
    zTick[i] -= dt;
    if (zTick[i] > 0) continue;
    zTick[i] = 0.2;
    const x = zX[i], y = zY[i], r = zR[i];
    const n = w.grid.query(x, y, r, qB);
    for (let j = 0; j < n; j++) {
      const e = qB[j];
      if (!e.active) continue;
      const dx = e.x - x, dy = e.y - y;
      const rr = r + e.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      damageEnemy(w, e, zDmg[i], false, 0, 0);
    }
  }
}

// ----------------------------------------------------------------- render
let sprComma: HTMLCanvasElement | null = null;
let sprSemi: HTMLCanvasElement | null = null;
let sprParenL: HTMLCanvasElement | null = null;
let sprParenR: HTMLCanvasElement | null = null;
let sprMine: HTMLCanvasElement | null = null;
let sprBracketL: HTMLCanvasElement | null = null;
let sprBracketR: HTMLCanvasElement | null = null;

function makeGlyph(key: string, ch: string, cw: number, ch2: number, font: string): HTMLCanvasElement {
  return getSprite(key, cw, ch2, (c) => {
    c.font = font;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    const m = c.measureText(ch);
    const asc = m.actualBoundingBoxAscent || ch2 * 0.4;
    const desc = m.actualBoundingBoxDescent || 0;
    const y = ch2 / 2 + (asc - desc) / 2;
    c.lineJoin = 'round';
    c.lineWidth = 5;
    c.strokeStyle = PALETTE.redDark;
    c.strokeText(ch, cw / 2, y);
    c.fillStyle = RED;
    c.fillText(ch, cw / 2, y);
  });
}

function ensureSprites(): void {
  if (sprComma) return;
  sprComma = makeGlyph('wp_comma', ',', 48, 48, 'bold 84px Georgia, "Times New Roman", serif');
  sprSemi = makeGlyph('wp_semi', ';', 48, 48, 'bold 84px Georgia, "Times New Roman", serif');
  sprParenL = makeGlyph('wp_parenL', '(', 40, 64, 'bold 80px Georgia, "Times New Roman", serif');
  sprParenR = makeGlyph('wp_parenR', ')', 40, 64, 'bold 80px Georgia, "Times New Roman", serif');
  sprBracketL = makeGlyph('wp_brL', '[', 40, 64, 'bold 80px Georgia, "Times New Roman", serif');
  sprBracketR = makeGlyph('wp_brR', ']', 40, 64, 'bold 80px Georgia, "Times New Roman", serif');
  sprMine = makeGlyph('wp_mine', '*', 48, 48, 'bold 90px Georgia, "Times New Roman", serif');
}

export function renderWeapons(ctx: CanvasRenderingContext2D, w: World): void {
  syncWorld(w);
  ensureSprites();
  const p = w.player;
  const st = w.stats;
  const tt = w.time;

  // --- aura
  if (auraOn && p.alive) {
    const pulse = 0.5 + 0.5 * Math.sin(tt * (auraEvo ? 9 : 6));
    const fl = auraFlash > 0 ? 1 : 0;
    ctx.save();
    ctx.fillStyle = auraEvo ? '#ffb0d8' : YEL;
    ctx.globalAlpha = (auraEvo ? 0.16 : 0.18) + pulse * 0.05 + fl * 0.08;
    ctx.beginPath(); ctx.arc(p.x, p.y, auraR, 0, 6.2832); ctx.fill();
    if (auraEvo) {
      ctx.fillStyle = YEL;
      ctx.globalAlpha = 0.12 + (1 - pulse) * 0.08;
      ctx.beginPath(); ctx.arc(p.x, p.y, auraR * (0.55 + 0.15 * pulse), 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 0.55 + fl * 0.3;
    ctx.lineWidth = auraEvo ? 4 : 3;
    ctx.strokeStyle = auraEvo ? PINK : '#e6b800';
    ctx.beginPath(); ctx.arc(p.x, p.y, auraR - 1.5, 0, 6.2832); ctx.stroke();
    if (auraEvo) {
      ctx.strokeStyle = YEL;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, auraR - 8 - pulse * 4, 0, 6.2832); ctx.stroke();
    }
    ctx.restore();
  }

  // --- trail zones (semicolon ink)
  ctx.fillStyle = RED;
  for (let i = 0; i < MAX_ZONE; i++) {
    if (!zOn[i]) continue;
    const f = zLife[i] / 0.75;
    ctx.globalAlpha = f * 0.45;
    ctx.beginPath(); ctx.arc(zX[i], zY[i], zR[i] * (0.6 + 0.4 * f), 0, 6.2832); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // --- mines
  const expire = 4 * st.duration;
  for (let i = 0; i < MAX_MINES; i++) {
    if (!mOn[i]) continue;
    const t = mT[i];
    const armed = t > 0.3;
    const rate = t > expire - 1 ? 22 : armed ? 9 : 4;
    const sc = 1 + 0.14 * Math.sin(t * rate);
    const s = 26 * sc * (0.85 + 0.15 * aS);
    ctx.globalAlpha = armed ? 1 : 0.5;
    ctx.drawImage(sprMine!, mX[i] - s / 2, mY[i] - s / 2, s, s);
  }
  ctx.globalAlpha = 1;

  // --- bullets
  const items = w.bullets.items;
  const nB = items.length;
  const lw = 8 * aS;
  // darts: streaks
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < nB; i++) {
    const b = items[i];
    if (!b.active || b.kind !== 'dart') continue;
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.05, b.y - b.vy * 0.05);
  }
  ctx.strokeStyle = RED; ctx.lineWidth = lw; ctx.stroke();
  ctx.strokeStyle = '#ff9aa6'; ctx.lineWidth = lw * 0.35;
  ctx.beginPath();
  for (let i = 0; i < nB; i++) {
    const b = items[i];
    if (!b.active || b.kind !== 'dart') continue;
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.025, b.y - b.vy * 0.025);
  }
  ctx.stroke();
  // shards
  ctx.fillStyle = RED;
  ctx.beginPath();
  for (let i = 0; i < nB; i++) {
    const b = items[i];
    if (!b.active || b.kind !== 'shard') continue;
    ctx.moveTo(b.x + b.r, b.y);
    ctx.arc(b.x, b.y, b.r, 0, 6.2832);
  }
  ctx.fill();
  // commas / semicolons
  for (let i = 0; i < nB; i++) {
    const b = items[i];
    if (!b.active) continue;
    if (b.kind !== 'comma' && b.kind !== 'semicolon') continue;
    const s = b.r * 3.6;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.t * 16);
    ctx.drawImage(b.kind === 'comma' ? sprComma! : sprSemi!, -s / 2, -s / 2, s, s);
    ctx.restore();
  }

  // --- orbit blades
  if (bladeN > 0) {
    const wp = findWeapon(w, 'paren');
    const evo = wp ? wp.evolved : false;
    const h = 44 * (0.8 + 0.2 * aS) * (evo ? 1.1 : 1);
    const wd = h * 0.62;
    for (let i = 0; i < bladeN; i++) {
      const spr = evo ? ((i & 1) ? sprBracketL! : sprBracketR!) : ((i & 1) ? sprParenL! : sprParenR!);
      ctx.save();
      ctx.translate(bX[i], bY[i]);
      ctx.rotate(bA[i]);
      ctx.drawImage(spr, -wd / 2, -h / 2, wd, h);
      ctx.restore();
    }
  }
}
