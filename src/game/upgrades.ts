// OWNER: combat agent. Contract — keep signatures.
import type { World, Rarity, WeaponInst, WeaponId, Enemy } from '../types';
import { PALETTE } from '../types';
import { baseStats } from './world';
import { WT } from './weapons';
import { healPlayer } from './player';
import { damageEnemy } from './enemies';
import * as fx from './fx';

export interface UpgradeChoice {
  id: string; name: string; desc: string; icon: string; rarity: Rarity;
  kind: 'weapon' | 'passive' | 'legendary' | 'evolution' | 'heal';
  level: number; isNew: boolean;
}

export interface UpgradeDef {
  id: string; name: string;
  kind: UpgradeChoice['kind'];
  rarity: Rarity;
  icon: string;
  maxLevel: number;
  desc(level: number): string;
  /** evolutions only: required weapon + passive */
  weapon?: WeaponId;
  passive?: string;
}

const f1 = (n: number): string => (Math.round(n * 10) / 10).toString();
const pct = (n: number): string => Math.round(n * 100) + '%';

function dartDesc(l: number): string {
  const i = l - 1, T = WT.dart;
  if (l === 1) return `Fires ink darts at the nearest enemy. ${T.dmg[0]} dmg every ${T.cd[0]}s.`;
  const parts: string[] = [];
  if (T.n[i] > T.n[i - 1]) parts.push(`+${T.n[i] - T.n[i - 1]} dart`);
  if (T.pierce[i] > T.pierce[i - 1]) parts.push(`pierce ${T.pierce[i]}`);
  parts.push(`${T.dmg[i]} dmg`, `${T.cd[i]}s`);
  return parts.join(', ') + ` (${T.n[i]} darts)`;
}
function commaDesc(l: number): string {
  const i = l - 1, T = WT.comma;
  if (l === 1) return `Throws a boomerang comma that pierces everything. ${T.dmg[0]} dmg.`;
  const parts: string[] = [];
  if (T.n[i] > T.n[i - 1]) parts.push(`+${T.n[i] - T.n[i - 1]} comma`);
  parts.push(`${T.dmg[i]} dmg`, `${T.cd[i]}s`);
  return parts.join(', ') + ` (${T.n[i]} commas)`;
}
function parenDesc(l: number): string {
  const i = l - 1, T = WT.paren;
  if (l === 1) return `${T.n[0]} guard glyphs orbit you, ${T.dmg[0]} dmg per hit, knock enemies back.`;
  const parts: string[] = [];
  if (T.n[i] > T.n[i - 1]) parts.push(`+${T.n[i] - T.n[i - 1]} blade`);
  parts.push(`${T.dmg[i]} dmg`, `orbit ${T.r[i]}`);
  return parts.join(', ') + ` (${T.n[i]} blades)`;
}
function asterDesc(l: number): string {
  const i = l - 1, T = WT.asterisk;
  if (l === 1) return `Drops a mine every ${T.cd[0]}s. Blast ${T.dmg[0]} dmg, radius ${T.r[0]}.`;
  const parts: string[] = [];
  if (T.n[i] > T.n[i - 1]) parts.push(`+${T.n[i] - T.n[i - 1]} mine per drop`);
  parts.push(`${T.dmg[i]} dmg`, `radius ${T.r[i]}`, `every ${T.cd[i]}s`);
  return parts.join(', ');
}
function strikeDesc(l: number): string {
  const i = l - 1, T = WT.strike;
  if (l === 1) return `Slashes a red line across the whole page. ${T.dmg[0]} dmg every ${T.cd[0]}s.`;
  const parts: string[] = [];
  if (T.n[i] > T.n[i - 1]) parts.push(`+${T.n[i] - T.n[i - 1]} line`);
  if (l === 3) parts.push('diagonal slashes');
  parts.push(`${T.dmg[i]} dmg`, `every ${T.cd[i]}s`);
  return parts.join(', ') + ` (${T.n[i]} lines)`;
}
function bangDesc(l: number): string {
  const i = l - 1, T = WT.bang;
  if (l === 1) return `Lightning strikes a random enemy, chains once. ${T.dmg[0]} dmg.`;
  const parts: string[] = [];
  if (T.n[i] > T.n[i - 1]) parts.push(`+${T.n[i] - T.n[i - 1]} strike`);
  if (T.chain[i] > T.chain[i - 1]) parts.push(`chain ${T.chain[i]}`);
  parts.push(`${T.dmg[i]} dmg`);
  return parts.join(', ') + ` (${T.n[i]} strikes)`;
}
function hlDesc(l: number): string {
  const i = l - 1, T = WT.highlighter;
  if (l === 1) return `A burning yellow aura around you. ${T.dmg[0]} dmg per tick, slows and burns.`;
  return `radius ${T.r[i]}, ${T.dmg[i]} dmg, tick ${T.tick[i]}s`;
}
function eraserDesc(l: number): string {
  const i = l - 1, T = WT.eraser;
  if (l === 1) return `Pink shockwave that smashes enemies back and erases enemy bullets. ${T.dmg[0]} dmg.`;
  return `radius ${T.r[i]}, ${T.dmg[i]} dmg, every ${f1(T.cd[i])}s`;
}

