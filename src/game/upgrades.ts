// OWNER: combat agent. Contract — keep signatures.
import type { World, Rarity } from '../types';
export interface UpgradeChoice {
  id: string; name: string; desc: string; icon: string; rarity: Rarity;
  kind: 'weapon' | 'passive' | 'legendary' | 'evolution' | 'heal';
  level: number; isNew: boolean;
}
export function rollChoices(w: World, n: number): UpgradeChoice[] { return []; }
export function applyChoice(w: World, c: UpgradeChoice): void {}
/** Base stats + meta shop + passives + legendaries -> w.stats; adjusts maxHp keeping hp ratio sane. */
export function recomputeStats(w: World): void {}
/** For HUD: list of owned weapons/passives with icon+level. */
export function ownedSummary(w: World): { icon: string; level: number; evolved: boolean; name: string }[] { return []; }
