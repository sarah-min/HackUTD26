// One-time setup: mint the worker's SpacetimeDB identity (stdb-bindings README §6).
//   pnpm --filter @hack/worker identity            # uses STDB_URI / STDB_MODULE (default: Maincloud dev DB)
// Prints the identity hex to send to Sidd for `admin_add_service ... '"worker"'`. The token is a secret: it is written
// only to ~/.config/aftermath/worker-token-<module> (mode 600), never printed. Put it in the worker's env as
// STDB_SERVICE_TOKEN. Run once per database (dev and prod are separate identities unless you reuse the token).
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { connectService } from './stdb/sdk';

async function main() {
  const uri = process.env.STDB_URI || 'https://maincloud.spacetimedb.com';
  const module = process.env.STDB_MODULE || 'aftermath-hackutd-dev';
  const { conn, identityHex, token } = await connectService({ uri, module, token: process.env.STDB_SERVICE_TOKEN || undefined });
  const dir = path.join(os.homedir(), '.config', 'aftermath');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `worker-token-${module}`);
  if (!process.env.STDB_SERVICE_TOKEN) await writeFile(file, token + '\n', { mode: 0o600 });
  conn.disconnect();
  process.stdout.write(
    [
      `database:  ${module}`,
      `identity:  ${identityHex}`,
      process.env.STDB_SERVICE_TOKEN ? 'token:     (existing STDB_SERVICE_TOKEN)' : `token:     saved to ${file} (secret; set it as STDB_SERVICE_TOKEN)`,
      '',
      'Send the identity (not the token) to Sidd to register as a worker:',
      `  spacetime call --server maincloud ${module} admin_add_service '"${identityHex}"' '"worker"'`,
      '',
    ].join('\n'),
  );
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(`identity failed: ${(e as Error).message}\n`);
  process.exit(1);
});