const DEFS_LIST: UpgradeDef[] = [
  // ---- weapons
  { id: 'dart', name: 'Red Ink Dart', kind: 'weapon', rarity: 'common', icon: '✒', maxLevel: 5, desc: dartDesc },
  { id: 'comma', name: 'Comma', kind: 'weapon', rarity: 'common', icon: ',', maxLevel: 5, desc: commaDesc },
  { id: 'paren', name: 'Parentheses', kind: 'weapon', rarity: 'common', icon: '( )', maxLevel: 5, desc: parenDesc },
  { id: 'asterisk', name: 'Asterisk', kind: 'weapon', rarity: 'common', icon: '*', maxLevel: 5, desc: asterDesc },
  { id: 'strike', name: 'Strikethrough', kind: 'weapon', rarity: 'common', icon: 'S̶', maxLevel: 5, desc: strikeDesc },
  { id: 'bang', name: 'Exclamation!', kind: 'weapon', rarity: 'common', icon: '!', maxLevel: 5, desc: bangDesc },
  { id: 'highlighter', name: 'Highlighter', kind: 'weapon', rarity: 'common', icon: '▮', maxLevel: 5, desc: hlDesc },
  { id: 'eraser', name: 'Eraser', kind: 'weapon', rarity: 'common', icon: '⌫', maxLevel: 5, desc: eraserDesc },
  // ---- passives
  { id: 'thick', name: 'Thick Nib', kind: 'passive', rarity: 'common', icon: 'B', maxLevel: 5,
    desc: (l) => `+12% damage (total +${12 * l}%)` },
  { id: 'caffeine', name: 'Caffeine', kind: 'passive', rarity: 'common', icon: '♨', maxLevel: 5,
    desc: (l) => `+10% fire rate, -6% cooldowns (total +${10 * l}% / -${6 * l}%)` },
  { id: 'margins', name: 'Wide Margins', kind: 'passive', rarity: 'common', icon: '⇔', maxLevel: 5,
    desc: (l) => `+12% area (total +${12 * l}%)` },
  { id: 'italics', name: 'Italics', kind: 'passive', rarity: 'common', icon: 'I', maxLevel: 5,
    desc: (l) => `+12% projectile speed, +10% duration (total +${12 * l}% / +${10 * l}%)` },
  { id: 'speed', name: 'Speed Reading', kind: 'passive', rarity: 'common', icon: '»', maxLevel: 5,
    desc: (l) => `+10% move speed (total +${10 * l}%)` },
  { id: 'bookmark', name: 'Bookmark', kind: 'passive', rarity: 'common', icon: '❦', maxLevel: 5,
    desc: (l) => `+20 max HP, +0.4 regen/s (total +${20 * l} HP, ${f1(0.4 * l)}/s)` },
  { id: 'magnifier', name: 'Magnifying Glass', kind: 'passive', rarity: 'common', icon: '⌕', maxLevel: 5,
    desc: (l) => `+30% pickup range (total +${30 * l}%)` },
  { id: 'serif', name: 'Serif', kind: 'passive', rarity: 'common', icon: 'ſ', maxLevel: 5,
    desc: (l) => `+6% crit chance, +0.2 crit damage (total +${6 * l}% / +${f1(0.2 * l)})` },
  { id: 'ibid', name: 'Ibid.', kind: 'passive', rarity: 'common', icon: '+1', maxLevel: 5,
    desc: (l) => (l % 2 === 1 ? '+1 projectile on all weapons' : 'Sharpens the citation (no change)') + ` (total +${(l + 1) >> 1})` },
  // ---- legendaries
  { id: 'caps', name: 'ALL CAPS', kind: 'legendary', rarity: 'legendary', icon: 'AA', maxLevel: 1,
    desc: () => 'Damage x2, projectiles and areas x1.4. You take +50% damage.' },
  { id: 'ctrlz', name: 'Ctrl+Z', kind: 'legendary', rarity: 'legendary', icon: '↶', maxLevel: 1,
    desc: () => 'Revive once at full HP with a screen-clearing blast.' },
  { id: 'findreplace', name: 'Find & Replace', kind: 'legendary', rarity: 'legendary', icon: '⇄', maxLevel: 1,
    desc: () => '12% of kills convert every enemy within 80 into letters.' },
  // ---- evolutions
  { id: 'evo_dart', name: 'Fountain Burst', kind: 'evolution', rarity: 'epic', icon: '✺', maxLevel: 1, weapon: 'dart', passive: 'thick',
    desc: () => 'Darts burst into 6 shards on every hit. +20% damage, +1 pierce.' },
  { id: 'evo_comma', name: 'Semicolon Storm', kind: 'evolution', rarity: 'epic', icon: ';', maxLevel: 1, weapon: 'comma', passive: 'italics',
    desc: () => '+2 blades, faster, +25% damage, and they leave burning ink trails.' },
  { id: 'evo_paren', name: '[Square Brackets]', kind: 'evolution', rarity: 'epic', icon: '[ ]', maxLevel: 1, weapon: 'paren', passive: 'bookmark',
    desc: () => '6 blades, +40% orbit, +40% damage. Deletes enemy bullets, heals 1 HP per 25 hits.' },
  { id: 'evo_asterisk', name: 'Footnote Barrage', kind: 'evolution', rarity: 'epic', icon: '✱', maxLevel: 1, weapon: 'asterisk', passive: 'margins',
    desc: () => 'Mines split into a cluster of 4 more blasts. +20% damage.' },
  { id: 'evo_bang', name: 'Interrobang‽', kind: 'evolution', rarity: 'epic', icon: '‽', maxLevel: 1, weapon: 'bang', passive: 'serif',
    desc: () => 'Every strike is a critical hit and chains 4 more times. +25% damage.' },
  { id: 'evo_highlighter', name: 'Neon Highlighter', kind: 'evolution', rarity: 'epic', icon: '◉', maxLevel: 1, weapon: 'highlighter', passive: 'magnifier',
    desc: () => 'Double radius, +50% damage. Pulls enemies and letters inward.' },
  // ---- filler
  { id: 'heal', name: 'Fresh Coffee', kind: 'heal', rarity: 'common', icon: '♥', maxLevel: 1,
    desc: () => 'Restore 30% of your max HP.' },
];

