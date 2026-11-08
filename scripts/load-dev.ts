// Part 2 load + abuse probe against the DEV database only. Writes tiny fixture rows (draft reports with one fake
// media row, never submitted, so no jobs are queued). There is no delete reducer, so rows remain in dev.
//
//   cd scripts && pnpm install --ignore-workspace && pnpm load:dev            (default N=20, max 50)
//   pnpm load:dev -- --n 30
//
// Reads STDB_URI + STDB_MODULE from ../.env.local. Refuses unless STDB_MODULE ends in "-dev".
// Phase 1: N parallel anonymous reporters: connect+subscribe, create_report, attach_media, and time how long
//          until the reporter's own rows arrive via the my_* subscription.
// Phase 2: ONE identity spams start_verification (expects rate_limited after 5 in an hour).
// Phase 3: garbage / oversize inputs from one identity (expects clean reducer errors, no crash).
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DbConnection } from '@hack/stdb-bindings';
import { normalizeParts } from '@hack/address';

const here = dirname(fileURLToPath(import.meta.url));
function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !line.trimStart().startsWith('#')) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
    }
  } catch {
    // reason: .env.local optional when vars come from the shell
  }
  return out;
}
const env = { ...loadEnv(join(here, '..', '.env.local')), ...process.env } as Record<string, string | undefined>;
const URI = env.STDB_URI ?? '';
const MODULE = env.STDB_MODULE ?? '';
if (!URI || !MODULE) {
  console.error('Missing STDB_URI / STDB_MODULE (../.env.local).');
  process.exit(2);
}
if (!MODULE.endsWith('-dev')) {
  console.error(`Refusing to run: STDB_MODULE "${MODULE}" is not a -dev database.`);
  process.exit(2);
}
const argN = process.argv.indexOf('--n');
const N = Math.max(1, Math.min(50, argN > -1 ? Number(process.argv[argN + 1]) || 20 : 20));

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const now = () => performance.now();
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const pct = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]! : NaN);
const fmt = (ms: number) => (Number.isNaN(ms) ? 'n/a' : `${ms.toFixed(0)} ms`);
const hex = (id: { toHexString(): string }) => id.toHexString().toLowerCase().replace(/^0x/, '');

const MY_QUERIES = [
  'SELECT * FROM my_reports',
  'SELECT * FROM my_report_privates',
  'SELECT * FROM my_agent_steps',
  'SELECT * FROM my_frames',
  'SELECT * FROM my_assessments',
  'SELECT * FROM my_verifications',
  'SELECT * FROM area_cell_summary',
];

async function connect(): Promise<{ conn: DbConnection; idHex: string; ms: number }> {
  const t0 = now();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connect/subscribe timeout')), 30000);
    DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(MODULE)
      .onConnect((conn, identity) => {
        conn
          .subscriptionBuilder()
          .onApplied(() => {
            clearTimeout(timer);
            resolve({ conn, idHex: hex(identity), ms: now() - t0 });
          })
          .onError(() => {
            clearTimeout(timer);
            reject(new Error('subscription error'));
          })
          .subscribe(MY_QUERIES);
      })
      .onConnectError((_c, err) => {
        clearTimeout(timer);
        reject(new Error(`connect error ${String(err)}`));
      })
      .build();
  });
}

async function timed(p: Promise<void>): Promise<{ ms: number; err?: string }> {
  const t0 = now();
  try {
    await p;
    return { ms: now() - t0 };
  } catch (e) {
    return { ms: now() - t0, err: String((e as Error)?.message ?? e) };
  }
}

function addr(i: number) {
  const parts = normalizeParts({ line1: `${5000 + Math.floor(Math.random() * 4000)} Load Test Ln`, city: 'Dallas', state: 'TX', zip: '75201' });
  return { ...parts, lat: 32.78 + (i % 10) * 0.001, lng: -96.8 + Math.floor(i / 10) * 0.001, source: 'manual' as const };
}

const errorsByKind = new Map<string, number>();
const noteErr = (label: string, e?: string) => {
  if (e) errorsByKind.set(`${label}: ${e.slice(0, 80)}`, (errorsByKind.get(`${label}: ${e.slice(0, 80)}`) ?? 0) + 1);
};

