// OWNER: enemy agent. Contract — keep signatures.
import type { World, Enemy, EnemyKind, EnemyBulletKind } from '../types';
import { hurtPlayer } from './player';
import { dropPickup } from './pickups';
import * as fx from './fx';
import { findReplaceProc } from './upgrades';

export interface SpawnOpts { hpMult?: number; dmgMult?: number; speedMult?: number; elite?: boolean; }

export interface EnemyDef {
  hp: number; speed: number; r: number; dmg: number; xp: number;
  /** intrinsically elite (drops chest, no extra multipliers) */
  elite?: boolean; boss?: boolean;
  name?: string;
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  typo:      { hp: 8,   speed: 70, r: 11, dmg: 8,  xp: 1 },
  smudge:    { hp: 40,  speed: 38, r: 18, dmg: 14, xp: 3 },
  smudgelet: { hp: 10,  speed: 85, r: 9,  dmg: 6,  xp: 1 },
  blot:      { hp: 22,  speed: 55, r: 14, dmg: 10, xp: 2 },
  dangler:   { hp: 26,  speed: 60, r: 13, dmg: 12, xp: 2 },
  widow:     { hp: 30,  speed: 45, r: 14, dmg: 10, xp: 2 },
  redaction: { hp: 260, speed: 55, r: 26, dmg: 18, xp: 20, elite: true },
  boss_runon:     { hp: 1800, speed: 95, r: 20, dmg: 20, xp: 0, boss: true, name: 'The Run-On Sentence' },
  boss_runon_seg: { hp: 1e9,  speed: 0,  r: 11, dmg: 10, xp: 0, boss: true },
  boss_redactor:  { hp: 3200, speed: 60, r: 46, dmg: 20, xp: 0, boss: true, name: 'The Redactor' },
  boss_purple:    { hp: 4500, speed: 70, r: 40, dmg: 20, xp: 0, boss: true, name: 'Purple Prose' },
};

export const TYPO_WORDS: readonly string[] = [
  'teh', 'recieve', 'adn', 'wierd', 'definately', 'seperate', 'occured', 'untill', 'alot',
  'becuase', 'thier', 'wich', 'tommorow', 'acheive', 'goverment', 'enviroment', 'existance',
  'neccessary', 'persue', 'beleive', 'freind', 'calender', 'accomodate', 'embarass',
];

const RUNON_TEXT = 'andthenandsoandbut';
const RUNON_SEGS = 18;
const RUNON_SPACING = 20;
const INK = '#1b1a22';
const INK_SPLAT = 'rgba(27,26,34,0.85)';
const TAU = Math.PI * 2;

// state ids
const S_DYING = 9;

const scratch: Enemy[] = [];
const sopts: SpawnOpts = {};
let frameCounter = 0;

// ------------------------------------------------------------------ helpers

function hasMut(w: World, name: string): boolean {
  return w.mutators.indexOf(name) >= 0;
}

/** Spawn an enemy bullet (exported for director). Returns false if pool is full. */
export function spawnEBullet(
  w: World, kind: EnemyBulletKind, x: number, y: number, vx: number, vy: number,
  r: number, dmg: number, life: number,
): boolean {
  const b = w.ebullets.spawn();
  if (!b) return false;
  b.kind = kind; b.x = x; b.y = y; b.vx = vx; b.vy = vy;
  b.r = r; b.dmg = dmg; b.life = life; b.t = 0; b.a = 0;
  return true;
}

