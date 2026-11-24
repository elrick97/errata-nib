// OWNER: combat agent. Contract — keep signatures.
import type { World, PickupKind, Pickup } from '../types';
import { PALETTE } from '../types';
import { healPlayer } from './player';
import * as fx from './fx';

const LETTERS = 'etaoinshrdlu';
const MAGNET_MAX = 900;
const MAGNET_ACCEL = 3600;
let farTimer = 0;

/** Spawn xp letters etc. If pool is full, merge xp value into an existing gem. */
export function dropPickup(w: World, kind: PickupKind, x: number, y: number, value: number): void {
  const pk = w.pickups.spawn();
  if (!pk) {
    if (kind === 'xp') {
      const items = w.pickups.items;
      const n = items.length;
      const s = Math.floor(w.rng.next() * n);
      for (let k = 0; k < n; k++) {
        const o = items[(s + k) % n];
        if (o.active && o.kind === 'xp') { o.value += value; return; }
      }
    }
    return;
  }
  pk.kind = kind;
  pk.x = x; pk.y = y;
  const a = w.rng.next() * 6.2832;
  const s = 30 + w.rng.next() * 60;
  pk.vx = Math.cos(a) * s; pk.vy = Math.sin(a) * s;
  pk.value = value;
  pk.magnet = false;
  pk.t = 0;
  pk.glyph = kind === 'xp' ? LETTERS[Math.floor(w.rng.next() * LETTERS.length)] : '';
}

export function xpForLevel(level: number): number {
  return Math.floor(6 + level * 4 + Math.pow(level, 1.85) * 0.9);
}

function collect(w: World, pk: Pickup): void {
  const p = w.player;
  switch (pk.kind) {
    case 'xp': {
      p.xp += pk.value * w.stats.xpMult;
      w.events.sfx('pickup');
      while (p.xp >= p.xpNext) {
        p.xp -= p.xpNext;
        p.level++;
        p.xpNext = xpForLevel(p.level);
        w.pendingLevelUps++;
        w.events.levelUp();
      }
      break;
    }
    case 'heal':
      healPlayer(w, p.maxHp * 0.2);
      w.events.sfx('heal');
      break;
    case 'magnet': {
      const items = w.pickups.items;
      for (let i = 0; i < items.length; i++) {
        const o = items[i];
        if (o.active && o.kind === 'xp') o.magnet = true;
      }
      fx.floatText(w, p.x, p.y - 26, 'MAGNET!', PALETTE.highlight, 18);
      fx.ring(w, p.x, p.y, 200, PALETTE.highlight, 0.5, 6);
      w.events.sfx('heal');
      break;
    }
    case 'chest':
      w.pendingLevelUps++;
      w.events.levelUp();
      fx.floatText(w, p.x, p.y - 26, 'CHEST!', PALETTE.gold, 22);
      fx.burst(w, p.x, p.y, PALETTE.gold, 24, 300, 4);
      w.events.sfx('chest');
      break;
    case 'ink':
      w.score += pk.value * 10;
      w.events.sfx('pickup');
      break;
  }
}

/** Magnet, collection, xp gain -> level up (w.pendingLevelUps++, w.events.levelUp()). */
export function updatePickups(w: World, dt: number): void {
  const p = w.player;
  const items = w.pickups.items;
  const range = w.stats.pickupRange;
  const range2 = range * range;
  const fric = Math.max(0, 1 - 7 * dt);
  farTimer += dt;
  const doFar = farTimer > 1;
  if (doFar) farTimer = 0;

  for (let i = 0; i < items.length; i++) {
    const pk = items[i];
    if (!pk.active) continue;
    pk.t += dt;
    const dx = p.x - pk.x, dy = p.y - pk.y;
    const d2 = dx * dx + dy * dy;

    if (!pk.magnet && p.alive && pk.kind !== 'magnet' && d2 < range2) {
      pk.magnet = true;
      const d = Math.sqrt(d2) || 1;
      pk.vx = -dx / d * 130; pk.vy = -dy / d * 130; // slight outward pop
    }

    if (pk.magnet && p.alive) {
      const d = Math.sqrt(d2) || 1;
      pk.vx += dx / d * MAGNET_ACCEL * dt;
      pk.vy += dy / d * MAGNET_ACCEL * dt;
      const s2 = pk.vx * pk.vx + pk.vy * pk.vy;
      if (s2 > MAGNET_MAX * MAGNET_MAX) {
        const f = MAGNET_MAX / Math.sqrt(s2);
        pk.vx *= f; pk.vy *= f;
      }
    } else {
      pk.vx *= fric; pk.vy *= fric;
    }
    pk.x += pk.vx * dt;
    pk.y += pk.vy * dt;

    if (p.alive) {
      const sp = Math.sqrt(pk.vx * pk.vx + pk.vy * pk.vy);
      const cr = p.r + 8 + (pk.magnet ? sp * dt : 0);
      const ex = p.x - pk.x, ey = p.y - pk.y;
      if (ex * ex + ey * ey < cr * cr) {
        collect(w, pk);
        w.pickups.free(pk);
        continue;
      }
    }

    if (doFar && pk.kind === 'xp' && !pk.magnet && d2 > 1400 * 1400) {
      // pull stray gems back to just beyond the screen edge, same bearing
      const d = Math.sqrt(d2);
      pk.x = p.x - dx / d * 520;
      pk.y = p.y - dy / d * 520;
    }
  }
}
