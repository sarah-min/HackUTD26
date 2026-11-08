// One-time setup: the worker's SpacetimeDB identity (stdb-bindings README §6).
//   pnpm --filter @hack/worker identity
// A Maincloud identity is the same on every database, so one worker token serves both aftermath-hackutd-dev and
// aftermath-hackutd (Sidd registers the identity as "worker" on each). The token is a secret: it is written only to
// ~/.config/aftermath/worker-token (mode 600), never printed. If that file (or STDB_SERVICE_TOKEN) already exists it
// is reused, so running this again never replaces the registered identity.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEV_MODULE, PROD_MODULE } from './env';
import { connectService } from './stdb/sdk';

async function main() {
  const uri = process.env.STDB_URI || 'https://maincloud.spacetimedb.com';
  const module = process.env.STDB_MODULE || DEV_MODULE;
  const dir = path.join(os.homedir(), '.config', 'aftermath');
  const file = path.join(dir, 'worker-token');
  const legacy = path.join(dir, `worker-token-${DEV_MODULE}`); // written by earlier versions of this script
  let existing = process.env.STDB_SERVICE_TOKEN || undefined;
  let source = existing ? 'STDB_SERVICE_TOKEN' : '';
  for (const f of [file, legacy]) {
    if (existing || !existsSync(f)) continue;
    existing = (await readFile(f, 'utf8')).trim() || undefined;
    if (existing) source = f;
  }
  const { conn, identityHex, token } = await connectService({ uri, module, token: existing });
  if (!existing) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(file, token + '\n', { mode: 0o600 });
  }
  conn.disconnect();
  process.stdout.write(
    [
      `identity:  ${identityHex}`,
      existing ? `token:     reused from ${source}` : `token:     saved to ${file} (secret; set it as STDB_SERVICE_TOKEN)`,
      '',
      'Send the identity (never the token) to Sidd to register it as a worker on both databases:',
      ...[DEV_MODULE, PROD_MODULE].map((db) => `  spacetime call --server maincloud ${db} admin_add_service '"${identityHex}"' '"worker"'`),
      '',
    ].join('\n'),
  );
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(`identity failed: ${(e as Error).message}\n`);
  process.exit(1);
});