export function spawnEnemy(w: World, kind: EnemyKind, x: number, y: number, opts?: SpawnOpts): Enemy | null {
  const def = ENEMY_DEFS[kind];
  const isSeg = kind === 'boss_runon_seg';
  const e = w.enemies.spawn();
  if (!e) return null;
  const hpMult = opts && opts.hpMult !== undefined ? opts.hpMult : 1;
  const dmgMult = opts && opts.dmgMult !== undefined ? opts.dmgMult : 1;
  const speedMult = opts && opts.speedMult !== undefined ? opts.speedMult : 1;
  const wantElite = !!(opts && opts.elite) && !def.boss;
  const elite = wantElite || !!def.elite;
  const extra = wantElite && !def.elite;

  e.id = w.nextEnemyId++;
  e.kind = kind;
  e.x = x; e.y = y; e.vx = 0; e.vy = 0; e.kx = 0; e.ky = 0;
  e.r = def.r * (extra ? 1.35 : 1);
  e.maxHp = def.hp * (isSeg ? 1 : hpMult) * (extra ? 6 : 1);
  e.hp = e.maxHp;
  e.speed = def.speed * speedMult;
  e.dmg = def.dmg * dmgMult;
  e.xp = def.xp * (extra ? 8 : 1);
  e.elite = elite;
  e.boss = !!def.boss;
  e.t = 0; e.state = 0; e.timer = 0;
  e.flash = 0; e.slow = 0; e.burn = 0;
  e.a = 0; e.b = 0; e.c = 0;
  e.link = null;
  e.glyph = '';

  switch (kind) {
    case 'typo':
      e.glyph = w.rng.pick(TYPO_WORDS);
      break;
    case 'smudge':
      e.glyph = '●'; e.b = hpMult; break;
    case 'smudgelet': e.glyph = '•'; break;
    case 'blot':
      e.glyph = '✺'; e.timer = w.rng.range(0.6, 2.2); break;
    case 'dangler':
      e.glyph = '—ing'; e.timer = w.rng.range(1.5, 3.5); break;
    case 'widow': e.glyph = '¶'; break;
    case 'redaction':
      e.glyph = '█████'; e.timer = w.rng.range(2, 4); break;
    case 'boss_runon': {
      e.glyph = 'and'; e.timer = 3;
      w.boss = e; w.bossName = def.name!;
      // trail of segments
      let prev: Enemy = e;
      for (let i = 0; i < RUNON_SEGS; i++) {
        const s = w.enemies.spawn();
        if (!s) break;
        s.id = w.nextEnemyId++;
        s.kind = 'boss_runon_seg';
        s.x = x; s.y = y - (i + 1) * RUNON_SPACING; s.vx = 0; s.vy = 0; s.kx = 0; s.ky = 0;
        s.r = ENEMY_DEFS.boss_runon_seg.r;
        s.maxHp = 1e9; s.hp = 1e9;
        s.speed = 0; s.dmg = ENEMY_DEFS.boss_runon_seg.dmg * dmgMult; s.xp = 0;
        s.elite = false; s.boss = true;
        s.t = 0; s.state = 0; s.timer = 0; s.flash = 0; s.slow = 0; s.burn = 0;
        s.a = i; s.b = 0; s.c = 0;
        s.link = prev;
        s.glyph = RUNON_TEXT.charAt(i % RUNON_TEXT.length);
        prev = s;
      }
      break;
    }
    case 'boss_redactor':
      e.glyph = '█'; e.timer = 2; w.boss = e; w.bossName = def.name!; break;
    case 'boss_purple':
      e.glyph = '❀'; e.timer = 5; e.c = w.rng.chance(0.5) ? 1 : -1;
      e.a = w.rng.angle(); e.b = 0.5;
      w.boss = e; w.bossName = def.name!; break;
    case 'boss_runon_seg': break;
  }
  return e;
}

function findHead(e: Enemy): Enemy | null {
  let h: Enemy = e;
  for (let i = 0; i < RUNON_SEGS + 2; i++) {
    if (!h.link) return h.kind === 'boss_runon' ? h : null;
    h = h.link;
  }
  return null;
}

// ------------------------------------------------------------------ damage / death

