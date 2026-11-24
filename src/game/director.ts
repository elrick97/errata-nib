// OWNER: enemy agent. Contract — keep signatures.
import type { World, EnemyKind } from '../types';
import { spawnEnemy, spawnEBullet } from './enemies';
import type { SpawnOpts } from './enemies';

const TAU = Math.PI * 2;
const MAX_ENEMY_SOFT = 450;

interface PageDef {
  rate: number;                       // enemies per second
  w: [number, number, number, number, number]; // typo, smudge, blot, dangler, widow
  elite: number;                      // chance a spawn is flagged elite
  red: number;                        // redactions spawned during the page
}

const PAGES: PageDef[] = [
  /* 1  */ { rate: 1.2, w: [1, 0, 0, 0, 0], elite: 0, red: 0 },
  /* 2  */ { rate: 1.5, w: [3, 1, 0, 0, 0], elite: 0, red: 0 },
  /* 3  */ { rate: 1.8, w: [4, 1.5, 1, 0, 0], elite: 0, red: 0 },
  /* 4  */ { rate: 2.2, w: [4, 1.5, 1.2, 1, 0], elite: 0, red: 0 },
  /* 5  */ { rate: 2.4, w: [4, 1.5, 1.2, 1, 0], elite: 0, red: 0 },
  /* 6  */ { rate: 2.8, w: [4, 1.5, 1.2, 1.2, 0.8], elite: 0, red: 0 },
  /* 7  */ { rate: 3.2, w: [4, 1.5, 1.3, 1.2, 1], elite: 0.01, red: 1 },
  /* 8  */ { rate: 3.6, w: [4, 1.8, 1.4, 1.3, 1], elite: 0.015, red: 0 },
  /* 9  */ { rate: 4.2, w: [4, 2, 1.5, 1.4, 1.2], elite: 0.02, red: 1 },
  /* 10 */ { rate: 4.5, w: [4, 2, 1.5, 1.4, 1.2], elite: 0.02, red: 0 },
  /* 11 */ { rate: 5.0, w: [4, 2.2, 1.6, 1.5, 1.3], elite: 0.025, red: 2 },
  /* 12 */ { rate: 5.5, w: [4, 2.4, 1.7, 1.6, 1.4], elite: 0.025, red: 0 },
  /* 13 */ { rate: 6.0, w: [4, 2.5, 1.8, 1.7, 1.5], elite: 0.03, red: 2 },
  /* 14 */ { rate: 7.0, w: [4, 2.6, 2, 1.8, 1.6], elite: 0.03, red: 2 },
  /* 15 */ { rate: 5.0, w: [4, 2.6, 2, 1.8, 1.6], elite: 0.03, red: 0 },
];
const ENDLESS_W: [number, number, number, number, number] = [4, 2.6, 2, 1.8, 1.6];
const KINDS: EnemyKind[] = ['typo', 'smudge', 'blot', 'dangler', 'widow'];

const BOSS_KINDS: EnemyKind[] = ['boss_runon', 'boss_redactor', 'boss_purple'];
const BOSS_NAMES = ['The Run-On Sentence', 'The Redactor', 'Purple Prose'];
const BOSS_SUBS = ['it just keeps going and going and', '[CLASSIFIED]', 'verbose, florid, utterly overwrought'];

const MUTATORS = ['Bold', 'Italic', 'Footnoted', 'Smeared', 'Double-Spaced'];
const MUTATOR_DESC: Record<string, string> = {
  'Bold': 'enemies +40% HP',
  'Italic': 'enemies +25% speed',
  'Footnoted': 'dying enemies spit ink at you',
  'Smeared': 'ink rains from the top of the page',
  'Double-Spaced': 'enemies arrive in pairs',
};

const CHAPTERS = ['I', 'II', 'III'];

// director state (module-local; reset in resetDirector)
let acc = 0;
let formTimer = 20;
let redDone = 0;
let pressure = 1;
let bossSpawned = false;
let postBoss = -1;
let smearTimer = 2;
let sx = 0, sy = 0;
const opts: SpawnOpts = {};

export function pageLabel(page: number): string {
  if (page <= 15) {
    return 'Ch. ' + CHAPTERS[Math.min(2, Math.floor((page - 1) / 5))] + ' · Page ' + page;
  }
  return 'Appendix A-' + (page - 15);
}

export function resetDirector(w: World): void {
  w.page = 1;
  w.pageTime = 0;
  w.pageDuration = 30;
  w.mutators.length = 0;
  acc = 0; formTimer = 20; redDone = 0; pressure = 1;
  bossSpawned = false; postBoss = -1; smearTimer = 2;
  w.events.pageStart(1, pageLabel(1));
}

