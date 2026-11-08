// Live smoke test for email accounts (enroll -> sign out -> sign in on a second identity -> step-up) against the DEV
// database only, in DEMO mode (no email is sent; codes are read from the my_demo_code view).
//
// Usage:  cd scripts && pnpm install --ignore-workspace && pnpm smoke:accounts     (typecheck: npx tsc -p .)
//
// Needs: ../.env.local (STDB_URI, STDB_MODULE ending in -dev, DEV_WORKER_IDENTITY, DEV_WORKER_TOKEN) and the `spacetime`
// CLI logged in as the dev ADMIN (it calls admin_set_email_config with that login; no admin token is read or printed).
// Hard-fails on a non -dev database. It writes only its own test rows (a random address, a report marked fixture-like by
// "SMOKE TEST" notes, a verification for "SPECIMEN PERSON", one account) and deletes the account at the end. It claims
// ONLY the two jobs it creates (by id), never anyone else's. Takes ~2 minutes (30 s resend cooldowns).
// Leaves email_config in demo mode with require_stepup = false (safe: the web UI doesn't require step-up yet).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DbConnection } from '@hack/stdb-bindings';
import { normalizeParts } from '@hack/address';

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
if (!STDB_URI || !STDB_MODULE || !WORKER_TOKEN) {
  console.error('Missing STDB_URI / STDB_MODULE / DEV_WORKER_TOKEN in .env.local');
  process.exit(2);
}
if (!STDB_MODULE.endsWith('-dev')) {
  console.error(`Refusing to run: STDB_MODULE "${STDB_MODULE}" is not a -dev database.`);
  process.exit(2);
}

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
const j = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
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

/** admin_set_email_config via the CLI login (Option args are {"some":v} / {"none":[]}). Never prints anything secret. */
function setConfig(mode: 'demo', requireStepup: boolean): void {
  const none = '{"none":[]}';
  execFileSync(
    'spacetime',
    ['call', '--server', 'maincloud', STDB_MODULE, 'admin_set_email_config', JSON.stringify(mode), none, none, JSON.stringify({ some: requireStepup }), none],
    { stdio: ['ignore', 'ignore', 'inherit'] }
  );
}

const MY = [
  'my_account', 'my_devices', 'my_stepup', 'my_email_challenge', 'my_demo_code', 'my_auth_status',
  'my_property_reports', 'my_assessments', 'my_media_assets', 'my_verifications', 'my_property_privates',
].map(v => `SELECT * FROM ${v}`);

const houseNo = 1000 + Math.floor(Math.random() * 8000);
const parts = normalizeParts({ line1: `${houseNo} Cedar Street`, city: 'Dallas', state: 'TX', zip: '75201' });
const address = { ...parts, lat: 32.7 + Math.random() * 0.15, lng: -96.9 + Math.random() * 0.15, source: 'manual' as const };
// example.com is a reserved domain that never receives mail (and demo mode sends nothing anyway). Random local parts so
// reruns don't hit the per-email hourly limit. Mixed case on purpose: the module lowercases before hashing.
const rnd = () => randomBytes(4).toString('hex');
const EMAIL_A = `Smoke.${rnd()}@Example.com`;
const EMAIL_B = `smoke.${rnd()}@example.com`; // never enrolled: used for the decoy check
const maskedA = (() => { const n = EMAIL_A.toLowerCase(); return `${n[0]}***${n.slice(n.indexOf('@'))}`; })();