function hurt(w: World, e: Enemy, amount: number, crit: boolean, kx: number, ky: number, quiet: boolean): boolean {
  if (!e.active || e.hp <= 0) return false;
  let tgt = e;
  if (e.kind === 'boss_runon_seg') {
    if (e.state === S_DYING) return false;
    const head = findHead(e);
    if (!head || !head.active || head.hp <= 0) return false;
    tgt = head;
    e.flash = 0.08;
  }
  tgt.hp -= amount;
  tgt.flash = 0.08;
  if (!tgt.boss) {
    const mass = Math.max(0.6, tgt.r / 12);
    tgt.kx += kx / mass; tgt.ky += ky / mass;
    const k2 = tgt.kx * tgt.kx + tgt.ky * tgt.ky;
    if (k2 > 640000) { const s = 800 / Math.sqrt(k2); tgt.kx *= s; tgt.ky *= s; }
  }
  if (!quiet) {
    fx.dmgNumber(w, e.x, e.y - e.r, amount, crit);
    w.events.sfx(crit ? 'crit' : 'hit');
  }
  if (tgt.hp <= 0) {
    kill(w, tgt);
    return true;
  }
  return false;
}

export function damageEnemy(w: World, e: Enemy, amount: number, crit: boolean, kx: number, ky: number): boolean {
  return hurt(w, e, amount, crit, kx, ky, false);
}

function spawnClone(w: World, kind: EnemyKind, x: number, y: number, hpMult: number, dmgMult: number, speedMult: number): void {
  sopts.hpMult = hpMult; sopts.dmgMult = dmgMult; sopts.speedMult = speedMult; sopts.elite = false;
  spawnEnemy(w, kind, x, y, sopts);
}

function kill(w: World, e: Enemy): void {
  if (!e.active) return;
  e.hp = 0;
  const x = e.x, y = e.y, r = e.r, kind = e.kind;
  const elite = e.elite, isBoss = e.boss, xp = e.xp, edmg = e.dmg, espeed = e.speed, eb = e.b;
  const rng = w.rng;
  const def = ENEMY_DEFS[kind];

  if (isBoss) {
    const name = w.bossName;
    if (w.boss === e) w.boss = null;
    w.bossesKilled++;
    w.kills++;
    w.score += 500 * (1 + w.page * 0.1);
    if (kind === 'boss_runon') {
      // pop segments one by one over 0.8s
      const pool = w.enemies.items;
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i];
        if (s.active && s.kind === 'boss_runon_seg' && s.state !== S_DYING) {
          s.state = S_DYING; s.link = null; s.vx = 0; s.vy = 0;
          s.timer = 0.05 + (s.a / RUNON_SEGS) * 0.8;
          s.dmg = 0;
        }
      }
    }
    w.enemies.free(e);
    clearEnemyBulletsInRadius(w, x, y, 99999);
    fx.ring(w, x, y, 300, INK, 0.7, 8);
    fx.burst(w, x, y, INK, 60, 300, 4);
    fx.splat(w, x, y, r * 2.2, INK_SPLAT);
    fx.shake(w, 20);
    fx.hitstop(w, 0.12);
    fx.flash(w, '#fffaf0', 0.7);
    dropPickup(w, 'chest', x - 30, y, 1);
    dropPickup(w, 'chest', x + 30, y, 1);
    for (let i = 0; i < 25; i++) {
      const a = rng.angle(), d = rng.range(20, 120);
      dropPickup(w, 'xp', x + Math.cos(a) * d, y + Math.sin(a) * d, 10);
    }
    w.events.bossDefeated(name);
    return;
  }

  // regular enemy
  w.kills++;
  w.score += xp * 10 * (1 + w.page * 0.1);
  w.enemies.free(e);

  fx.burst(w, x, y, INK, rng.int(8, 14), 140, 3);
  fx.splat(w, x, y, r * rng.range(1.2, 1.8), INK_SPLAT);
  w.events.sfx('kill');

  // xp
  if (xp > 0) {
    if (xp > 5) {
      const n = Math.min(5, Math.ceil(xp / 5));
      const each = Math.floor(xp / n);
      let rem = xp - each * n;
      for (let i = 0; i < n; i++) {
        const a = rng.angle(), d = rng.range(2, 16);
        dropPickup(w, 'xp', x + Math.cos(a) * d, y + Math.sin(a) * d, each + rem);
        rem = 0;
      }
    } else {
      dropPickup(w, 'xp', x, y, xp);
    }
  }
  if (rng.next() < 0.012) dropPickup(w, 'heal', x + 6, y, 20);
  if (rng.next() < 0.0035) dropPickup(w, 'magnet', x - 6, y, 0);
  if (elite) {
    dropPickup(w, 'chest', x, y, 1);
    fx.shake(w, 6);
    fx.hitstop(w, 0.05);
  }

  // kind-specific
  if (kind === 'smudge') {
    const hm = eb > 0 ? eb : 1;
    const dm = def.dmg > 0 ? edmg / def.dmg : 1;
    const sm = def.speed > 0 ? espeed / def.speed : 1;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + rng.range(0, 1);
      const sl = spawnEnemyScratch(w, 'smudgelet', x + Math.cos(a) * 10, y + Math.sin(a) * 10, hm, dm, sm);
      if (sl) { sl.kx = Math.cos(a) * 160; sl.ky = Math.sin(a) * 160; }
    }
  } else if (kind === 'widow') {
    const bdmg = edmg * 0.8;
    const off = rng.angle();
    for (let i = 0; i < 8; i++) {
      const a = off + (i / 8) * TAU;
      spawnEBullet(w, 'drop', x, y, Math.cos(a) * 120, Math.sin(a) * 120, 6, bdmg, 6);
    }
    w.events.sfx('enemyShoot');
  }

  // Footnoted mutator
  if (w.mutators.length > 0 && hasMut(w, 'Footnoted')) {
    const dx = w.player.x - x, dy = w.player.y - y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    spawnEBullet(w, 'drop', x, y, (dx / d) * 110, (dy / d) * 110, 5, Math.max(4, edmg * 0.6), 5);
  }

  findReplaceProc(w, x, y);
}

