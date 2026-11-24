// OWNER: orchestrator.
import type { World, Enemy, Bullet, EnemyBullet, Pickup, MetaSave, GameEvents, Stats, Player } from '../types';
import { Rng } from '../core/rng';
import { Pool } from '../core/pool';
import { SpatialHash } from '../core/spatial';
import { input } from '../core/input';

export const MAX_ENEMIES = 600;
export const MAX_BULLETS = 700;
export const MAX_EBULLETS = 400;
export const MAX_PICKUPS = 500;

const newEnemy = (): Enemy => ({
  active: false, id: 0, kind: 'typo', x: 0, y: 0, vx: 0, vy: 0, kx: 0, ky: 0, r: 10,
  hp: 1, maxHp: 1, speed: 0, dmg: 0, xp: 0, elite: false, boss: false, t: 0, state: 0, timer: 0,
  flash: 0, slow: 0, burn: 0, a: 0, b: 0, c: 0, link: null, glyph: '',
});
const newBullet = (): Bullet => ({
  active: false, kind: 'dart', x: 0, y: 0, vx: 0, vy: 0, r: 4, dmg: 0, pierce: 0, life: 0,
  hits: [0, 0, 0, 0, 0, 0, 0, 0], nHits: 0, knock: 0, crit: 0, t: 0, a: 0, b: 0, split: 0,
});
const newEBullet = (): EnemyBullet => ({ active: false, kind: 'drop', x: 0, y: 0, vx: 0, vy: 0, r: 5, dmg: 0, life: 0, t: 0, a: 0 });
const newPickup = (): Pickup => ({ active: false, kind: 'xp', x: 0, y: 0, vx: 0, vy: 0, value: 1, magnet: false, t: 0, glyph: 'a' });

export function baseStats(): Stats {
  return {
    damage: 1, fireRate: 1, cooldown: 1, area: 1, projSpeed: 1, duration: 1, amount: 0,
    moveSpeed: 150, maxHp: 100, regen: 0, pickupRange: 60, crit: 0.05, critMult: 2,
    armor: 0, dmgTaken: 1, xpMult: 1, knock: 1, size: 1,
  };
}

export function newPlayer(): Player {
  return {
    x: 0, y: 0, vx: 0, vy: 0, r: 12, hp: 100, maxHp: 100, iframes: 0, level: 1, xp: 0, xpNext: 10,
    alive: true, facing: -Math.PI / 2, moving: false, revives: 0, regenAcc: 0, hurtFlash: 0, trail: 0,
  };
}

export function createWorld(meta: MetaSave, events: GameEvents, seed: number): World {
  return {
    rng: new Rng(seed), seed,
    time: 0, page: 1, pageTime: 0, pageDuration: 30,
    player: newPlayer(),
    stats: baseStats(),
    weapons: [], passives: {}, legendaries: [], rerolls: 1,
    enemies: new Pool(MAX_ENEMIES, newEnemy),
    bullets: new Pool(MAX_BULLETS, newBullet),
    ebullets: new Pool(MAX_EBULLETS, newEBullet),
    pickups: new Pool(MAX_PICKUPS, newPickup),
    grid: new SpatialHash<Enemy>(64),
    cam: { x: 0, y: 0, shake: 0, ox: 0, oy: 0 },
    viewW: 420, viewH: 800,
    hitstop: 0, timeScale: 1, flashColor: '#fff', flashA: 0,
    kills: 0, score: 0, bossesKilled: 0, pendingLevelUps: 0,
    boss: null, bossName: '', mutators: [],
    input, meta, events, nextEnemyId: 1,
  };
}
