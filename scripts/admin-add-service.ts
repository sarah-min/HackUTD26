// Register a service identity (the AI worker) with the SpacetimeDB module (T2.14).
//
// Usage (Node 24, no dependencies):
//   STDB_URI=https://maincloud.spacetimedb.com STDB_MODULE=<db-name> STDB_ADMIN_TOKEN=<publisher token> \
//     node scripts/admin-add-service.ts [--identity <hex>] [--role worker|admin]
//
// - STDB_ADMIN_TOKEN: the token of the identity that published the module (`init` made it admin).
//   Get it with `spacetime login show --token`. Never commit it.
// - Without --identity, a NEW identity is minted via POST /v1/identity and its token is printed
//   ONCE so you can put it in the worker's env as STDB_SERVICE_TOKEN (password manager / VM env file).
//
// VERIFY (Part 2, when the CLI is available): the HTTP paths below follow SpacetimeDB's v1 HTTP API
// (`POST /v1/identity`, `POST /v1/database/:name/call/:reducer` with a JSON array of args). If the
// call shape differs on Maincloud, use the CLI instead:
//   spacetime call <db-name> admin_add_service '"<identity-hex>"' '"worker"'
//
// Run with Node's built-in TypeScript stripping: `node --experimental-strip-types` on older Node.

const uri = (process.env.STDB_URI ?? '').replace(/^ws/, 'http').replace(/\/$/, '');
const moduleName = process.env.STDB_MODULE ?? '';
const adminToken = process.env.STDB_ADMIN_TOKEN ?? '';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  if (!uri || !moduleName || !adminToken) {
    console.error('Set STDB_URI, STDB_MODULE and STDB_ADMIN_TOKEN (see header comment).');
    process.exit(1);
  }
  const role = arg('role') ?? 'worker';
  if (role !== 'worker' && role !== 'admin') throw new Error('--role must be worker or admin');

  let identity = arg('identity');
  if (!identity) {
    const res = await fetch(`${uri}/v1/identity`, { method: 'POST' });
    if (!res.ok) throw new Error(`POST /v1/identity failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { identity: string; token: string };
    identity = body.identity;
    console.log('New service identity:', identity);
    console.log('STDB_SERVICE_TOKEN (shown once; store it securely, never commit):');
    console.log(body.token);
  }

  const res = await fetch(`${uri}/v1/database/${encodeURIComponent(moduleName)}/call/admin_add_service`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
    body: JSON.stringify([identity, role]),
  });
  if (!res.ok) throw new Error(`admin_add_service failed: ${res.status} ${await res.text()}`);
  console.log(`Registered ${identity} as ${role}.`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