export const UPGRADE_DEFS: Record<string, UpgradeDef> = {};
for (let i = 0; i < DEFS_LIST.length; i++) UPGRADE_DEFS[DEFS_LIST[i].id] = DEFS_LIST[i];
export const UPGRADE_LIST: readonly UpgradeDef[] = DEFS_LIST;

function findWeapon(w: World, id: string): WeaponInst | null {
  for (let i = 0; i < w.weapons.length; i++) if (w.weapons[i].id === id) return w.weapons[i];
  return null;
}

function has(w: World, leg: string): boolean { return w.legendaries.indexOf(leg) >= 0; }

// ------------------------------------------------------------------ rolling

interface Cand { def: UpgradeDef; level: number; isNew: boolean; weight: number; rarity: Rarity; }

function mk(c: Cand): UpgradeChoice {
  return {
    id: c.def.id, name: c.def.name, desc: c.def.desc(c.level), icon: c.def.icon,
    rarity: c.rarity, kind: c.def.kind, level: c.level, isNew: c.isNew,
  };
}

function weightedPick(w: World, cands: Cand[]): number {
  let total = 0;
  for (let i = 0; i < cands.length; i++) total += cands[i].weight;
  let r = w.rng.next() * total;
  for (let i = 0; i < cands.length; i++) {
    r -= cands[i].weight;
    if (r <= 0) return i;
  }
  return cands.length - 1;
}