function spawnEnemyScratch(w: World, kind: EnemyKind, x: number, y: number, hm: number, dm: number, sm: number): Enemy | null {
  sopts.hpMult = hm; sopts.dmgMult = dm; sopts.speedMult = sm; sopts.elite = false;
  return spawnEnemy(w, kind, x, y, sopts);
}

// ------------------------------------------------------------------ AI

function ai(w: World, e: Enemy, dt: number, dx: number, dy: number, d: number): void {
  const nx = dx / d, ny = dy / d;
  const sp = e.speed;
  switch (e.kind) {
    case 'typo':
    case 'smudge':
    case 'smudgelet':
    case 'widow': {
      let wob = 0;
      if (e.kind === 'typo') wob = Math.sin(e.t * 6 + e.id) * 0.35 * sp;
      e.vx = nx * sp - ny * wob;
      e.vy = ny * sp + nx * wob;
      break;
    }
    case 'blot': {
      let rr: number, tt = 0;
      if (d < 170) rr = -1; else if (d > 220) rr = 1; else { rr = 0; tt = 0.6; }
      let m = 1;
      if (e.state === 1) {
        m = 0.25;
        e.c -= dt;
        if (e.c <= 0) {
          spawnEBullet(w, 'drop', e.x, e.y, nx * 170, ny * 170, 6, e.dmg, 6);
          w.events.sfx('enemyShoot');
          e.state = 0; e.timer = 2.2;
        }
      } else {
        e.timer -= dt;
        if (e.timer <= 0) { e.state = 1; e.c = 0.35; }
      }
      e.vx = (nx * rr - ny * tt) * sp * m;
      e.vy = (ny * rr + nx * tt) * sp * m;
      break;
    }
    case 'dangler': {
      if (e.state === 0) {
        e.vx = nx * sp; e.vy = ny * sp;
        e.timer -= dt;
        if (e.timer <= 0) { e.state = 1; e.timer = 0.5; e.a = nx; e.b = ny; }
      } else if (e.state === 1) {
        e.vx = 0; e.vy = 0;
        e.timer -= dt;
        if (e.timer <= 0) { e.state = 2; e.timer = 0.45; }
      } else {
        const ds = 420 * (sp / 60);
        e.vx = e.a * ds; e.vy = e.b * ds;
        e.timer -= dt;
        if (e.timer <= 0) { e.state = 0; e.timer = 2.4 + w.rng.next() * 1.4; }
      }
      break;
    }
    case 'redaction': {
      if (e.state === 0) {
        e.vx = nx * sp; e.vy = ny * sp;
        e.timer -= dt;
        if (e.timer <= 0) { e.state = 1; e.c = 0.4; e.a = nx; e.b = ny; }
      } else if (e.state === 1) {
        e.vx = 0; e.vy = 0;
        e.c -= dt;
        if (e.c <= 0) { e.state = 2; e.c = 0.8; }
      } else {
        const ds = 300 * (sp / 55);
        e.vx = e.a * ds; e.vy = e.b * ds;
        e.c -= dt;
        if (e.c <= 0) { e.state = 0; e.timer = 4; }
      }
      break;
    }
    case 'boss_runon': {
      const ang = Math.atan2(dy, dx) + Math.sin(e.t * 2.4) * 0.8;
      let m = 1;
      if (e.b > 0) { e.b -= dt; m = 2.2; }
      else { e.timer -= dt; if (e.timer <= 0) { e.b = 1.2; e.timer = 5; } }
      e.vx = Math.cos(ang) * sp * m;
      e.vy = Math.sin(ang) * sp * m;
      break;
    }
    case 'boss_runon_seg': {
      e.vx = 0; e.vy = 0;
      break;
    }
    case 'boss_redactor': aiRedactor(w, e, dt, dx, dy, d, nx, ny); break;
    case 'boss_purple': aiPurple(w, e, dt, d, nx, ny); break;
  }
}

