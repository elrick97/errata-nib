// OWNER: combat agent. Contract — keep signatures.
import type { World } from '../types';
export function updatePlayer(w: World, dt: number): void {}
/** Applies armor/dmgTaken/iframes, fx, events (playerHurt, playerDeath), Ctrl+Z revive. */
export function hurtPlayer(w: World, dmg: number): void {}
export function healPlayer(w: World, amount: number): void {}
export function renderPlayer(ctx: CanvasRenderingContext2D, w: World): void {}
