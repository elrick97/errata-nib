// OWNER: audio agent. Contract — keep signatures.
import type { SfxName } from '../types';
/** Call from a user gesture (first tap). Safe to call repeatedly. */
export function unlockAudio(): void { /* TODO */ }
export function setSoundEnabled(on: boolean): void { /* TODO */ }
export function setMusicEnabled(on: boolean): void { /* TODO */ }
/** intensity 0..1 scales volume/pitch variety. Must rate-limit internally. */
export function sfx(name: SfxName, intensity?: number): void { /* TODO */ }
export function startMusic(): void { /* TODO */ }
export function stopMusic(): void { /* TODO */ }
/** 0 = calm, 0.5 = mid run, 1 = boss. Smoothly changes layers/tempo feel. */
export function setMusicIntensity(v: number): void { /* TODO */ }
export function suspendAudio(): void { /* TODO */ }
export function resumeAudio(): void { /* TODO */ }
