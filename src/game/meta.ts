// OWNER: combat agent. Contract — keep signatures.
import type { MetaSave } from '../types';
export interface ShopItem { id: string; name: string; desc: string; icon: string; maxLevel: number; cost(level: number): number; }
export const SHOP: ShopItem[] = [];
/** Ink reward for a finished run. */
export function inkForRun(kills: number, page: number, bosses: number): number { return 0; }
export function buy(meta: MetaSave, id: string): boolean { return false; }
