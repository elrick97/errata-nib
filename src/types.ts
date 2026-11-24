// ============================================================================
// ERRATA — shared contracts. OWNED BY ORCHESTRATOR. Sub-agents: do not edit.
// If you need a field that's missing, use the scratch fields (a, b, c) or keep
// state module-local in your own file, and report the need in your summary.
// ============================================================================
import type { Rng } from './core/rng';
import type { Pool } from './core/pool';
import type { SpatialHash } from './core/spatial';

/** Fixed logical width of the play view in world units. Height derives from aspect. */
export const VIEW_W = 420;

export const PALETTE = {
  paper: '#f3ead6',
  paperDark: '#e6d9bd',
  rule: 'rgba(70,110,170,0.22)',
  margin: 'rgba(200,40,50,0.45)',
  ink: '#1b1a22',
  inkSoft: '#3a3846',
  red: '#d7263d',       // player + player attacks
  redDark: '#8f1424',
  highlight: '#ffe14d', // xp letters / pickups
  highlightPink: '#ff7ab8',
  gold: '#e8a91c',      // legendary
  blue: '#2f6fd0',      // evolution / rare
  purple: '#7b3fbf',    // boss purple prose / epic
  green: '#3aa86b',     // heal
  white: '#fffaf0',
} as const;

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export type SfxName =
  | 'shoot' | 'hit' | 'crit' | 'kill' | 'pickup' | 'levelup' | 'pick' | 'hurt'
  | 'boss' | 'bossDie' | 'explode' | 'zap' | 'evolve' | 'legendary' | 'death'
  | 'click' | 'wave' | 'heal' | 'chest' | 'swoosh' | 'dash' | 'enemyShoot';

// ---------------------------------------------------------------- entities

export type EnemyKind =
  | 'typo' | 'smudge' | 'smudgelet' | 'blot' | 'dangler' | 'widow' | 'redaction'
  | 'boss_runon' | 'boss_runon_seg' | 'boss_redactor' | 'boss_purple';

export interface Enemy {
  active: boolean;
  id: number;          // unique per spawn (monotonic), used for pierce hit-sets
  kind: EnemyKind;
  x: number; y: number;
  vx: number; vy: number;   // AI-desired velocity
  kx: number; ky: number;   // knockback velocity (decays)
  r: number;                // collision radius
  hp: number; maxHp: number;
  speed: number; dmg: number; xp: number;
  elite: boolean; boss: boolean;
  t: number;          // age seconds
  state: number; timer: number; // AI state machine
  flash: number;      // white hit-flash seconds remaining
  slow: number;       // seconds slowed (50%)
  burn: number;       // seconds of burn remaining (highlighter)
  a: number; b: number; c: number; // scratch
  link: Enemy | null; // e.g. run-on segment chain (next segment toward head)
  glyph: string;      // word/glyph drawn for text enemies ("teh", "?" ...)
}

export type BulletKind = 'dart' | 'shard' | 'comma' | 'semicolon' | 'caps';

export interface Bullet {
  active: boolean;
  kind: BulletKind;
  x: number; y: number; vx: number; vy: number;
  r: number; dmg: number;
  pierce: number;       // remaining enemies it may hit (0 => dies on next hit)
  life: number;         // seconds remaining
  hits: number[];       // preallocated length 8: enemy ids already hit (ring)
  nHits: number;
  knock: number;        // knockback impulse
  crit: number;         // crit chance 0..1
  t: number;            // age
  a: number; b: number; // scratch (e.g. boomerang return state)
  split: number;        // >0: spawn N shards on hit (fountain)
}

export type EnemyBulletKind = 'drop' | 'petal' | 'block' | 'shard';
export interface EnemyBullet {
  active: boolean; kind: EnemyBulletKind;
  x: number; y: number; vx: number; vy: number;
  r: number; dmg: number; life: number; t: number; a: number;
}

export type PickupKind = 'xp' | 'heal' | 'magnet' | 'chest' | 'ink';
export interface Pickup {
  active: boolean; kind: PickupKind;
  x: number; y: number; vx: number; vy: number;
  value: number;
  magnet: boolean; // being pulled to player
  t: number;
  glyph: string;   // letter drawn for xp
}