async function phase1(): Promise<void> {
  console.log(`\n== Phase 1: ${N} parallel reporters → ${URI} / ${MODULE}`);
  const wall0 = now();
  const conns = await Promise.allSettled(Array.from({ length: N }, () => connect()));
  const up = conns.filter((c): c is PromiseFulfilledResult<Awaited<ReturnType<typeof connect>>> => c.status === 'fulfilled').map(c => c.value);
  for (const c of conns) if (c.status === 'rejected') noteErr('connect', String(c.reason));
  const connectMs = up.map(u => u.ms);

  const create: number[] = [];
  const attach: number[] = [];
  const toView: number[] = [];

  await Promise.all(
    up.map(async (u, i) => {
      const R = u.conn;
      const mine = (row: { reporter: { toHexString(): string } }) => hex(row.reporter) === u.idHex;
      let tRep = 0;
      let reportId: bigint | undefined;
      const sawReport = new Promise<void>(res => {
        R.db.myReports.onInsert((_c, row) => {
          if (mine(row as never)) {
            toView.push(now() - tRep);
            reportId = row.id;
            res();
          }
        });
      });
      tRep = now();
      const r = await timed(
        R.reducers.createReport({
          inputJson: JSON.stringify({ hazard: 'hurricane_wind', address: addr(i), selfDanger: false, isSelfReport: false, reporterSecretHash: sha256(randomBytes(16).toString('hex')), notes: 'LOAD TEST (fixture)' }),
        })
      );
      create.push(r.ms);
      noteErr('create_report', r.err);
      if (r.err) return;
      await Promise.race([sawReport, sleep(15000)]);
      if (reportId === undefined) {
        noteErr('view', 'my_reports row never arrived in 15s');
        return;
      }
      const s = sha256(`load-${reportId}-${Math.random()}`);
      const a = await timed(
        (async () => {
          await R.reducers.beginUpload({ objectKey: `media/${reportId}/${s}.mp4`, contentType: 'video/mp4', sizeBytes: 1000n, sha256: s, chunkCount: 1 });
          await R.reducers.uploadChunk({ objectKey: `media/${reportId}/${s}.mp4`, seq: 0, bytes: new Uint8Array(1000) });
          return R.reducers.attachMedia({ reportId, kind: 'video', objectKey: `media/${reportId}/${s}.mp4`, contentType: 'video/mp4', sizeBytes: 1000n, sha256: s });
        })()
      );
      attach.push(a.ms);
      noteErr('attach_media', a.err);
    })
  );

  const wall = now() - wall0;
  console.log(`connected ${up.length}/${N}; whole phase ${fmt(wall)}`);
  console.table([
    { metric: 'connect+subscribe', n: connectMs.length, p50: fmt(pct(connectMs, 50)), p95: fmt(pct(connectMs, 95)), max: fmt(Math.max(...connectMs)) },
    { metric: 'create_report reducer', n: create.length, p50: fmt(pct(create, 50)), p95: fmt(pct(create, 95)), max: fmt(Math.max(...create)) },
    { metric: 'create → my_reports row arrives', n: toView.length, p50: fmt(pct(toView, 50)), p95: fmt(pct(toView, 95)), max: fmt(Math.max(...toView)) },
    { metric: 'attach_media reducer', n: attach.length, p50: fmt(pct(attach, 50)), p95: fmt(pct(attach, 95)), max: fmt(Math.max(...attach)) },
  ]);
  for (const u of up) u.conn.disconnect();
}

async function phase2(): Promise<void> {
  console.log('\n== Phase 2: one identity spams start_verification (limit expected: 3/hour)');
  const u = await connect();
  const results: string[] = [];
  for (let i = 0; i < 8; i++) {
    const r = await timed(
      u.conn.reducers.startVerification({ addressJson: JSON.stringify(addr(i)), docKind: 'drivers_license', secretHash: sha256(randomBytes(16).toString('hex')) })
    );
    results.push(r.err ? `#${i + 1} ERR ${r.err.slice(0, 60)}` : `#${i + 1} ok`);
  }
  console.log(results.join('\n'));
  const okCount = results.filter(r => r.endsWith('ok')).length;
  const limited = results.filter(r => /rate_limited/.test(r)).length;
  console.log(okCount === 3 && limited === 5 ? 'PASS rate limit: 3 accepted, 5 rejected with rate_limited' : `NOTE: accepted=${okCount} rate_limited=${limited} (a previous run within the hour consumes the budget only per identity; this identity is fresh)`);
  u.conn.disconnect();
}

