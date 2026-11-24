// OWNER: render agent. Contract — keep signatures.
import type { World } from '../types';
/** Create/size the canvas. Call on every resize. Returns world view size. */
export function initRender(canvas: HTMLCanvasElement): void {}
export function resizeRender(cssW: number, cssH: number, dpr: number): { viewW: number; viewH: number } { return { viewW: 420, viewH: 800 }; }
/** Full frame draw. `paused` -> still draws world. */
export function render(w: World, realDt: number): void {}
/** Draws title-screen backdrop (paper + drifting glyphs) when no run active. */
export function renderIdle(t: number): void {}
/** Cached offscreen sprite helper usable by other modules. */
export function getSprite(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement { return document.createElement('canvas'); }
