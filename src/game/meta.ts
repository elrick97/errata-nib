// OWNER: combat agent. Contract — keep signatures.
import type { MetaSave } from '../types';
export interface ShopItem { id: string; name: string; desc: string; icon: string; maxLevel: number; cost(level: number): number; }

const cost = (level: number): number => Math.round(25 * Math.pow(1.7, level));

export const SHOP: ShopItem[] = [
  { id: 'vitality', name: 'Vitality', desc: '+10 max HP per level', icon: '♥', maxLevel: 5, cost },
  { id: 'sharp', name: 'Sharp Nib', desc: '+6% damage per level', icon: '✒', maxLevel: 5, cost },
  { id: 'quick', name: 'Quick Hand', desc: '+5% fire rate per level', icon: '»', maxLevel: 5, cost },
  { id: 'reach', name: 'Long Reach', desc: '+15% pickup range per level', icon: '⌕', maxLevel: 3, cost },
  { id: 'fresh', name: 'Fresh Ink', desc: '+8% XP gained per level', icon: '❦', maxLevel: 5, cost },
  { id: 'reroll', name: 'Second Draft', desc: '+1 reroll per run', icon: '↻', maxLevel: 3, cost },
  { id: 'swift', name: 'Swift Hand', desc: '+5% move speed per level', icon: '⇥', maxLevel: 3, cost },
];

/** Ink reward for a finished run. */
export function inkForRun(kills: number, page: number, bosses: number): number {
  return Math.max(0, Math.floor(kills / 8 + (page - 1) * 6 + bosses * 30));
}

export function buy(meta: MetaSave, id: string): boolean {
  let item: ShopItem | null = null;
  for (let i = 0; i < SHOP.length; i++) if (SHOP[i].id === id) { item = SHOP[i]; break; }
  if (!item) return false;
  const lvl = meta.shop[id] ?? 0;
  if (lvl >= item.maxLevel) return false;
  const c = item.cost(lvl);
  if (meta.ink < c) return false;
  meta.ink -= c;
  meta.shop[id] = lvl + 1;
  return true;
}
