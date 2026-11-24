// OWNER: render agent. Contract — keep signatures. All state module-local, pooled, no per-frame allocation.
import type { World } from '../types';
export function resetFx(): void {}
export function updateFx(w: World, dt: number): void {}
/** Particle burst. size in world units. */
export function burst(w: World, x: number, y: number, color: string, count: number, speed: number, size?: number): void {}
/** Expanding ring (shockwave). */
export function ring(w: World, x: number, y: number, radius: number, color: string, life?: number, width?: number): void {}
/** Floating damage number. */
export function dmgNumber(w: World, x: number, y: number, amount: number, crit: boolean): void {}
/** Floating text (e.g. "+12 HP", "CRIT!", "EVOLVED"). */
export function floatText(w: World, x: number, y: number, text: string, color: string, size?: number): void {}
/** Persistent ink splat decal on the paper (ring buffer, capped). */
export function splat(w: World, x: number, y: number, radius: number, color: string): void {}
/** Straight line effect (strikethrough slash, lightning). */
export function line(w: World, x1: number, y1: number, x2: number, y2: number, color: string, width: number, life: number): void {}
/** Jagged lightning bolt between two points. */
export function bolt(w: World, x1: number, y1: number, x2: number, y2: number, color: string, life?: number): void {}
export function shake(w: World, amount: number): void {}
export function hitstop(w: World, seconds: number): void {}
export function flash(w: World, color: string, alpha: number): void {}
/** Draw particles/rings/lines/numbers (world space; ctx already camera-transformed). */
export function renderFxWorld(ctx: CanvasRenderingContext2D, w: World): void {}
/** Draw splat decals (world space, under entities). */
export function renderDecals(ctx: CanvasRenderingContext2D, w: World): void {}
