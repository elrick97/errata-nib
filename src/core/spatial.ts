// OWNER: core agent. Contract — keep signatures.
// Uniform-grid broad phase. Items are bucketed by center cell; query() returns
// candidates from every cell the search box touches (false positives allowed).
export class SpatialHash<T extends { x: number; y: number; r: number; active: boolean }> {
  private buckets = new Map<number, T[]>();
  /** Buckets that received items since the last clear(). Reused across frames. */
  private used: T[][] = [];
  private usedCount = 0;
  private maxR = 0;
  private inv: number;

  constructor(public cellSize = 64) {
    this.inv = 1 / cellSize;
  }

  clear(): void {
    for (let i = 0; i < this.usedCount; i++) this.used[i].length = 0;
    this.usedCount = 0;
    this.maxR = 0;
  }

  insert(item: T): void {
    if (!item.active) return;
    if (item.r > this.maxR) this.maxR = item.r;
    const cx = Math.floor(item.x * this.inv);
    const cy = Math.floor(item.y * this.inv);
    const key = ((cx * 92837111) ^ (cy * 689287499)) | 0;
    let arr = this.buckets.get(key);
    if (!arr) {
      arr = [];
      this.buckets.set(key, arr);
    }
    if (arr.length === 0) this.used[this.usedCount++] = arr;
    arr.push(item);
  }

  /** Writes items whose circle may overlap (x,y,r) into `out` (reused array), returns count. No allocation. */
  query(x: number, y: number, r: number, out: T[]): number {
    const R = r + this.maxR;
    const x0 = Math.floor((x - R) * this.inv);
    const x1 = Math.floor((x + R) * this.inv);
    const y0 = Math.floor((y - R) * this.inv);
    const y1 = Math.floor((y + R) * this.inv);
    let n = 0;
    for (let cy = y0; cy <= y1; cy++) {
      const ky = cy * 689287499;
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this.buckets.get(((cx * 92837111) ^ ky) | 0);
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) out[n++] = arr[i];
      }
    }
    return n;
  }
}
