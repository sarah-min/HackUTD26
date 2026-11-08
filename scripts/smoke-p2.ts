// Part 2 live end-to-end smoke test (reporter → worker → affected person) against the DEV database.
//
// Usage (from repo root):
//   cd scripts && pnpm install --ignore-workspace && pnpm smoke:p2   (typecheck: npx tsc -p .)
//
// Reads STDB_URI, STDB_MODULE, DEV_WORKER_IDENTITY and DEV_WORKER_TOKEN from ../.env.local (gitignored).
// The token is never printed. Hard-fails unless STDB_MODULE ends in "-dev": this script WRITES TEST ROWS
// (a report, frames, an assessment marked source "fixture", a verification for "SPECIMEN PERSON") and
// must never run against the production database. Each run uses a random address so runs don't collide.
//
// Three connections:
//   reporter  : fresh anonymous identity: create_report → attach_media (fake key) → submit_report
//   worker    : DEV_WORKER_TOKEN (service role): svc_* views → claim/record/complete the jobs
//   affected  : fresh anonymous identity: start_verification → submit_verification → reads my_* views
// Exits non-zero if any check fails.
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DbConnection } from '@hack/stdb-bindings';
import { normalizeParts } from '@hack/address';

// ---------- env ----------
const here = dirname(fileURLToPath(import.meta.url));
function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith('#')) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = loadEnv(join(here, '..', '.env.local'));
const STDB_URI = env.STDB_URI ?? '';
const STDB_MODULE = env.STDB_MODULE ?? '';
const WORKER_TOKEN = env.DEV_WORKER_TOKEN ?? '';
const WORKER_IDENTITY = (env.DEV_WORKER_IDENTITY ?? '').toLowerCase().replace(/^0x/, '');
if (!STDB_URI || !STDB_MODULE || !WORKER_TOKEN || !WORKER_IDENTITY) {
  console.error('Missing STDB_URI / STDB_MODULE / DEV_WORKER_IDENTITY / DEV_WORKER_TOKEN in .env.local');
  process.exit(2);
}
if (!STDB_MODULE.endsWith('-dev')) {
  console.error(`Refusing to run: STDB_MODULE "${STDB_MODULE}" is not a -dev database.`);
  process.exit(2);
}

// ---------- tiny test harness ----------
let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `: ${detail}` : ''}`);
  if (!ok) failures++;
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function waitFor<T>(label: string, fn: () => T | undefined | null | false, ms = 15000): Promise<T | undefined> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const v = fn();
    if (v) return v as T;
    await sleep(100);
  }
  console.log(`      (timed out after ${ms} ms waiting for: ${label})`);
  return undefined;
}
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const hex = (id: { toHexString(): string }) => id.toHexString().toLowerCase().replace(/^0x/, '');

type Conn = DbConnection;
async function connect(name: string, token: string | undefined, queries: string[]): Promise<{ conn: Conn; idHex: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name}: connect/subscribe timeout`)), 20000);
    let b = DbConnection.builder()
      .withUri(STDB_URI)
      .withDatabaseName(STDB_MODULE)
      .onConnect((conn, identity) => {
        conn
          .subscriptionBuilder()
          .onApplied(() => {
            clearTimeout(timer);
            resolve({ conn, idHex: hex(identity) });
          })
          .onError((_ctx: unknown) => {
            clearTimeout(timer);
            reject(new Error(`${name}: subscription error`));
          })
          .subscribe(queries);
      })
      .onConnectError((_ctx, err) => {
        clearTimeout(timer);
        reject(new Error(`${name}: connect error ${String(err)}`));
      });
    if (token) b = b.withToken(token);
    b.build();
  });
}

async function call(label: string, p: Promise<void>): Promise<boolean> {
  try {
    await p;
    return true;
  } catch (e) {
    check(`reducer ${label}`, false, String((e as Error)?.message ?? e));
    return false;
  }
}

