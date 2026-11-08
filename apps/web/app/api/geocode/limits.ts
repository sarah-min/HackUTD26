// In-memory cache, per-IP rate limit and an upstream throttle for /api/geocode.
// Single web process (ARCHITECTURE §9), so process memory is enough for the hackathon.

export class TtlCache<V> {
  private map = new Map<string, { value: V; expiresAt: number }>();
  constructor(
    private ttlMs: number,
    private maxEntries = 500,
    private now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V): void {
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }
}

/** Fixed-window limiter: at most `limit` calls per `windowMs` per key. */
export class RateLimiter {
  private hits = new Map<string, { count: number; windowStart: number }>();
  constructor(
    private limit: number,
    private windowMs: number,
    private now: () => number = Date.now,
  ) {}

  allow(key: string): boolean {
    const t = this.now();
    const h = this.hits.get(key);
    if (!h || t - h.windowStart >= this.windowMs) {
      this.hits.set(key, { count: 1, windowStart: t });
      if (this.hits.size > 5000) this.hits.clear(); // reason: bound memory; worst case resets windows
      return true;
    }
    h.count += 1;
    return h.count <= this.limit;
  }
}

/**
 * Serializes calls so they start at least `gapMs` apart (Nominatim policy: max 1 request/second).
 */
export class Throttle {
  private chain: Promise<unknown> = Promise.resolve();
  private last = Number.NEGATIVE_INFINITY;
  constructor(
    private gapMs: number,
    private now: () => number = Date.now,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(async () => {
      const wait = this.last + this.gapMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.last = this.now();
      return fn();
    });
    this.chain = next.catch(() => undefined);
    return next;
  }
}
