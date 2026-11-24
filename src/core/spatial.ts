// OWNER: core agent. Contract — keep signatures.
export class SpatialHash<T extends { x: number; y: number; r: number; active: boolean }> {
  constructor(public cellSize = 64) { /* TODO */ }
  clear(): void { /* TODO */ }
  insert(item: T): void { /* TODO */ }
  /** Writes items whose circle may overlap (x,y,r) into `out` (reused array), returns count. No allocation. */
  query(x: number, y: number, r: number, out: T[]): number { return 0; }
}