// ---------- fixture address (random per run so runs never match an old property) ----------
const houseNo = 1000 + Math.floor(Math.random() * 8000);
const lat = 32.70 + Math.random() * 0.15;
const lng = -96.90 + Math.random() * 0.15;
const parts = normalizeParts({ line1: `${houseNo} Elm Street`, city: 'Dallas', state: 'TX', zip: '75201' });
const address = { ...parts, lat, lng, source: 'manual' as const };

async function main(): Promise<void> {
  console.log(`Smoke test → ${STDB_URI} / ${STDB_MODULE}  (address: ${parts.normalized})`);

  const reporter = await connect('reporter', undefined, [
    'SELECT * FROM report',
    'SELECT * FROM area_cell_summary',
    'SELECT * FROM my_reports',
    'SELECT * FROM my_agent_steps',
    'SELECT * FROM my_frames',
    'SELECT * FROM my_assessments',
    'SELECT * FROM my_report_privates',
  ]);
  const worker = await connect('worker', WORKER_TOKEN, [
    'SELECT * FROM svc_jobs',
    'SELECT * FROM svc_report_privates',
    'SELECT * FROM svc_property_privates',
    'SELECT * FROM svc_media_assets',
    'SELECT * FROM svc_verifications',
  ]);
  check('worker connects as DEV_WORKER_IDENTITY', worker.idHex === WORKER_IDENTITY);
  const affected = await connect('affected', undefined, [
    'SELECT * FROM report',
    'SELECT * FROM area_cell_summary',
    'SELECT * FROM my_verifications',
    'SELECT * FROM my_property_privates',
    'SELECT * FROM my_report_privates',
    'SELECT * FROM my_frames',
    'SELECT * FROM my_assessments',
    'SELECT * FROM my_agent_steps',
  ]);
  check('three distinct identities', new Set([reporter.idHex, worker.idHex, affected.idHex]).size === 3);

  const R = reporter.conn;
  const W = worker.conn;
  const A = affected.conn;

  // Track the reporter's report status transitions live, via callbacks.
  const transitions: string[] = [];
  let claimedLive = false;
  const mine = (row: { reporter: { toHexString(): string } }) => hex(row.reporter) === reporter.idHex;
  R.db.report.onInsert((_c, row) => {
    if (mine(row)) transitions.push(row.status);
  });
  R.db.report.onUpdate((_c, oldRow, row) => {
    if (!mine(row)) return;
    if (row.status !== oldRow.status) transitions.push(row.status);
    if (!oldRow.claimed && row.claimed) claimedLive = true;
  });

  // ---------- (a) reporter ----------
  const reporterSecretHash = sha256(randomBytes(32));
  const ok = await call(
    'create_report',
    R.reducers.createReport({
      inputJson: JSON.stringify({ hazard: 'hurricane_wind', address, selfDanger: false, isSelfReport: false, reporterSecretHash, notes: 'SMOKE TEST (fixture)' }),
    })
  );
  if (!ok) return;
  const report = await waitFor('report row', () => [...R.db.report.iter()].find(mine));
  if (!report) return check('report created', false);
  const reportId = report.id;
  check('create_report → report row visible to reporter', true, `id=${reportId} cell=${report.cellId}`);
  check('report starts unclaimed', report.claimed === false);

  const mediaSha = sha256(`smoke-${reportId}-${Date.now()}`);
  await call(
    'attach_media',
    R.reducers.attachMedia({ reportId, kind: 'video', objectKey: `media/${reportId}/${mediaSha}.mp4`, contentType: 'video/mp4', sizeBytes: 1000n, sha256: mediaSha })
  );
  await call('submit_report', R.reducers.submitReport({ reportId }));

  // ---------- (b) worker: analyze ----------
  const job = await waitFor('analyze job in svc_jobs', () =>
    [...W.db.svcJobs.iter()].find(j => j.kind === 'analyze' && j.reportId === reportId && j.state === 'queued')
  );
  check('worker sees the analyze job live (svc_jobs)', !!job);
  if (!job) return;
  check('svc_report_privates has the report', [...W.db.svcReportPrivates.iter()].some(r => r.reportId === reportId));
  check('svc_media_assets has the media', [...W.db.svcMediaAssets.iter()].some(m => m.reportId === reportId));
  check('svc_property_privates has the property', [...W.db.svcPropertyPrivates.iter()].some(p => p.propertyId === report.propertyId));

  await call('claim_job(analyze)', W.reducers.claimJob({ jobId: job.id, leaseMs: 60000 }));
  const leased = await waitFor('lease visible', () =>
    [...W.db.svcJobs.iter()].find(j => j.id === job.id && j.state === 'leased' && j.leaseOwner && hex(j.leaseOwner) === worker.idHex)
  );
  check('worker sees its own lease (leaseOwner == self)', !!leased);

  for (const i of [0, 1]) {
    await call(
      `record_frame ${i}`,
      W.reducers.recordFrame({
        reportId,
        frameIndex: i,
        tSec: i * 4,
        thumbKey: `frames/${reportId}/${i}.jpg`,
        findingJson: JSON.stringify({ source: 'fixture', frameIndex: i, tSec: i * 4, usable: true, components: [], lifeSafety: [], caption: 'SMOKE TEST fixture frame' }),
      })
    );
  }
  await call(
    'record_agent_step (reporter)',
    W.reducers.recordAgentStep({ reportId, seq: 1, kind: 'pipeline', name: 'extract_frames', summary: 'Extracted 2 frames (smoke fixture)', visibility: 'reporter', durationMs: 12 })
  );
  await call(
    'record_agent_step (affected)',
    W.reducers.recordAgentStep({ reportId, seq: 2, kind: 'tool_call', name: 'estimate_repair_cost', summary: 'cost lines (smoke fixture)', visibility: 'affected', durationMs: undefined })
  );
  await call(
    'record_assessment',
    W.reducers.recordAssessment({
      reportId,
      json: JSON.stringify({ source: 'fixture', reportId: String(reportId), overallLevel: 'major', lifeSafety: ['downed_power_line'], summary: 'SMOKE TEST fixture assessment' }),
      overallLevel: 'major',
      usableFrames: 2,
      totalFrames: 2,
      lifeSafetyCsv: 'downed_power_line',
    })
  );
  await call('complete_job(analyze)', W.reducers.completeJob({ jobId: job.id, ok: true, error: undefined }));

  await waitFor('status assessed', () => transitions.includes('assessed'));
  const want = ['draft', 'queued', 'processing', 'assessed'];
  check('reporter sees status draft→queued→processing→assessed LIVE', want.every((s, i) => transitions[i] === s), transitions.join('→'));

  await waitFor('reporter agent step', () => [...R.db.myAgentSteps.iter()].some(s => s.reportId === reportId));
  const rSteps = [...R.db.myAgentSteps.iter()].filter(s => s.reportId === reportId);
  check('reporter my_agent_steps: only reporter-visibility steps', rSteps.length >= 1 && rSteps.every(s => s.visibility === 'reporter'), `${rSteps.length} step(s): ${rSteps.map(s => s.visibility).join(',')}`);
  check('reporter my_frames empty', ![...R.db.myFrames.iter()].some(f => f.reportId === reportId));
  check('reporter my_assessments empty', ![...R.db.myAssessments.iter()].some(a => a.reportId === reportId));

  // ---------- (c) affected person ----------
  check('affected BEFORE verify: my_frames empty', ![...A.db.myFrames.iter()].some(f => f.reportId === reportId));
  check('affected BEFORE verify: my_assessments empty', ![...A.db.myAssessments.iter()].some(a => a.reportId === reportId));

  await call(
    'start_verification',
    A.reducers.startVerification({ addressJson: JSON.stringify(address), docKind: 'drivers_license', secretHash: sha256(randomBytes(32)) })
  );
  const ver = await waitFor('my_verifications row', () => [...A.db.myVerifications.iter()][0]);
  check('affected sees its verification row', !!ver);
  if (!ver) return;
  check('verification matched the report property', ver.propertyId === report.propertyId, `ver.property=${ver.propertyId} report.property=${report.propertyId}`);
  await call('submit_verification', A.reducers.submitVerification({ verificationId: ver.id, objectKey: `idv/${ver.id}/doc.jpg` }));

  const vjob = await waitFor('verify_identity job', () =>
    [...W.db.svcJobs.iter()].find(j => j.kind === 'verify_identity' && j.verificationId === ver.id && j.state === 'queued')
  );
  check('worker sees the verify_identity job live', !!vjob);
  check('svc_verifications has the verification', [...W.db.svcVerifications.iter()].some(v => v.id === ver.id));
  if (!vjob) return;
  await call('claim_job(verify)', W.reducers.claimJob({ jobId: vjob.id, leaseMs: 60000 }));
  await waitFor('verify lease', () => [...W.db.svcJobs.iter()].find(j => j.id === vjob.id && j.state === 'leased'));
  await call('record_verification', W.reducers.recordVerification({ verificationId: ver.id, ok: true, failReason: undefined, nameOnDoc: 'SPECIMEN PERSON' }));
  await call('complete_job(verify)', W.reducers.completeJob({ jobId: vjob.id, ok: true, error: undefined }));

  const verified = await waitFor('verified', () => [...A.db.myVerifications.iter()].find(v => v.id === ver.id && v.state === 'verified'));
  check('affected sees state=verified live', !!verified);
  const frames = await waitFor('frames after verify', () => {
    const f = [...A.db.myFrames.iter()].filter(x => x.reportId === reportId);
    return f.length === 2 ? f : undefined;
  });
  check('affected AFTER verify: my_frames has the 2 frames (views refresh live)', !!frames);
  const asmt = await waitFor('assessment after verify', () => [...A.db.myAssessments.iter()].find(a => a.reportId === reportId));
  check('affected AFTER verify: my_assessments has the assessment', !!asmt);
  const aSteps = await waitFor('affected steps', () => {
    const s = [...A.db.myAgentSteps.iter()].filter(x => x.reportId === reportId);
    return s.length >= 2 ? s : undefined;
  });
  check('affected AFTER verify: my_agent_steps includes affected-visibility steps', !!aSteps && aSteps.some(s => s.visibility === 'affected'));
  check('affected AFTER verify: my_property_privates has the property', !![...A.db.myPropertyPrivates.iter()].find(p => p.propertyId === report.propertyId));

  await waitFor('claimed live', () => claimedLive);
  check('report.claimed flips to true LIVE for the reporter', claimedLive);

  const cell = await waitFor('area cell', () => [...R.db.areaCellSummary.iter()].find(c => c.cellId === report.cellId));
  check('area_cell_summary has the cell with hazard count ≥1', !!cell && cell.hazardReportCount72H >= 1, cell ? `reports=${cell.reportCount72H} hazards=${cell.hazardReportCount72H} severe=${cell.severeHazardCount72H}` : 'no cell');

  const drained = await waitFor('svc views drained', () => {
    const jobsLeft = [...W.db.svcJobs.iter()].some(j => j.id === job.id || j.id === vjob.id);
    const rp = [...W.db.svcReportPrivates.iter()].some(r => r.reportId === reportId);
    const ma = [...W.db.svcMediaAssets.iter()].some(m => m.reportId === reportId);
    const vv = [...W.db.svcVerifications.iter()].some(v => v.id === ver.id);
    return !jobsLeft && !rp && !ma && !vv;
  });
  check('worker svc_* views drop the rows after jobs complete', !!drained);

  for (const c of [R, W, A]) c.disconnect();
}

main()
  .catch(e => {
    check('unexpected error', false, String((e as Error)?.stack ?? e));
  })
  .finally(() => {
    console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  });
