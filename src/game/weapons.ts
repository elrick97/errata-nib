// OWNER: combat agent. Contract — keep signatures.
import type { World } from '../types';
export function updateWeapons(w: World, dt: number): void {}
/** Player bullet motion + collision vs enemies (via grid query + damageEnemy). */
export function updateBullets(w: World, dt: number): void {}
/** Draw persistent weapon visuals (orbits, aura, mines, beams) + player bullets. World space. */
export function renderWeapons(ctx: CanvasRenderingContext2D, w: World): void {}