export const DIRECTOR_DEBUG = {
  /** Jump to a page: next updateDirector advances into it. */
  skipTo(w: World, page: number): void {
    const pool = w.enemies.items;
    if (w.boss) {
      for (let i = 0; i < pool.length; i++) {
        const e = pool[i];
        if (e.active && (e.boss)) w.enemies.free(e);
      }
      w.boss = null;
    }
    w.page = Math.max(1, page - 1);
    w.pageTime = w.pageDuration;
  },
};

// ------------------------------------------------------------------ scaling

function isBossPage(p: number): boolean { return p % 5 === 0; }

function hpMultFor(w: World): number {
  const p = w.page;
  let m = p <= 15 ? 1 + 0.12 * (p - 1) : 1 + 0.18 * p + 0.012 * p * p;
  if (w.mutators.length > 0 && w.mutators.indexOf('Bold') >= 0) m *= 1.4;
  return m;
}
function dmgMultFor(p: number): number {
  return p <= 15 ? 1 + 0.02 * (p - 1) : 1 + 0.06 * p;
}
function rateFor(p: number): number {
  if (p <= 15) return PAGES[p - 1].rate;
  return PAGES[13].rate * (1 + 0.09 * (p - 15));
}

function addMutator(w: World): void {
  if (w.mutators.length >= MUTATORS.length) w.mutators.shift();
  const free: string[] = [];
  for (let i = 0; i < MUTATORS.length; i++) if (w.mutators.indexOf(MUTATORS[i]) < 0) free.push(MUTATORS[i]);
  const m = free[Math.floor(w.rng.next() * free.length)];
  w.mutators.push(m);
  w.events.toast('Mutator: ' + m + ' — ' + MUTATOR_DESC[m], '#7b3fbf');
}

function advancePage(w: World): void {
  w.page++;
  w.pageTime = 0;
  redDone = 0;
  bossSpawned = false;
  postBoss = -1;
  if (w.page > 15) addMutator(w);
  w.events.pageStart(w.page, pageLabel(w.page));
}

// ------------------------------------------------------------------ spawning

function ringPos(w: World, extra: number): void {
  const p = w.player;
  const R = 0.5 * Math.sqrt(w.viewW * w.viewW + w.viewH * w.viewH) + extra;
  let a = w.rng.angle();
  if (w.rng.next() < 0.6 && p.vx * p.vx + p.vy * p.vy > 4) {
    a = Math.atan2(p.vy, p.vx) + (w.rng.next() - 0.5) * 1.8;
  }
  sx = w.cam.x + Math.cos(a) * R;
  sy = w.cam.y + Math.sin(a) * R;
}

function pickKind(w: World, weights: [number, number, number, number, number]): EnemyKind {
  let total = 0;
  for (let i = 0; i < 5; i++) total += weights[i];
  let r = w.rng.next() * total;
  for (let i = 0; i < 5; i++) {
    r -= weights[i];
    if (r < 0) return KINDS[i];
  }
  return 'typo';
}

function spawnOne(w: World, kind: EnemyKind, x: number, y: number, eliteChance: number, forceElite: boolean): void {
  opts.hpMult = hpMultFor(w) * pressure;
  opts.dmgMult = dmgMultFor(w.page);
  opts.speedMult = 1;
  opts.elite = forceElite || (eliteChance > 0 && w.rng.next() < eliteChance);
  spawnEnemy(w, kind, x, y, opts);
}

function spawnBoss(w: World): void {
  if (w.enemies.capacity - w.enemies.count < 24) return;
  const idx = w.page / 5 - 1;
  const bi = idx % 3;
  const cycle = Math.floor(idx / 3);
  let hm = Math.pow(1.5, cycle);
  if (w.page > 15) hm *= 1 + 0.18 * w.page + 0.012 * w.page * w.page;
  const p = w.player;
  opts.hpMult = hm;
  opts.dmgMult = dmgMultFor(w.page);
  opts.speedMult = 1;
  opts.elite = false;
  const off = Math.max(260, w.viewH * 0.5 + 60);
  const e = spawnEnemy(w, BOSS_KINDS[bi], p.x, p.y - off, opts);
  if (!e) return;
  bossSpawned = true;
  w.events.bossSpawn(BOSS_NAMES[bi], BOSS_SUBS[bi]);
}

