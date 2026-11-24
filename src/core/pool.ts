/** Fixed-size object pool. Items are preallocated; iterate `items` and skip !active. */
export class Pool<T extends { active: boolean }> {
  readonly items: T[];
  private freeList: number[];
  private index = new Map<T, number>();
  count = 0;
  constructor(size: number, factory: () => T) {
    this.items = new Array(size);
    this.freeList = new Array(size);
    for (let i = 0; i < size; i++) {
      const it = factory(); it.active = false;
      this.items[i] = it; this.index.set(it, i);
      this.freeList[i] = size - 1 - i;
    }
  }
  /** Returns an inactive item marked active, or null if the pool is exhausted. Caller must init all fields. */
  spawn(): T | null {
    const i = this.freeList.pop();
    if (i === undefined) return null;
    const it = this.items[i]; it.active = true; this.count++;
    return it;
  }
  free(it: T): void {
    if (!it.active) return;
    it.active = false; this.count--;
    this.freeList.push(this.index.get(it)!);
  }
  clear(): void { for (const it of this.items) this.free(it); }
  get capacity(): number { return this.items.length; }
}
