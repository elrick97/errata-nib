// OWNER: ui agent. Contract — keep signatures.
import type { MetaSave, Settings, World } from '../types';
import type { UpgradeChoice } from '../game/upgrades';
import type { ShopItem } from '../game/meta';
export interface RunSummary {
  page: number; pageLabel: string; time: number; kills: number; score: number; level: number;
  ink: number; bosses: number; newBest: boolean;
  build: { icon: string; level: number; evolved: boolean; name: string }[];
}
export function initUI(root: HTMLElement, onPause: () => void): void {}
export function hideAll(): void {}
export function showTitle(meta: MetaSave, h: { onStart(): void; onShop(): void; onSettings(): void }): void {}
export function showShop(meta: MetaSave, items: ShopItem[], h: { onBuy(id: string): void; onBack(): void }): void {}
export function showSettings(s: Settings, h: { onToggle(k: keyof Settings): void; onResetSave(): void; onBack(): void }): void {}
export function showLevelUp(choices: UpgradeChoice[], rerolls: number, h: { onPick(c: UpgradeChoice): void; onReroll(): void }): void {}
export function showPause(s: Settings, w: World, h: { onResume(): void; onQuit(): void; onToggle(k: keyof Settings): void }): void {}
export function showResults(sum: RunSummary, h: { onContinue(): void }): void {}
export function showHud(on: boolean): void {}
/** Called every frame; must only touch the DOM when a displayed value changed. */
export function updateHud(w: World): void {}
export function pageBanner(label: string): void {}
export function bossBanner(name: string, sub: string): void {}
export function toast(text: string, color?: string): void {}
