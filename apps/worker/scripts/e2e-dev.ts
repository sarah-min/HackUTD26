// Live end-to-end check of the Part 3 worker against the DEV database or a local `spacetime start` (no GPU needed).
//   pnpm --filter @hack/worker e2e:dev        (reads ../../.env.local: STDB_SERVICE_TOKEN, optional STDB_URI / STDB_MODULE)
//
// Runs the REAL worker loop (Runner + analyze/verify_identity handlers + SdkServiceConnection + SpacetimeStore) with
// USE_FIXTURES=true model output. Files are stored in SpacetimeDB itself: an anonymous reporter uploads one photo
// (begin_upload + upload_chunk) and files a report; the worker analyzes it; an anonymous affected person uploads a
// placeholder ID image and verifies; every row and file the app reads is checked. Writes test rows (notes
// "P3 E2E TEST (fixture)", assessment source "fixture"). Refuses any database not ending in "-dev" unless STDB_URI
// is localhost. The token is never printed. Exits non-zero if a check fails.
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { normalizeParts } from '@hack/address';
import { createLogger, NimClient } from '@hack/agent';
import { DamageAssessmentSchema } from '@hack/contracts/assessment';
import { DbConnection } from '@hack/stdb-bindings';
import { FFMPEG_PATH } from '@hack/vision';
import { DEV_MODULE, loadEnv } from '../src/env';
import { handlers } from '../src/handlers';
import { Runner } from '../src/runner';
import { SdkServiceConnection } from '../src/stdb/sdk';
import { SpacetimeStore } from '../src/stdb/storage';

const env = loadEnv({ ...process.env, STDB_MODULE: process.env.STDB_MODULE || DEV_MODULE, USE_FIXTURES: 'true' });
const local = /^(https?|wss?):\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(env.STDB_URI);
if (!env.STDB_MODULE.endsWith('-dev') && !local) {
  console.error(`Refusing to run: STDB_MODULE "${env.STDB_MODULE}" is not a -dev database.`);
  process.exit(2);
}

let failures = 0;
function check(label: string, ok: boolean, detail = ''): boolean {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `: ${detail}` : ''}`);
  if (!ok) failures++;
  return ok;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(label: string, fn: () => T | undefined | null | false, ms = 60_000): Promise<T | undefined> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const v = fn();
    if (v) return v as T;
    await sleep(200);
  }
  console.log(`      (timed out after ${ms} ms waiting for: ${label})`);
  return undefined;
}
const sha256 = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');
const hex = (id: { toHexString(): string }) => id.toHexString().toLowerCase().replace(/^0x/, '');

const CHUNK = 512 * 1024;
/** Uploads bytes into SpacetimeDB storage over this client's own connection (same as the web app). */
async function upload(conn: DbConnection, objectKey: string, bytes: Buffer, contentType: string): Promise<void> {
  const chunkCount = Math.ceil(bytes.length / CHUNK);
  await conn.reducers.beginUpload({ objectKey, contentType, sizeBytes: BigInt(bytes.length), sha256: sha256(bytes), chunkCount });
  for (let seq = 0; seq < chunkCount; seq++)
    await conn.reducers.uploadChunk({ objectKey, seq, bytes: new Uint8Array(bytes.subarray(seq * CHUNK, (seq + 1) * CHUNK)) });
}

/** A plain JPEG made with the bundled ffmpeg (the fixture model ignores pixels). */
function testJpeg(color: string): Buffer {
  const r = spawnSync(FFMPEG_PATH, ['-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=640x480`, '-frames:v', '1', '-f', 'mjpeg', 'pipe:1'], { maxBuffer: 8 << 20 });
  if (r.status !== 0 || !r.stdout?.length) throw new Error(`ffmpeg failed: ${r.stderr?.toString().slice(-200)}`);
  return r.stdout;
}

