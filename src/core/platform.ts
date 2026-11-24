// OWNER: core agent. Contract — keep signatures.
export function setHapticsEnabled(on: boolean): void { /* TODO */ }
/** navigator.vibrate if supported+enabled; silently no-op otherwise (iOS Safari). */
export function haptic(ms: number | number[]): void { /* TODO */ }
/** Calls cb(hidden) on visibilitychange / pagehide / blur. */
export function onVisibilityChange(cb: (hidden: boolean) => void): void { /* TODO */ }
/** Prevent pinch-zoom, double-tap zoom, context menu, scrolling, text selection, iOS gesture events. */
export function lockDownPage(): void { /* TODO */ }
