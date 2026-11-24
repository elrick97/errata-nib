// OWNER: enemy agent. Contract — keep signatures.
import type { World, Enemy, EnemyKind } from '../types';
export interface SpawnOpts { hpMult?: number; dmgMult?: number; speedMult?: number; elite?: boolean; }
export function spawnEnemy(w: World, kind: EnemyKind, x: number, y: number, opts?: SpawnOpts): Enemy | null { return null; }
/** AI, movement, separation, contact damage to player, grid rebuild (grid.clear + insert all active). */
export function updateEnemies(w: World, dt: number): void {}
export function updateEnemyBullets(w: World, dt: number): void {}
/** The one entry point for damaging enemies. Handles hp, flash, knockback, dmg numbers, sfx, death (drops, fx, kills, score, boss events). Returns true if killed. */
export function damageEnemy(w: World, e: Enemy, amount: number, crit: boolean, kx: number, ky: number): boolean { return false; }
/** Remove enemy bullets within radius (e.g. Square Brackets). Returns count deleted. */
export function clearEnemyBulletsInRadius(w: World, x: number, y: number, r: number): number { return 0; }
