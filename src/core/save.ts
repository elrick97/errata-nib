// OWNER: core agent. Contract — keep signatures.
import type { MetaSave, Settings } from '../types';
export const SAVE_KEY = 'errata-nib.save.v1';

export function defaultSave(): MetaSave {
  return {
    version: 1,
    ink: 0,
    bestPage: 0, bestScore: 0, bestTime: 0,
    runs: 0, totalKills: 0,
    shop: {},
    settings: { sound: true, music: true, haptics: true, shake: true },
    seenTutorial: false,
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const numOr = (v: unknown, fb: number): number => (isNum(v) ? v : fb);
const boolOr = (v: unknown, fb: boolean): boolean => (typeof v === 'boolean' ? v : fb);

/** Never throws. Validates/repairs; returns defaults on corruption. */
export function loadSave(): MetaSave {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const p: any = JSON.parse(raw);
    if (!p || typeof p !== 'object' || Array.isArray(p) || p.version !== 1) return defaultSave();

    const d = defaultSave();
    d.ink = numOr(p.ink, d.ink);
    d.bestPage = numOr(p.bestPage, d.bestPage);
    d.bestScore = numOr(p.bestScore, d.bestScore);
    d.bestTime = numOr(p.bestTime, d.bestTime);
    d.runs = numOr(p.runs, d.runs);
    d.totalKills = numOr(p.totalKills, d.totalKills);
    d.seenTutorial = boolOr(p.seenTutorial, d.seenTutorial);

    if (p.shop && typeof p.shop === 'object' && !Array.isArray(p.shop)) {
      for (const k of Object.keys(p.shop)) {
        const v = p.shop[k];
        if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 50) d.shop[k] = v;
      }
    }

    const s: Partial<Record<keyof Settings, unknown>> =
      p.settings && typeof p.settings === 'object' ? p.settings : {};
    d.settings = {
      sound: boolOr(s.sound, d.settings.sound),
      music: boolOr(s.music, d.settings.music),
      haptics: boolOr(s.haptics, d.settings.haptics),
      shake: boolOr(s.shake, d.settings.shake),
    };
    return d;
  } catch {
    return defaultSave();
  }
}

/** Never throws. */
export function writeSave(s: MetaSave): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    // private mode / quota / disabled storage: drop silently
  }
}
