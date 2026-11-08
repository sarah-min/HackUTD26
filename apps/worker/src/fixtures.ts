import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Repo root = nearest ancestor with pnpm-workspace.yaml. */
export function repoRoot(start = process.cwd()): string {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

export async function loadFixture<T = unknown>(relative: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot(), 'fixtures', relative), 'utf8')) as T;
}