async function phase3(): Promise<void> {
  console.log('\n== Phase 3: garbage / oversize inputs (each should be rejected cleanly)');
  const u = await connect();
  const C = u.conn;
  const good = { hazard: 'flood', address: addr(0), selfDanger: false, isSelfReport: false, reporterSecretHash: sha256('x') };
  const cases: [string, () => Promise<void>][] = [
    ['create_report: not JSON', () => C.reducers.createReport({ inputJson: 'not json {{{' })],
    ['create_report: empty object', () => C.reducers.createReport({ inputJson: '{}' })],
    ['create_report: JSON array', () => C.reducers.createReport({ inputJson: '[1,2,3]' })],
    ['create_report: bad hazard', () => C.reducers.createReport({ inputJson: JSON.stringify({ ...good, hazard: 'zombies' }) })],
    ['create_report: 10 KB address line', () => C.reducers.createReport({ inputJson: JSON.stringify({ ...good, address: { ...addr(0), line1: 'A'.repeat(10_000) } }) })],
    ['create_report: lat out of range', () => C.reducers.createReport({ inputJson: JSON.stringify({ ...good, address: { ...addr(0), lat: 999 } }) })],
    ['create_report: bad secret hash', () => C.reducers.createReport({ inputJson: JSON.stringify({ ...good, reporterSecretHash: 'zz' }) })],
    ['create_report: 200 KB notes', () => C.reducers.createReport({ inputJson: JSON.stringify({ ...good, notes: 'N'.repeat(200_000) }) })],
    ['attach_media: nonexistent report', () => C.reducers.attachMedia({ reportId: 999999999n, kind: 'video', objectKey: 'media/999999999/x.mp4', contentType: 'video/mp4', sizeBytes: 1n, sha256: sha256('a') })],
    ['start_verification: not JSON', () => C.reducers.startVerification({ addressJson: '}{', docKind: 'drivers_license', secretHash: sha256('y') })],
    ['start_verification: bad docKind', () => C.reducers.startVerification({ addressJson: JSON.stringify(addr(1)), docKind: 'passport_of_doom', secretHash: sha256('y') })],
    ['start_verification: 1 MB address JSON', () => C.reducers.startVerification({ addressJson: JSON.stringify({ ...addr(1), line1: 'B'.repeat(1_000_000) }), docKind: 'drivers_license', secretHash: sha256('y') })],
    ['ask_coach: unverified caller', () => C.reducers.askCoach({ propertyId: 1n, reportId: 1n, text: 'hi' })],
    ['worker reducer as non-service (claim_job)', () => C.reducers.claimJob({ jobId: 1n, leaseMs: 1000 })],
  ];
  let bad = 0;
  for (const [label, fn] of cases) {
    const r = await timed(fn());
    const rejected = !!r.err;
    if (!rejected) bad++;
    console.log(`${rejected ? 'rejected' : 'ACCEPTED'}  ${label}  (${fmt(r.ms)})${r.err ? '  → ' + r.err.slice(0, 90) : ''}`);
  }
  console.log(bad ? `NOTE: ${bad} input(s) accepted that probably should be rejected (see ACCEPTED lines).` : 'PASS: every garbage input rejected');
  // Is the connection still alive after the big payloads?
  const alive = await timed(C.reducers.createReport({ inputJson: JSON.stringify({ ...good, notes: 'LOAD TEST post-abuse (fixture)' }) }));
  console.log(alive.err ? `connection state after abuse: reducer failed → ${alive.err.slice(0, 90)}` : 'connection still healthy after abuse');
  C.disconnect();
}

async function main(): Promise<void> {
  await phase1();
  await phase2();
  await phase3();
  if (errorsByKind.size) {
    console.log('\n== Errors seen in phase 1');
    for (const [k, v] of errorsByKind) console.log(`${v}×  ${k}`);
  }
  console.log('\nRows left in dev (no delete reducer): ~N draft reports + ≤8 verifications + a few garbage-case rows. All labelled fixture/LOAD TEST.');
  process.exit(0);
}
main().catch(e => {
  console.error(e);
  process.exit(1);
});