export function rollChoices(w: World, n: number): UpgradeChoice[] {
  const cands: Cand[] = [];
  const evos: Cand[] = [];
  const legs: Cand[] = [];
  const weaponCount = w.weapons.length;
  let passiveCount = 0;
  for (const k in w.passives) if ((w.passives[k] ?? 0) > 0) passiveCount++;

  // weapons
  for (let i = 0; i < DEFS_LIST.length; i++) {
    const d = DEFS_LIST[i];
    if (d.kind === 'weapon') {
      const wp = findWeapon(w, d.id);
      if (wp) {
        if (wp.level < d.maxLevel) {
          const lv = wp.level + 1;
          cands.push({ def: d, level: lv, isNew: false, weight: 10, rarity: lv >= 4 ? 'rare' : 'common' });
        }
      } else if (weaponCount < 6) {
        cands.push({ def: d, level: 1, isNew: true, weight: 7, rarity: 'common' });
      }
    } else if (d.kind === 'passive') {
      const cur = w.passives[d.id] ?? 0;
      if (cur > 0) {
        if (cur < d.maxLevel) cands.push({ def: d, level: cur + 1, isNew: false, weight: 8, rarity: 'common' });
      } else if (passiveCount < 6) {
        let wt = 6;
        // nudge toward the passive that unlocks a maxed weapon's evolution
        for (let j = 0; j < DEFS_LIST.length; j++) {
          const e = DEFS_LIST[j];
          if (e.kind === 'evolution' && e.passive === d.id) {
            const wp = findWeapon(w, e.weapon as string);
            if (wp && wp.level >= 5 && !wp.evolved) wt = 22;
            else if (wp && wp.level >= 3 && !wp.evolved) wt = 10;
          }
        }
        cands.push({ def: d, level: 1, isNew: true, weight: wt, rarity: 'common' });
      }
    } else if (d.kind === 'evolution') {
      const wp = findWeapon(w, d.weapon as string);
      if (wp && wp.level >= 5 && !wp.evolved && (w.passives[d.passive as string] ?? 0) >= 1) {
        evos.push({ def: d, level: 5, isNew: false, weight: 1, rarity: 'epic' });
      }
    } else if (d.kind === 'legendary') {
      if (!has(w, d.id)) legs.push({ def: d, level: 1, isNew: true, weight: 1, rarity: 'legendary' });
    }
  }

  const out: UpgradeChoice[] = [];
  const level = w.player.level;
  // guaranteed evolution slot
  if (evos.length > 0) out.push(mk(evos[(w.rng.next() * evos.length) | 0]));
  // at most one legendary per roll
  if (out.length < n && legs.length > 0 && level >= 4) {
    const chance = 0.04 + 0.01 * Math.floor(level / 10);
    if (w.rng.next() < chance) out.push(mk(legs[(w.rng.next() * legs.length) | 0]));
  }
  while (out.length < n && cands.length > 0) {
    const idx = weightedPick(w, cands);
    out.push(mk(cands[idx]));
    cands[idx] = cands[cands.length - 1];
    cands.pop();
  }
  if (out.length < n) {
    const h = UPGRADE_DEFS['heal'];
    out.push({ id: h.id, name: h.name, desc: h.desc(1), icon: h.icon, rarity: 'common', kind: 'heal', level: 1, isNew: false });
  }
  return out;
}

// ------------------------------------------------------------------ apply

export function applyChoice(w: World, c: UpgradeChoice): void {
  const def = UPGRADE_DEFS[c.id];
  if (c.kind === 'weapon') {
    const wp = findWeapon(w, c.id);
    if (wp) wp.level = Math.min(5, wp.level + 1);
    else w.weapons.push({ id: c.id as WeaponId, level: 1, evolved: false, timer: 0.1, a: 0, b: 0, c: 0 });
  } else if (c.kind === 'passive') {
    const max = def ? def.maxLevel : 5;
    w.passives[c.id] = Math.min(max, (w.passives[c.id] ?? 0) + 1);
  } else if (c.kind === 'evolution') {
    const wp = def && def.weapon ? findWeapon(w, def.weapon) : null;
    if (wp) { wp.evolved = true; wp.level = 5; wp.timer = 0; }
  } else if (c.kind === 'legendary') {
    if (!has(w, c.id)) {
      w.legendaries.push(c.id);
      if (c.id === 'ctrlz') w.player.revives++;
    }
  }
  recomputeStats(w);
  if (c.kind === 'heal') healPlayer(w, w.player.maxHp * 0.3);
}