function aiRedactor(w: World, e: Enemy, dt: number, dx: number, dy: number, d: number, nx: number, ny: number): void {
  const enraged = e.hp < e.maxHp * 0.5;
  const mul = enraged ? 0.6 : 1;
  const dmg = e.dmg * 0.6;
  const sp = e.speed;
  switch (e.state) {
    case 0: {
      let rr = (d - 180) / 50;
      if (rr > 1) rr = 1; else if (rr < -1) rr = -1;
      e.vx = nx * rr * sp - ny * sp * 0.25;
      e.vy = ny * rr * sp + nx * sp * 0.25;
      e.timer -= dt;
      if (e.timer <= 0) {
        const atk = e.a;
        e.a = (e.a + 1) % 3;
        if (atk === 0) { e.state = 1; e.b = 3; e.timer = 0; }
        else if (atk === 1) {
          const base = Math.atan2(dy, dx);
          for (let i = -2; i <= 2; i++) {
            const a = base + i * 0.22;
            spawnEBullet(w, 'block', e.x, e.y, Math.cos(a) * 190, Math.sin(a) * 190, 9, dmg, 6);
          }
          w.events.sfx('enemyShoot');
          e.timer = 1.6 * mul;
        } else {
          e.state = 3; e.timer = 0.7; e.c = Math.atan2(dy, dx);
          fx.line(w, e.x, e.y, e.x + Math.cos(e.c) * 330, e.y + Math.sin(e.c) * 330, 'rgba(215,38,61,0.8)', 2, 0.7);
        }
      }
      break;
    }
    case 1: {
      e.vx = 0; e.vy = 0;
      e.timer -= dt;
      if (e.timer <= 0) {
        const off = (e.b & 1) * (Math.PI / 16);
        for (let i = 0; i < 16; i++) {
          const a = off + (i / 16) * TAU;
          spawnEBullet(w, 'block', e.x, e.y, Math.cos(a) * 140, Math.sin(a) * 140, 9, dmg, 7);
        }
        w.events.sfx('enemyShoot');
        e.b--;
        e.timer = 0.6 * mul + 0.1;
        if (e.b <= 0) { e.state = 0; e.timer = 1.6 * mul; }
      }
      break;
    }
    case 3: {
      e.vx = 0; e.vy = 0;
      e.timer -= dt;
      if (e.timer <= 0) { e.state = 4; e.timer = 0.5; w.events.sfx('dash'); }
      break;
    }
    default: {
      e.vx = Math.cos(e.c) * 600; e.vy = Math.sin(e.c) * 600;
      e.timer -= dt;
      if (e.timer <= 0) { e.state = 0; e.timer = 1.4 * mul; }
      break;
    }
  }
}