async function anon(name: string, queries: string[]): Promise<{ conn: DbConnection; idHex: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name}: connect timeout`)), 20_000);
    DbConnection.builder()
      .withUri(env.STDB_URI)
      .withDatabaseName(env.STDB_MODULE)
      .onConnect((conn, identity) => {
        conn.subscriptionBuilder()
          .onApplied(() => { clearTimeout(timer); resolve({ conn, idHex: hex(identity) }); })
          .onError(() => { clearTimeout(timer); reject(new Error(`${name}: subscription error`)); })
          .subscribe(queries);
      })
      .onConnectError((_c, err) => { clearTimeout(timer); reject(new Error(`${name}: ${String(err)}`)); })
      .build();
  });
}

// The address on the specimen ID fixture (fixtures/verification/id-fields-specimen.json), so verification can match.
const parts = normalizeParts({ line1: '1234 Main Street', city: 'Dallas', state: 'TX', zip: '75201' });
const address = { ...parts, lat: 32.7811, lng: -96.799, source: 'manual' as const };

async function main(): Promise<void> {
  console.log(`P3 worker e2e → ${env.STDB_URI} / ${env.STDB_MODULE}`);
  const log = createLogger('e2e-worker');
  const stdb = await SdkServiceConnection.connect({ uri: env.STDB_URI, module: env.STDB_MODULE, token: env.STDB_SERVICE_TOKEN });
  check('worker connects with STDB_SERVICE_TOKEN', !!stdb.identityHex, `identity ${stdb.identityHex.slice(0, 12)}…`);
  const storage = new SpacetimeStore(stdb);
  const nim = new NimClient({ baseUrl: 'http://fixtures.invalid/v1', apiKey: '', visionModel: 'fixture', agentModel: 'fixture', useFixtures: true });
  const runner = new Runner({ stdb, storage, nim, log, handlers, concurrency: 2, pollMs: 300 });

  const reporter = await anon('reporter', [
    'SELECT * FROM my_reports', 'SELECT * FROM my_agent_steps', 'SELECT * FROM area_notice',
  ]);
  const R = reporter.conn;
  const mine = (row: { reporter: { toHexString(): string } }) => hex(row.reporter) === reporter.idHex;

  await R.reducers.createReport({
    inputJson: JSON.stringify({ hazard: 'flood', address, selfDanger: false, isSelfReport: false, reporterSecretHash: sha256(randomBytes(32)), notes: 'P3 E2E TEST (fixture)' }),
  });
  const report = await waitFor('report row', () => [...R.db.myReports.iter()].find(mine), 15_000);
  if (!check('reporter creates a report', !!report)) return;
  const reportId = report!.id;
  // > 512 KiB so the upload spans several chunks.
  const photo = Buffer.concat([testJpeg('gray'), randomBytes(700 * 1024)]);
  const photoSha = sha256(photo);
  const photoKey = `media/${reportId}/${photoSha}.jpg`;
  await upload(R, photoKey, photo, 'image/jpeg');
  check('reporter uploads the photo into SpacetimeDB (multi-chunk)', (await storage.getObject(photoKey)).equals(photo), `${photo.length} bytes`);
  await R.reducers.attachMedia({ reportId, kind: 'image', objectKey: photoKey, contentType: 'image/jpeg', sizeBytes: BigInt(photo.length), sha256: photoSha });
  await R.reducers.submitReport({ reportId });
  console.log(`      report ${reportId}, property ${report!.propertyId}`);

  runner.start();
  try {
    const assessed = await waitFor('report status assessed', () => [...R.db.myReports.iter()].find((r) => r.id === reportId && r.status === 'assessed'), 90_000);
    const last = [...R.db.myReports.iter()].find((r) => r.id === reportId);
    if (!check('worker analyzes the report (status → assessed)', !!assessed, `status=${last?.status}`)) return;
    const reporterSteps = [...R.db.myAgentSteps.iter()].filter((s) => s.reportId === reportId);
    check('reporter sees only reporter-visible pipeline steps', reporterSteps.length > 0 && reporterSteps.every((s) => s.visibility === 'reporter'), `${reporterSteps.length} steps`);
    check('frame thumbnail stored in SpacetimeDB', (await storage.getObject(`frames/${reportId}/0.jpg`)).length > 0);
    const notices = [...R.db.areaNotice.iter()];
    check('area notices table readable by an unverified visitor', true, `${notices.length} notices in view`);

    // Affected person verifies with a placeholder ID image (fixture extraction).
    const stranger = await anon('stranger', ['SELECT * FROM my_reports']);
    check('a stranger sees no reports (report is private)', [...stranger.conn.db.myReports.iter()].length === 0);
    const asStranger = await stranger.conn.procedures.readBlob({ objectKey: photoKey, seq: 0 });
    check('an unverified stranger cannot read the footage', !asStranger.ok && asStranger.error === 'forbidden');
    stranger.conn.disconnect();
    const affected = await anon('affected', [
      'SELECT * FROM my_verifications', 'SELECT * FROM my_assessments', 'SELECT * FROM my_frames', 'SELECT * FROM my_agent_steps',
    ]);
    const A = affected.conn;
    await A.reducers.startVerification({ addressJson: JSON.stringify(address), docKind: 'drivers_license', secretHash: sha256(randomBytes(32)) });
    const ver = await waitFor('verification row', () => [...A.db.myVerifications.iter()].at(-1), 15_000);
    if (!check('affected person starts verification', !!ver)) return;
    check('verification matched the report property', ver!.propertyId === report!.propertyId, `ver.property=${ver!.propertyId}`);
    const idKey = `idv/${ver!.id}/doc.jpg`;
    await upload(A, idKey, testJpeg('white'), 'image/jpeg');
    await A.reducers.submitVerification({ verificationId: ver!.id, objectKey: idKey });

    const done = await waitFor('verification decided', () => [...A.db.myVerifications.iter()].find((v) => v.id === ver!.id && (v.state === 'verified' || v.state === 'failed')), 60_000);
    const vNow = [...A.db.myVerifications.iter()].find((v) => v.id === ver!.id);
    check('worker decides the verification (state → verified)', done?.state === 'verified', `state=${vNow?.state}`);
    check('ID image deleted from storage after extraction', await storage.getObject(idKey).then(() => false, () => true));
    const asOwner = await A.procedures.readBlob({ objectKey: photoKey, seq: 0 });
    check('verified person can read the footage from SpacetimeDB', asOwner.ok && asOwner.part?.chunkCount === Math.ceil(photo.length / CHUNK));
    const idAsOwner = await A.procedures.readBlob({ objectKey: idKey, seq: 0 });
    check('nobody can read an ID image back', !idAsOwner.ok);

    const row = await waitFor('my_assessments row', () => [...A.db.myAssessments.iter()].find((a) => a.reportId === reportId), 15_000);
    if (check('verified person sees the assessment', !!row)) {
      const parsed = DamageAssessmentSchema.safeParse(JSON.parse(row!.json));
      check('assessment passes DamageAssessmentSchema (what <DamageReport> renders)', parsed.success, parsed.success ? `level=${parsed.data.overallLevel} source=${parsed.data.source}` : parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    const frames = [...A.db.myFrames.iter()].filter((f) => f.reportId === reportId);
    check('verified person sees the frames', frames.length > 0, `${frames.length} frames`);
    const steps = [...A.db.myAgentSteps.iter()].filter((s) => s.reportId === reportId);
    check('verified person sees the full trace (incl. affected-only steps)', steps.some((s) => s.visibility === 'affected'), `${steps.length} steps`);
    A.disconnect();
  } finally {
    await runner.stop();
    R.disconnect();
    stdb.disconnect();
  }
}

main()
  .then(() => {
    console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
    process.exit(failures ? 1 : 0);
  })
  .catch((e) => {
    console.error(`e2e crashed: ${(e as Error).message}`);
    process.exit(1);
  });