export function recomputeStats(w: World): void {
  const s = baseStats();
  const shop = w.meta.shop;
  // meta shop
  s.maxHp += 10 * (shop['vitality'] ?? 0);
  s.damage += 0.06 * (shop['sharp'] ?? 0);
  s.fireRate += 0.05 * (shop['quick'] ?? 0);
  s.pickupRange *= 1 + 0.15 * (shop['reach'] ?? 0);
  s.xpMult += 0.08 * (shop['fresh'] ?? 0);
  s.moveSpeed *= 1 + 0.05 * (shop['swift'] ?? 0);
  // passives
  const ps = w.passives;
  const thick = ps['thick'] ?? 0, caf = ps['caffeine'] ?? 0, mar = ps['margins'] ?? 0, ita = ps['italics'] ?? 0;
  const spd = ps['speed'] ?? 0, bk = ps['bookmark'] ?? 0, mag = ps['magnifier'] ?? 0, ser = ps['serif'] ?? 0, ib = ps['ibid'] ?? 0;
  s.damage += 0.12 * thick;
  s.fireRate += 0.10 * caf;
  s.cooldown *= 1 - 0.06 * caf;
  s.area += 0.12 * mar;
  s.projSpeed += 0.12 * ita;
  s.duration += 0.10 * ita;
  s.moveSpeed *= 1 + 0.10 * spd;
  s.maxHp += 20 * bk;
  s.regen += 0.4 * bk;
  s.pickupRange *= 1 + 0.30 * mag;
  s.crit += 0.06 * ser;
  s.critMult += 0.2 * ser;
  s.amount += (ib + 1) >> 1;
  // legendaries
  if (has(w, 'caps')) { s.damage *= 2; s.size *= 1.4; s.dmgTaken *= 1.5; }
  w.stats = s;
  // keep hp ratio sane when max HP changes
  const p = w.player;
  const delta = s.maxHp - p.maxHp;
  p.maxHp = s.maxHp;
  if (delta > 0) p.hp = Math.min(p.maxHp, p.hp + delta);
  else if (p.hp > p.maxHp) p.hp = p.maxHp;
}

export function ownedSummary(w: World): { icon: string; level: number; evolved: boolean; name: string }[] {
  const out: { icon: string; level: number; evolved: boolean; name: string }[] = [];
  for (let i = 0; i < w.weapons.length; i++) {
    const wp = w.weapons[i];
    const d = UPGRADE_DEFS[wp.id];
    if (!d) continue;
    if (wp.evolved) {
      const evo = DEFS_LIST.find((e) => e.kind === 'evolution' && e.weapon === wp.id);
      out.push({ icon: evo ? evo.icon : d.icon, level: wp.level, evolved: true, name: evo ? evo.name : d.name });
    } else {
      out.push({ icon: d.icon, level: wp.level, evolved: false, name: d.name });
    }
  }
  for (let i = 0; i < DEFS_LIST.length; i++) {
    const d = DEFS_LIST[i];
    if (d.kind !== 'passive') continue;
    const lv = w.passives[d.id] ?? 0;
    if (lv > 0) out.push({ icon: d.icon, level: lv, evolved: false, name: d.name });
  }
  for (let i = 0; i < w.legendaries.length; i++) {
    const d = UPGRADE_DEFS[w.legendaries[i]];
    if (d) out.push({ icon: d.icon, level: 1, evolved: false, name: d.name });
  }
  return out;
}

// ------------------------------------------------------------------ Find & Replace

const qF: Enemy[] = [];
let fpDepth = 0;

/**
 * Find & Replace legendary. enemies.ts should call this when an enemy dies (x,y = death position).
 * 12% proc: every non-boss enemy within 80u is "converted" (killed via damageEnemy, dropping its letters).
 * Chain procs from those kills are allowed up to a shallow depth.
 */
export function findReplaceProc(w: World, x: number, y: number): void {
  if (fpDepth >= 3 || w.legendaries.indexOf('findreplace') < 0) return;
  if (w.rng.next() >= 0.12) return;
  fpDepth++;
  fx.ring(w, x, y, 80, PALETTE.gold, 0.4, 5);
  fx.burst(w, x, y, PALETTE.highlight, 10, 220, 3);
  fx.floatText(w, x, y - 14, 'REPLACED', PALETTE.gold, 13);
  const n = w.grid.query(x, y, 80, qF);
  for (let i = 0; i < n; i++) {
    const e = qF[i];
    if (!e.active || e.boss) continue;
    const dx = e.x - x, dy = e.y - y;
    if (dx * dx + dy * dy > (80 + e.r) * (80 + e.r)) continue;
    damageEnemy(w, e, 99999, false, 0, 0);
  }
  fpDepth--;
}
