// OWNER: core agent. Contract — keep signatures.
import type { InputState } from '../types';
export const input: InputState = { mx: 0, my: 0, active: false, joyX: 0, joyY: 0, knobX: 0, knobY: 0, usingKeys: false };
/** Attach touch/mouse/keyboard listeners to `el` (the canvas container). onPause fires on Esc/P. */
export function initInput(el: HTMLElement, onPause: () => void): void { /* TODO */ }
/** Clear held state (e.g. when a menu opens). */
export function resetInput(): void { /* TODO */ }
/** Joystick max radius in CSS px (for rendering). */
export const JOY_RADIUS = 56;