async function main(): Promise<void> {
  console.log(`Account smoke → ${STDB_URI} / ${STDB_MODULE}  (address: ${parts.normalized})`);
  setConfig('demo', false);

  const reporter = await connect('reporter', undefined, ['SELECT * FROM my_reports']);
  const worker = await connect('worker', WORKER_TOKEN, ['SELECT * FROM svc_jobs']);
  const owner = await connect('owner', undefined, MY);
  const O = owner.conn;
  const W = worker.conn;
  const R = reporter.conn;
  const status = await waitFor('auth status', () => [...O.db.myAuthStatus.iter()][0]);
  check('my_auth_status says demo mode', status?.mode === 'demo' && status.configured, j(status));

  // ---- a report + a verified owner (via the dev worker, claiming only these two jobs) ----
  await R.reducers.createReport({
    inputJson: JSON.stringify({ hazard: 'hurricane_wind', address, selfDanger: false, isSelfReport: false, reporterSecretHash: sha256(randomBytes(32)), notes: 'SMOKE TEST (accounts)' }),
  });
  const report = await waitFor('report', () => [...R.db.myReports.iter()][0]);
  if (!report) return check('report created', false);
  const key = `media/${report.id}/${sha256(`acct-${report.id}`)}.jpg`;
  await R.reducers.beginUpload({ objectKey: key, contentType: 'image/jpeg', sizeBytes: 1000n, sha256: sha256('x'), chunkCount: 1 });
  await R.reducers.uploadChunk({ objectKey: key, seq: 0, bytes: new Uint8Array(1000) });
  await R.reducers.attachMedia({ reportId: report.id, kind: 'image', objectKey: key, contentType: 'image/jpeg', sizeBytes: 1000n, sha256: sha256('x') });
  await R.reducers.submitReport({ reportId: report.id });
  const job = await waitFor('analyze job', () => [...W.db.svcJobs.iter()].find(j => j.kind === 'analyze' && j.reportId === report.id && j.state === 'queued'));
  if (!job) return check('analyze job seen', false);
  await W.reducers.claimJob({ jobId: job.id, leaseMs: 60000 });
  await W.reducers.recordAssessment({
    reportId: report.id,
    json: JSON.stringify({ source: 'fixture', reportId: String(report.id), overallLevel: 'major', summary: 'SMOKE TEST fixture assessment' }),
    overallLevel: 'major', usableFrames: 1, totalFrames: 1, lifeSafetyCsv: '',
  });
  await W.reducers.completeJob({ jobId: job.id, ok: true, error: undefined });

  await O.reducers.startVerification({ addressJson: JSON.stringify(address), docKind: 'drivers_license', secretHash: sha256(randomBytes(32)) });
  const ver = await waitFor('verification', () => [...O.db.myVerifications.iter()][0]);
  if (!ver) return check('verification row', false);
  await O.reducers.beginUpload({ objectKey: `idv/${ver.id}/doc.jpg`, contentType: 'image/jpeg', sizeBytes: 1000n, sha256: sha256('specimen'), chunkCount: 1 });
  await O.reducers.uploadChunk({ objectKey: `idv/${ver.id}/doc.jpg`, seq: 0, bytes: new Uint8Array(1000) });
  await O.reducers.submitVerification({ verificationId: ver.id, objectKey: `idv/${ver.id}/doc.jpg` });
  const vjob = await waitFor('verify job', () => [...W.db.svcJobs.iter()].find(j => j.kind === 'verify_identity' && j.verificationId === ver.id && j.state === 'queued'));
  if (!vjob) return check('verify job seen', false);
  await W.reducers.claimJob({ jobId: vjob.id, leaseMs: 60000 });
  await W.reducers.recordVerification({ verificationId: ver.id, ok: true, failReason: undefined, nameOnDoc: 'SPECIMEN PERSON' });
  await W.reducers.completeJob({ jobId: vjob.id, ok: true, error: undefined });
  const verified = await waitFor('verified', () => [...O.db.myVerifications.iter()].find(v => v.id === ver.id && v.state === 'verified'));
  check('owner is verified for the property', !!verified);
  await waitFor('owner reports', () => [...O.db.myPropertyReports.iter()].length > 0);
  check('require_stepup off: owner (no account) sees the full report', [...O.db.myPropertyReports.iter()].length === 1 && [...O.db.myAssessments.iter()].length === 1);

  // ---- enroll ----
  const reqE = await O.procedures.requestEmailCode({ email: EMAIL_A, purpose: 'enroll' });
  check('request enroll code', reqE.ok, reqE.error);
  const ch = await waitFor('challenge row', () => [...O.db.myEmailChallenge.iter()][0]);
  check('my_email_challenge: purpose enroll, 5 attempts left, delivery demo', ch?.purpose === 'enroll' && ch.attemptsLeft === 5 && ch.deliveryState === 'demo', j({ ...ch, expiresAt: undefined }));
  const demo = await waitFor('demo code', () => [...O.db.myDemoCode.iter()][0]);
  check('demo code visible to the requester (6 digits)', !!demo && /^\d{6}$/.test(demo.code));
  const wrong = await O.procedures.verifyEmailCode({ challengeId: reqE.challengeId, code: demo!.code === '000000' ? '000001' : '000000' });
  check('wrong code rejected with attempts left', !wrong.ok && wrong.error === 'invalid_code' && wrong.attemptsLeft === 4, j(wrong));
  const okE = await O.procedures.verifyEmailCode({ challengeId: reqE.challengeId, code: demo!.code });
  check('enroll verified', okE.ok && okE.purpose === 'enroll', okE.error);
  const acct = await waitFor('my_account', () => [...O.db.myAccount.iter()][0]);
  check('my_account shows only the masked address (first char + ***@domain), never the full email', acct?.emailMasked === maskedA, acct ? `masked=${acct.emailMasked}` : 'none');
  check('one device, current', [...O.db.myDevices.iter()].length === 1 && [...O.db.myDevices.iter()][0]!.isCurrent);
  const su = [...O.db.myStepup.iter()][0];
  check('step-up active right after enrolling', !!su && su.linked && su.active && !su.requireStepup);
  check('challenge and demo code are gone', await waitFor('gone', () => [...O.db.myEmailChallenge.iter()].length === 0 && [...O.db.myDemoCode.iter()].length === 0) !== undefined);

  // ---- sign out ----
  await O.reducers.signOutDevice({});
  await waitFor('signed out', () => [...O.db.myAccount.iter()].length === 0);
  check('sign_out_device unlinks this device', [...O.db.myAccount.iter()].length === 0 && [...O.db.myDevices.iter()].length === 0);

  // ---- sign in on a second identity ----
  console.log('      (waiting 31 s for the resend cooldown on this email)');
  await sleep(31_000);
  const second = await connect('second', undefined, MY);
  const S = second.conn;
  check('second device starts with no access', [...S.db.myPropertyReports.iter()].length === 0 && [...S.db.myAccount.iter()].length === 0);
  const reqS = await S.procedures.requestEmailCode({ email: EMAIL_A, purpose: 'signin' });
  check('request signin code', reqS.ok, reqS.error);
  const demoS = await waitFor('second demo code', () => [...S.db.myDemoCode.iter()][0]);
  const okS = await S.procedures.verifyEmailCode({ challengeId: reqS.challengeId, code: demoS!.code });
  check('signin verified', okS.ok && okS.purpose === 'signin', okS.error);
  await waitFor('second sees report', () => [...S.db.myPropertyReports.iter()].length === 1);
  check('second device now sees the account properties (report, assessment, verification, address)',
    [...S.db.myPropertyReports.iter()].length === 1 && [...S.db.myAssessments.iter()].length === 1 &&
    [...S.db.myVerifications.iter()].some(v => v.propertyId === ver.propertyId && v.state === 'verified') && [...S.db.myPropertyPrivates.iter()].length === 1);
  const rb = await S.procedures.readBlob({ objectKey: key, seq: 0 });
  check('second device can read the media (read_blob)', rb.ok, rb.error);
  check('second device lists 1 device on the account', [...S.db.myDevices.iter()].length === 1 && [...S.db.myDevices.iter()][0]!.isCurrent);

  // ---- signin for an unknown email looks the same and never links ----
  const third = await connect('third', undefined, MY);
  const T = third.conn;
  const reqD = await T.procedures.requestEmailCode({ email: EMAIL_B, purpose: 'signin' });
  const chD = await waitFor('decoy challenge', () => [...T.db.myEmailChallenge.iter()][0]);
  check('unknown email: same ok result and same challenge shape (deliveryState demo, 5 attempts)', reqD.ok && reqD.error === '' && chD?.deliveryState === 'demo' && chD.attemptsLeft === 5);
  const demoD = await waitFor('decoy demo code', () => [...T.db.myDemoCode.iter()][0]);
  const decoy = await T.procedures.verifyEmailCode({ challengeId: reqD.challengeId, code: demoD?.code ?? '000000' });
  check('decoy never verifies and never links', !decoy.ok && decoy.error === 'invalid_code' && [...T.db.myAccount.iter()].length === 0, j(decoy));

  // ---- step-up with require_stepup off, then on ----
  console.log('      (waiting 31 s for the resend cooldown on this email)');
  await sleep(31_000);
  const stepWrongEmail = await S.procedures.requestEmailCode({ email: EMAIL_B, purpose: 'stepup' });
  check('step-up with a different email is refused (email_mismatch)', !stepWrongEmail.ok && stepWrongEmail.error === 'email_mismatch', stepWrongEmail.error);
  const reqU = await S.procedures.requestEmailCode({ email: EMAIL_A, purpose: 'stepup' });
  check('request step-up code (require_stepup off)', reqU.ok, reqU.error);
  const demoU = await waitFor('step-up demo code', () => [...S.db.myDemoCode.iter()][0]);
  const okU = await S.procedures.verifyEmailCode({ challengeId: reqU.challengeId, code: demoU!.code });
  check('step-up verified', okU.ok && okU.purpose === 'stepup', okU.error);
  check('my_stepup active for the second device', !!(await waitFor('stepup active', () => [...S.db.myStepup.iter()].find(r => r.active))));

  setConfig('demo', true);
  await waitFor('require flag', () => [...O.db.myStepup.iter()][0]?.requireStepup);
  check('require_stepup on: my_stepup shows required', [...O.db.myStepup.iter()][0]?.requireStepup === true);
  await waitFor('owner gated', () => [...O.db.myPropertyReports.iter()].length === 0);
  check('require_stepup on: the original device (signed out, no account) sees NO full report', [...O.db.myPropertyReports.iter()].length === 0 && [...O.db.myAssessments.iter()].length === 0 && [...O.db.myMediaAssets.iter()].length === 0);
  const rbO = await O.procedures.readBlob({ objectKey: key, seq: 0 });
  check('require_stepup on: read_blob for that device returns stepup_required', !rbO.ok && rbO.error === 'stepup_required', rbO.error);
  check('require_stepup on: the stepped-up second device still sees the report', [...S.db.myPropertyReports.iter()].length === 1);
  const rbS = await S.procedures.readBlob({ objectKey: key, seq: 0 });
  check('require_stepup on: read_blob works for the stepped-up device', rbS.ok, rbS.error);

  // ---- cleanup ----
  setConfig('demo', false);
  await S.reducers.deleteAccount({});
  await waitFor('account deleted', () => [...S.db.myAccount.iter()].length === 0);
  check('delete_account removes the account and device links', [...S.db.myAccount.iter()].length === 0 && [...S.db.myDevices.iter()].length === 0);
  check('verification stays after delete_account (original device still sees its report)', await waitFor('owner back', () => [...O.db.myPropertyReports.iter()].length === 1) !== undefined);

  for (const c of [R, W, O, S, T]) c.disconnect();
}

main()
  .catch(e => {
    check('unexpected error', false, String((e as Error)?.stack ?? e));
    try {
      setConfig('demo', false);
    } catch {
      // best effort
    }
  })
  .finally(() => {
    console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  });