function aiPurple(w: World, e: Enemy, dt: number, d: number, nx: number, ny: number): void {
  const enraged = e.hp < e.maxHp * 0.35;
  const sp = e.speed;
  let rr = (d - 200) / 60;
  if (rr > 1) rr = 1; else if (rr < -1) rr = -1;
  const tv = e.c * sp * 0.9;
  e.vx = nx * rr * sp - ny * tv;
  e.vy = ny * rr * sp + nx * tv;

  e.b -= dt;
  if (e.b <= 0) {
    e.b += 0.09;
    const arms = enraged ? 3 : 2;
    const dmg = e.dmg * 0.5;
    for (let k = 0; k < arms; k++) {
      const a = e.a + (k / arms) * TAU;
      spawnEBullet(w, 'petal', e.x, e.y, Math.cos(a) * 130, Math.sin(a) * 130, 6, dmg, 5);
    }
    e.a += 0.23;
  }
  e.timer -= dt;
  if (e.timer <= 0) {
    e.timer = 5;
    const hm = 1 + 0.12 * (w.page - 1);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      spawnClone(w, 'typo', e.x + Math.cos(a) * (e.r + 20), e.y + Math.sin(a) * (e.r + 20), hm, 1, 1);
    }
    fx.ring(w, e.x, e.y, 90, '#7b3fbf', 0.4, 4);
    w.events.sfx('wave');
  }
}

// ------------------------------------------------------------------ update

