import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Damage-frame VL cache keyed by frame SHA-256 + model + prompt + hazard, so demo re-runs don't re-bill.
 * NEVER used for ID documents.
 */
export interface FindingCache {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

export function sha256Hex(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function findingCacheKey(parts: { imageSha256: string; modelId: string; promptVersion: string; hazard?: string }) {
  return sha256Hex([parts.imageSha256, parts.modelId, parts.promptVersion, parts.hazard ?? ''].join('|'));
}

export function createMemoryCache(): FindingCache {
  const map = new Map<string, unknown>();
  return {
    async get(key) {
      return map.get(key);
    },
    async set(key, value) {
      map.set(key, value);
    },
  };
}

/** Memory + JSON-on-disk cache. Survives worker restarts on the VM. */
export function createDiskCache(dir: string): FindingCache {
  const mem = createMemoryCache();
  let ready: Promise<unknown> | null = null;
  const ensureDir = () => (ready ??= mkdir(dir, { recursive: true }));
  return {
    async get(key) {
      const hit = await mem.get(key);
      if (hit !== undefined) return hit;
      try {
        const value = JSON.parse(await readFile(path.join(dir, `${key}.json`), 'utf8'));
        await mem.set(key, value);
        return value;
      } catch {
        return undefined;
      }
    },
    async set(key, value) {
      await mem.set(key, value);
      await ensureDir();
      await writeFile(path.join(dir, `${key}.json`), JSON.stringify(value));
    },
  };
}
