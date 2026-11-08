import os from 'node:os';
import path from 'node:path';
import { createDiskCache, type FindingCache } from '@hack/vision';

/** Damage-frame cache outside the repo so demo re-runs make no new VL calls. Never used for IDs. */
let cache: FindingCache | null = null;
export function findingCache(): FindingCache {
  return (cache ??= createDiskCache(path.join(os.homedir(), '.cache', 'aftermath-vl')));
}
