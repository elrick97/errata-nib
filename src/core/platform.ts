// OWNER: core agent. Contract — keep signatures.
let hapticsOn = true;
let lockedDown = false;

export function setHapticsEnabled(on: boolean): void {
  hapticsOn = on;
}

/** navigator.vibrate if supported+enabled; silently no-op otherwise (iOS Safari). */
export function haptic(ms: number | number[]): void {
  if (!hapticsOn) return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(ms);
  } catch {
    // ignore
  }
}

/** Calls cb(hidden) on visibilitychange / pagehide / pageshow. */
export function onVisibilityChange(cb: (hidden: boolean) => void): void {
  document.addEventListener('visibilitychange', () => cb(document.hidden));
  window.addEventListener('pagehide', () => cb(true));
  window.addEventListener('pageshow', () => {
    if (!document.hidden) cb(false);
  });
}

/** Prevent pinch-zoom, double-tap zoom, context menu, scrolling, text selection, iOS gesture events. */
export function lockDownPage(): void {
  if (lockedDown) return;
  lockedDown = true;

  const block = (e: Event) => e.preventDefault();
  for (const t of ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu', 'selectstart']) {
    document.addEventListener(t, block, { passive: false });
  }

  document.addEventListener('touchmove', (e) => {
    const t = e.target as Element | null;
    if (t && typeof t.closest === 'function' && t.closest('[data-scroll]')) return;
    e.preventDefault();
  }, { passive: false });

  // iOS double-tap zoom: swallow a second touchend within 300ms
  let lastEnd = 0;
  document.addEventListener('touchend', (e) => {
    const t = e.target as Element | null;
    const exempt = !!t && typeof t.closest === 'function' &&
      (t.closest('button') !== null || t.closest('[data-noinput] input') !== null);
    if (exempt) return;
    const now = Date.now();
    if (now - lastEnd < 300) e.preventDefault();
    lastEnd = now;
  }, { passive: false });

  const style = document.createElement('style');
  style.textContent =
    'html,body{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;' +
    '-webkit-tap-highlight-color:transparent;overscroll-behavior:none;touch-action:none}' +
    '[data-scroll]{touch-action:pan-y;overflow-y:auto;-webkit-overflow-scrolling:touch}';
  document.head.appendChild(style);
}
