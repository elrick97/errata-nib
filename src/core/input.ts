// OWNER: core agent. Contract — keep signatures.
import type { InputState } from '../types';
export const input: InputState = { mx: 0, my: 0, active: false, joyX: 0, joyY: 0, knobX: 0, knobY: 0, usingKeys: false };

/** Joystick max radius in CSS px (for rendering). */
export const JOY_RADIUS = 56;

const DEAD = 6;                       // dead zone in CSS px
const DEAD_N = DEAD / JOY_RADIUS;     // dead zone as fraction of radius
const CHASE = JOY_RADIUS * 1.2;       // beyond this the base follows the finger
const MIN_SPEED = 0.35;               // speed right after leaving the dead zone

let root: HTMLElement | null = null;
let onPauseCb: () => void = () => {};
let inited = false;
let pid = -1;                         // tracked pointer id, -1 = none
let ptrMx = 0, ptrMy = 0;             // movement from the pointer
let kx = 0, ky = 0;                   // movement from the keyboard
let keysHeld = false;
const held = new Set<string>();

const MOVE: Record<string, 'l' | 'r' | 'u' | 'd'> = {
  KeyA: 'l', ArrowLeft: 'l',
  KeyD: 'r', ArrowRight: 'r',
  KeyW: 'u', ArrowUp: 'u',
  KeyS: 'd', ArrowDown: 'd',
};

/** Publishes the current movement: keys take priority over the pointer. */
function apply(): void {
  input.active = pid !== -1;
  if (keysHeld) {
    input.mx = kx;
    input.my = ky;
  } else {
    input.mx = ptrMx;
    input.my = ptrMy;
  }
}

function refreshKeys(): void {
  let l = false, r = false, u = false, d = false;
  for (const c of held) {
    const m = MOVE[c];
    if (m === 'l') l = true; else if (m === 'r') r = true;
    else if (m === 'u') u = true; else if (m === 'd') d = true;
  }
  let x = (r ? 1 : 0) - (l ? 1 : 0);
  let y = (d ? 1 : 0) - (u ? 1 : 0);
  if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
  kx = x;
  ky = y;
  keysHeld = held.size > 0;
  apply();
}

function releaseCapture(): void {
  if (root && pid !== -1) {
    try { root.releasePointerCapture(pid); } catch { /* not captured */ }
  }
  pid = -1;
}

function onDown(e: PointerEvent): void {
  if (!root || pid !== -1) return;
  const t = e.target as Element | null;
  if (t && typeof t.closest === 'function' && t.closest('[data-noinput]')) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  pid = e.pointerId;
  try { root.setPointerCapture(pid); } catch { /* ignore */ }
  const rect = root.getBoundingClientRect();
  input.joyX = e.clientX - rect.left;
  input.joyY = e.clientY - rect.top;
  input.knobX = input.joyX;
  input.knobY = input.joyY;
  input.usingKeys = false;
  ptrMx = 0;
  ptrMy = 0;
  apply();
}

function onMove(e: PointerEvent): void {
  if (!root || e.pointerId !== pid) return;
  const rect = root.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  let dx = cx - input.joyX;
  let dy = cy - input.joyY;
  let d = Math.hypot(dx, dy);
  if (d > CHASE) {
    // drag the base along so the direction reacts immediately
    const k = CHASE / d;
    dx *= k;
    dy *= k;
    d = CHASE;
    input.joyX = cx - dx;
    input.joyY = cy - dy;
  }
  const ux = d > 0 ? dx / d : 0;
  const uy = d > 0 ? dy / d : 0;
  const kd = Math.min(d, JOY_RADIUS);
  input.knobX = input.joyX + ux * kd;
  input.knobY = input.joyY + uy * kd;

  if (d <= DEAD) {
    ptrMx = 0;
    ptrMy = 0;
  } else {
    const L = kd / JOY_RADIUS;
    const t = Math.min(1, Math.max(0, (L - DEAD_N) / (1 - DEAD_N)));
    const speed = MIN_SPEED + (1 - MIN_SPEED) * t;
    ptrMx = ux * speed;
    ptrMy = uy * speed;
  }
  apply();
}

function onUp(e: PointerEvent): void {
  if (e.pointerId !== pid) return;
  releaseCapture();
  ptrMx = 0;
  ptrMy = 0;
  apply();
}

function onKeyDown(e: KeyboardEvent): void {
  const code = e.code || e.key;
  if (code === 'Escape' || code === 'KeyP') {
    if (!e.repeat) onPauseCb();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (MOVE[code] === undefined) return;
  if (code.startsWith('Arrow')) e.preventDefault();
  held.add(code);
  input.usingKeys = true;
  refreshKeys();
}

function onKeyUp(e: KeyboardEvent): void {
  const code = e.code || e.key;
  if (!held.delete(code)) return;
  refreshKeys();
}

function onBlur(): void {
  held.clear();
  refreshKeys();
}

/** Attach touch/mouse/keyboard listeners to `el` (the canvas container). onPause fires on Esc/P. */
export function initInput(el: HTMLElement, onPause: () => void): void {
  onPauseCb = onPause;
  root = el;
  el.style.touchAction = 'none';
  if (inited) return;
  inited = true;
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('lostpointercapture', onUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
}

/** Clear held state (e.g. when a menu opens). */
export function resetInput(): void {
  releaseCapture();
  ptrMx = 0;
  ptrMy = 0;
  held.clear();
  kx = 0;
  ky = 0;
  keysHeld = false;
  input.mx = 0;
  input.my = 0;
  input.active = false;
  input.knobX = input.joyX;
  input.knobY = input.joyY;
}