function formation(w: World, which: number): void {
  const p = w.player;
  const page = w.page;
  const hm = hpMultFor(w) * pressure;
  opts.hpMult = hm; opts.dmgMult = dmgMultFor(page); opts.speedMult = 1; opts.elite = false;
  if (which === 0) {
    // encircle
    const R = 0.55 * w.viewH;
    const off = w.rng.angle();
    for (let i = 0; i < 24; i++) {
      const a = off + (i / 24) * TAU;
      spawnEnemy(w, 'typo', p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, opts);
    }
  } else if (which === 1) {
    // stampede: line sweeping across
    const side = w.rng.int(0, 3);
    const hw = w.viewW * 0.5 + 40, hh = w.viewH * 0.5 + 40;
    const kind: EnemyKind = page >= 4 ? 'dangler' : 'typo';
    for (let i = 0; i < 10; i++) {
      const t = (i - 4.5) * 36;
      let x: number, y: number;
      if (side === 0) { x = w.cam.x - hw; y = w.cam.y + t * 1.6; }
      else if (side === 1) { x = w.cam.x + hw; y = w.cam.y + t * 1.6; }
      else if (side === 2) { x = w.cam.x + t; y = w.cam.y - hh; }
      else { x = w.cam.x + t; y = w.cam.y + hh; }
      const e = spawnEnemy(w, kind, x, y, opts);
      if (e && kind === 'dangler') {
        const dx = p.x - x, dy = p.y - y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        e.state = 1; e.timer = 0.4 + i * 0.02; e.a = dx / d; e.b = dy / d;
      }
    }
  } else {
    // swarm: cluster from one side
    ringPos(w, 60);
    const cx = sx, cy = sy;
    for (let i = 0; i < 15; i++) {
      const a = w.rng.angle(), d = Math.sqrt(w.rng.next()) * 55;
      spawnEnemy(w, 'typo', cx + Math.cos(a) * d, cy + Math.sin(a) * d, opts);
    }
  }
}

// ------------------------------------------------------------------ update

export function updateDirector(w: World, dt: number): void {
  if (!w.player.alive) return;
  if (w.pageTime >= w.pageDuration) advancePage(w);

  const page = w.page;
  const bossPage = isBossPage(page);
  const boss = w.boss;

  // page / boss progression
  if (bossPage) {
    if (!bossSpawned) {
      spawnBoss(w);
    } else if (!boss) {
      if (postBoss < 0) postBoss = 3;
      postBoss -= dt;
      if (postBoss <= 0) { advancePage(w); return; }
    }
  } else {
    w.pageTime += dt;
  }

  // spawn scheduling
  const count = w.enemies.count;
  let rate = rateFor(page);
  if (bossPage) rate *= boss ? 0.35 : (bossSpawned ? 0.2 : 0);
  acc += rate * dt;
  if (acc > 4) acc = 4;
  const def = page <= 15 ? PAGES[page - 1] : null;
  const weights = def ? def.w : ENDLESS_W;
  const eliteChance = def ? def.elite : 0.03;
  const dbl = w.mutators.length > 0 && w.mutators.indexOf('Double-Spaced') >= 0;
  while (acc >= 1) {
    acc -= 1;
    if (w.enemies.count >= MAX_ENEMY_SOFT) {
      pressure = Math.min(3, pressure + 0.1);
      continue;
    }
    const kind = pickKind(w, weights);
    ringPos(w, 30);
    spawnOne(w, kind, sx, sy, eliteChance, false);
    if (dbl) spawnOne(w, kind, sx + 14, sy + 14, eliteChance, false);
    if (pressure > 1) pressure = Math.max(1, pressure - 0.02);
  }
  void count;

  // redactions (authored: table; endless: every 3rd page)
  let reds = def ? def.red : ((page - 15) % 3 === 0 ? 2 : 0);
  if (!bossPage && reds > 0 && redDone < reds && w.pageTime >= ((redDone + 1) / (reds + 1)) * w.pageDuration) {
    redDone++;
    if (w.enemies.count < MAX_ENEMY_SOFT) {
      ringPos(w, 40);
      spawnOne(w, 'redaction', sx, sy, 0, false);
    }
  }
  reds = 0;

  // formations
  if (page >= 3 && !w.boss) {
    formTimer -= dt;
    if (formTimer <= 0) {
      formTimer = 18 + w.rng.next() * 6;
      if (w.enemies.count < MAX_ENEMY_SOFT - 40) {
        const which = page < 5 ? w.rng.int(1, 2) : w.rng.int(0, 2);
        formation(w, which);
        w.events.sfx('wave');
      }
    }
  }

  // Smeared: ink rain
  if (w.mutators.length > 0 && w.mutators.indexOf('Smeared') >= 0) {
    smearTimer -= dt;
    if (smearTimer <= 0) {
      smearTimer = 2;
      const top = w.cam.y - w.viewH * 0.5 - 20;
      const dmg = 8 * dmgMultFor(page);
      for (let i = 0; i < 3; i++) {
        const x = w.cam.x + (w.rng.next() - 0.5) * w.viewW;
        spawnEBullet(w, 'drop', x, top, 0, 150, 7, dmg, 7);
      }
    }
  }
}
