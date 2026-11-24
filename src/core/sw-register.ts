/// <reference types="vite/client" />
// OWNER: pwa agent. Contract — keep signature.

/** Registers the offline service worker (production builds only). Failures are logged, never thrown. */
export function registerSW(): void {
  if (!import.meta.env.PROD) return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    try {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err: unknown) => {
        console.warn('[errata] service worker registration failed', err);
      });
    } catch (err) {
      console.warn('[errata] service worker registration failed', err);
    }
  });
}
