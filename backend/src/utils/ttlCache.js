/**
 * Tiny in-memory TTL cache for data that rarely changes during an exam (student, exam settings,
 * question text). Each server instance has its own copy; writes in this instance invalidate
 * immediately, other instances see changes within the TTL.
 */
export class TtlCache {
  constructor({ ttlMs, max = 5000 }) {
    this.ttlMs = ttlMs;
    this.max = max;
    this.map = new Map();
  }

  get(key) {
    const hit = this.map.get(String(key));
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.map.delete(String(key));
      return undefined;
    }
    return hit.value;
  }

  set(key, value) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value); // drop oldest
    this.map.set(String(key), { value, expires: Date.now() + this.ttlMs });
    return value;
  }

  delete(key) {
    this.map.delete(String(key));
  }

  clear() {
    this.map.clear();
  }

  /** Returns the cached value, or loads it once even if many callers ask at the same moment. */
  async getOrLoad(key, load) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    this.inflight ??= new Map();
    const k = String(key);
    if (!this.inflight.has(k)) {
      this.inflight.set(
        k,
        (async () => {
          try {
            const value = await load();
            if (value !== null && value !== undefined) this.set(key, value);
            return value;
          } finally {
            this.inflight.delete(k);
          }
        })(),
      );
    }
    return this.inflight.get(k);
  }
}
