/**
 * Verify that a SpacetimeDB token maps to a registered service identity. Read-only probe.
 *
 *   pnpm verify:identity -- <token-env-var-name> [database]
 *   e.g. STDB_SERVICE_TOKEN=... pnpm verify:identity -- STDB_SERVICE_TOKEN
 *        STDB_WEB_TOKEN=...     pnpm verify:identity -- STDB_WEB_TOKEN aftermath-hackutd
 *
 * Prints the identity hex the token connects as (compare it with the one registered), and probes the
 * service-only reducer claim_job with a job id that does not exist: a registered worker/admin gets a
 * "no such job"-style error, anyone else gets "service only". A `web` identity also gets "service only"
 * (correct: web is not a worker); for web, the identity hex match is the proof.
 * The token is never printed. Default database: aftermath-hackutd-dev.
 */
import { DbConnection } from '@hack/stdb-bindings';

const varName = process.argv.slice(2).find(a => a !== '--') ?? 'STDB_SERVICE_TOKEN';
const database = process.argv.slice(2).filter(a => a !== '--')[1] ?? 'aftermath-hackutd-dev';
const token = process.env[varName];
if (!token) {
  console.error(`Env var ${varName} is empty. Export your token first (never paste it into chat).`);
  process.exit(1);
}

const conn: any = await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timed out connecting')), 15_000);
  DbConnection.builder()
    .withUri('https://maincloud.spacetimedb.com')
    .withDatabaseName(database)
    .withToken(token)
    .onConnect((c: any, identity: { toHexString(): string }) => {
      clearTimeout(t);
      console.log(`database:  ${database}`);
      console.log(`identity:  ${identity.toHexString()}`);
      resolve(c);
    })
    .onConnectError((_c: any, err: Error) => reject(err))
    .build();
});

let probe: string;
try {
  await conn.reducers.claimJob({ jobId: 999_999_999n, leaseMs: 1000 });
  probe = 'unexpected success';
} catch (e) {
  probe = e instanceof Error ? e.message : String(e);
}
console.log(`probe:     ${probe}`);
console.log(/service only/i.test(probe) ? 'result:    NOT a worker/admin (expected for web role; for a worker this is WRONG: not registered)' : 'result:    registered as worker/admin');
conn.disconnect();
process.exit(0);