export function updateEnemies(w: World, dt: number): void {
  frameCounter++;
  const grid = w.grid;
  grid.clear();
  const pool = w.enemies.items;
  const n = pool.length;
  const p = w.player;
  const px = p.x, py = p.y;
  const gSpeed = w.mutators.length > 0 && hasMut(w, 'Italic') ? 1.25 : 1;
  const decay = Math.exp(-8 * dt);
  const recycleR = 0.9 * (w.viewW + w.viewH);
  const recycleR2 = recycleR * recycleR;
  const spawnR = 0.5 * Math.sqrt(w.viewW * w.viewW + w.viewH * w.viewH) + 40;
  const pAlive = p.alive;
  const rng = w.rng;
  let moveAng = p.facing;
  if (p.vx * p.vx + p.vy * p.vy > 4) moveAng = Math.atan2(p.vy, p.vx);

  for (let i = 0; i < n; i++) {
    const e = pool[i];
    if (!e.active) continue;

    // dying run-on segments
    if (e.state === S_DYING && e.kind === 'boss_runon_seg') {
      e.timer -= dt;
      if (e.timer <= 0) {
        fx.burst(w, e.x, e.y, INK, 8, 120, 3);
        fx.splat(w, e.x, e.y, e.r * 1.5, INK_SPLAT);
        w.events.sfx('kill');
        w.enemies.free(e);
      } else {
        e.flash = 0.05;
        grid.insert(e);
      }
      continue;
    }

    e.t += dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.slow > 0) e.slow -= dt;
    if (e.burn > 0) {
      e.burn -= dt;
      if (((e.t * 2) | 0) !== (((e.t - dt) * 2) | 0)) {
        hurt(w, e, 3, false, 0, 0, true);
        if (!e.active) continue;
      }
    }

    let dx = px - e.x, dy = py - e.y;
    let d2 = dx * dx + dy * dy;
    let d = Math.sqrt(d2);
    if (d < 0.001) { d = 0.001; dx = 0.001; }

    // recycle far non-boss enemies
    if (!e.boss && d2 > recycleR2) {
      const a = moveAng + (rng.next() - 0.5) * 1.6;
      e.x = px + Math.cos(a) * spawnR;
      e.y = py + Math.sin(a) * spawnR;
      e.kx = 0; e.ky = 0;
      dx = px - e.x; dy = py - e.y;
      d = Math.sqrt(dx * dx + dy * dy) || 1;
    }

    ai(w, e, dt, dx, dy, d);

    const sm = (e.slow > 0 ? 0.5 : 1) * gSpeed;
    if (e.boss) {
      e.x += e.vx * sm * dt;
      e.y += e.vy * sm * dt;
    } else {
      e.x += (e.vx * sm + e.kx) * dt;
      e.y += (e.vy * sm + e.ky) * dt;
      e.kx *= decay; e.ky *= decay;
    }

    // run-on segment chain follow (after ai so head already moved or lagging 1 frame)
    if (e.kind === 'boss_runon_seg' && e.link) {
      const l = e.link;
      let sx = e.x - l.x, sy = e.y - l.y;
      let sd = Math.sqrt(sx * sx + sy * sy);
      if (sd < 0.001) { sx = 0; sy = 1; sd = 1; }
      e.x = l.x + (sx / sd) * RUNON_SPACING;
      e.y = l.y + (sy / sd) * RUNON_SPACING;
    }

    // contact
    if (pAlive && p.iframes <= 0) {
      const cr = e.r + p.r;
      const cx = px - e.x, cy = py - e.y;
      if (cx * cx + cy * cy < cr * cr && e.dmg > 0) {
        hurtPlayer(w, e.dmg);
      }
    }

    grid.insert(e);
  }

  // separation pass: each enemy every 3rd frame
  const phase = frameCounter % 3;
  for (let i = 0; i < n; i++) {
    const e = pool[i];
    if (!e.active || e.boss) continue;
    if ((e.id + phase) % 3 !== 0) continue;
    const cnt = grid.query(e.x, e.y, e.r, scratch);
    let pushX = 0, pushY = 0;
    for (let j = 0; j < cnt; j++) {
      const o = scratch[j];
      if (o === e || !o.active) continue;
      const ox = e.x - o.x, oy = e.y - o.y;
      const md = (e.r + o.r) * 0.85;
      const od2 = ox * ox + oy * oy;
      if (od2 >= md * md) continue;
      if (od2 < 0.0001) { pushX += (rng.next() - 0.5); pushY += (rng.next() - 0.5); continue; }
      const od = Math.sqrt(od2);
      const f = (md - od) / od * (o.boss ? 1 : 0.5);
      pushX += ox * f; pushY += oy * f;
    }
    e.x += pushX; e.y += pushY;
  }
}

// ------------------------------------------------------------------ enemy bullets

export function updateEnemyBullets(w: World, dt: number): void {
  const pool = w.ebullets.items;
  const n = pool.length;
  const p = w.player;
  const px = p.x, py = p.y;
  const far = w.viewW + w.viewH;
  const far2 = far * far;
  const pAlive = p.alive;
  for (let i = 0; i < n; i++) {
    const b = pool[i];
    if (!b.active) continue;
    b.t += dt;
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.life <= 0) { w.ebullets.free(b); continue; }
    const dx = px - b.x, dy = py - b.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > far2) { w.ebullets.free(b); continue; }
    if (pAlive) {
      const cr = b.r + p.r * 0.8;
      if (d2 < cr * cr) {
        if (p.iframes <= 0) {
          hurtPlayer(w, b.dmg);
          w.ebullets.free(b);
        }
      }
    }
  }
}

export function clearEnemyBulletsInRadius(w: World, x: number, y: number, r: number): number {
  const pool = w.ebullets.items;
  const n = pool.length;
  const r2 = r * r;
  let count = 0, fxCount = 0;
  for (let i = 0; i < n; i++) {
    const b = pool[i];
    if (!b.active) continue;
    const dx = b.x - x, dy = b.y - y;
    if (dx * dx + dy * dy <= r2) {
      if (fxCount < 8) { fx.burst(w, b.x, b.y, INK, 3, 60, 2); fxCount++; }
      w.ebullets.free(b);
      count++;
    }
  }
  return count;
}