export interface Player {
  x: number; y: number; vx: number; vy: number; r: number;
  hp: number; maxHp: number;
  iframes: number;     // invulnerable seconds
  level: number; xp: number; xpNext: number;
  alive: boolean;
  facing: number;      // radians, last move/aim direction
  moving: boolean;
  revives: number;     // Ctrl+Z charges
  regenAcc: number;
  hurtFlash: number;
  trail: number;       // scratch for render
}

/** Fully derived each time an upgrade is taken (recomputeStats). */
export interface Stats {
  damage: number;      // multiplier (1 = base)
  fireRate: number;    // multiplier on attack speed (higher = faster)
  cooldown: number;    // multiplier on weapon cooldowns (lower = faster)
  area: number;        // multiplier on radii / sizes
  projSpeed: number;   // multiplier
  duration: number;    // multiplier
  amount: number;      // extra projectiles (Ibid.)
  moveSpeed: number;   // world units / s
  maxHp: number;
  regen: number;       // hp / s
  pickupRange: number; // world units
  crit: number;        // chance 0..1
  critMult: number;
  armor: number;       // flat dmg reduction
  dmgTaken: number;    // multiplier
  xpMult: number;
  knock: number;       // multiplier
  size: number;        // visual/hitbox scale for player projectiles (ALL CAPS)
}

export type WeaponId =
  | 'dart' | 'comma' | 'paren' | 'asterisk' | 'strike' | 'bang' | 'highlighter' | 'eraser';

export interface WeaponInst {
  id: WeaponId;
  level: number;      // 1..5
  evolved: boolean;
  timer: number;      // cooldown timer
  a: number; b: number; c: number; // scratch (orbit angle, counters...)
}

export interface Camera {
  x: number; y: number;     // world position of view center
  shake: number;            // current shake magnitude (decays)
  ox: number; oy: number;   // shake offset this frame
}

export interface InputState {
  mx: number; my: number;   // movement vector, length 0..1
  active: boolean;          // pointer/touch currently held
  joyX: number; joyY: number;   // joystick base in CSS px (relative to canvas)
  knobX: number; knobY: number; // knob position in CSS px
  usingKeys: boolean;
}

export interface Settings { sound: boolean; music: boolean; haptics: boolean; shake: boolean; }

export interface MetaSave {
  version: 1;
  ink: number;
  bestPage: number; bestScore: number; bestTime: number;
  runs: number; totalKills: number;
  shop: Record<string, number>;   // shop item id -> level
  settings: Settings;
  seenTutorial: boolean;
}

export interface GameEvents {
  pageStart(page: number, label: string): void;     // label e.g. "Page 6", "Appendix A-3"
  bossSpawn(name: string, sub: string): void;
  bossDefeated(name: string): void;
  playerHurt(dmg: number): void;
  playerDeath(): void;          // called once when hp<=0 and no revive
  levelUp(): void;              // called when xp crosses threshold (pendingLevelUps already ++)
  toast(text: string, color?: string): void;
  sfx(name: SfxName, intensity?: number): void;
  haptic(ms: number): void;
}

export interface World {
  rng: Rng; seed: number;
  time: number;            // seconds of sim time this run
  page: number;            // current wave/page (1-based)
  pageTime: number;        // seconds into current page
  pageDuration: number;
  player: Player;
  stats: Stats;
  weapons: WeaponInst[];
  passives: Partial<Record<string, number>>;   // passive id -> level
  legendaries: string[];
  rerolls: number;
  enemies: Pool<Enemy>;
  bullets: Pool<Bullet>;
  ebullets: Pool<EnemyBullet>;
  pickups: Pool<Pickup>;
  grid: SpatialHash<Enemy>;
  cam: Camera;
  viewW: number; viewH: number;   // visible world size
  hitstop: number;          // seconds of frozen sim remaining
  timeScale: number;        // slow-mo multiplier (1 = normal), eased back by game loop
  flashColor: string; flashA: number; // full-screen flash
  kills: number; score: number; bossesKilled: number;
  pendingLevelUps: number;
  boss: Enemy | null; bossName: string;
  mutators: string[];
  input: InputState;
  meta: MetaSave;
  events: GameEvents;
  nextEnemyId: number;
}
