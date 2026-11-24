// OWNER: core agent. Contract — keep signatures.
import type { MetaSave } from '../types';
export const SAVE_KEY = 'errata-nib.save.v1';
export function defaultSave(): MetaSave { throw new Error('TODO'); }
/** Never throws. Validates/repairs; returns defaults on corruption. */
export function loadSave(): MetaSave { return defaultSave(); }
/** Never throws. */
export function writeSave(s: MetaSave): void { /* TODO */ }
