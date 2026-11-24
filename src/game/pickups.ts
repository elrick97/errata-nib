// OWNER: combat agent. Contract — keep signatures.
import type { World, PickupKind } from '../types';
/** Spawn xp letters etc. If pool is full, merge xp value into an existing gem. */
export function dropPickup(w: World, kind: PickupKind, x: number, y: number, value: number): void {}
/** Magnet, collection, xp gain -> level up (w.pendingLevelUps++, w.events.levelUp()). */
export function updatePickups(w: World, dt: number): void {}
export function xpForLevel(level: number): number { return 5 + level * 5; }
