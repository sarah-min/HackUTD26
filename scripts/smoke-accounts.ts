// Live smoke test for recovery-code accounts (create -> sign out -> sign in on a second identity -> lockout -> replace code ->
// step-up -> delete) against the DEV database only. No email or SMS exists any more: the code is generated here exactly like
// the browser does (apps/web/lib/stdb/recoveryCode.ts) and the module stores only its hash.
//
// Usage:  cd scripts && pnpm install --ignore-workspace && pnpm smoke:accounts     (typecheck: npx tsc -p .)
//
// Needs: ../.env.local (STDB_URI, STDB_MODULE ending in -dev, DEV_WORKER_IDENTITY, DEV_WORKER_TOKEN) and the `spacetime`
// CLI logged in as the dev ADMIN (it calls admin_set_account_config with that login; no admin token is read or printed).
// Hard-fails on a non -dev database. It writes only its own test rows (a random address, a report marked "SMOKE TEST", a
// verification for "SPECIMEN PERSON", one account) and deletes the account at the end. It claims ONLY the two jobs it
// creates (by id), never anyone else's. Records ~6 failed code attempts (the global cap is 300 per hour). Takes ~15 s.
// Leaves account_config with require_stepup = false (the web UI default).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DbConnection } from '@hack/stdb-bindings';
import { normalizeParts } from '@hack/address';
import { generateRecoveryCode } from '../apps/web/lib/stdb/recoveryCode';

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

/** admin_set_account_config via the CLI login (Option args are {"some":v} / {"none":[]}). Never prints anything secret. */
function setConfig(requireStepup: boolean): void {
  const none = '{"none":[]}';
  execFileSync(
    'spacetime',
    ['call', '--server', 'maincloud', STDB_MODULE, 'admin_set_account_config', none, JSON.stringify({ some: requireStepup })],
    { stdio: ['ignore', 'ignore', 'inherit'] }
  );
}

const MY = [
  'my_account', 'my_devices', 'my_stepup', 'my_account_status',
  'my_property_reports', 'my_assessments', 'my_media_assets', 'my_verifications', 'my_property_privates',
].map(v => `SELECT * FROM ${v}`);

const houseNo = 1000 + Math.floor(Math.random() * 8000);
const parts = normalizeParts({ line1: `${houseNo} Cedar Street`, city: 'Dallas', state: 'TX', zip: '75201' });
const address = { ...parts, lat: 32.7 + Math.random() * 0.15, lng: -96.9 + Math.random() * 0.15, source: 'manual' as const };
const CODE = generateRecoveryCode();
const NEW_CODE = generateRecoveryCode();
/** The same code typed sloppily: lowercase, spaces instead of dashes. The module normalizes it. */
const sloppy = (c: string) => c.toLowerCase().replace(/-/g, ' ');
const wrongCode = () => generateRecoveryCode(); // a valid-shape code that belongs to nobody

async function main(): Promise<void> {
  console.log(`Account smoke → ${STDB_URI} / ${STDB_MODULE}  (address: ${parts.normalized})`);
  setConfig(false);

  const reporter = await connect('reporter', undefined, ['SELECT * FROM my_reports']);
  const worker = await connect('worker', WORKER_TOKEN, ['SELECT * FROM svc_jobs']);
  const owner = await connect('owner', undefined, MY);
  const O = owner.conn;
  const W = worker.conn;
  const R = reporter.conn;
  const status = await waitFor('account status', () => [...O.db.myAccountStatus.iter()][0]);
  check('my_account_status says accounts are enabled', status?.enabled === true, j(status));

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

  // ---- create ----
  const weak = await O.procedures.createAccount({ recoveryCode: 'AAAA-AAAA-AAAA-AAAA-AAAA' });
  check('weak code rejected (invalid_code)', !weak.ok && weak.error === 'invalid_code', j(weak));
  const created = await O.procedures.createAccount({ recoveryCode: CODE });
  check('create_account with the browser-generated code', created.ok && created.error === '', j(created));
  const acct = await waitFor('my_account', () => [...O.db.myAccount.iter()][0]);
  check('my_account has only id/createdAt/lastLoginAt (no email, no hash)', !!acct && Object.keys(acct).sort().join(',') === 'createdAt,id,lastLoginAt', acct ? Object.keys(acct).join(',') : 'none');
  check('one device, current', [...O.db.myDevices.iter()].length === 1 && [...O.db.myDevices.iter()][0]!.isCurrent);
  const su = [...O.db.myStepup.iter()][0];
  check('step-up active right after creating', !!su && su.linked && su.active && !su.requireStepup);
  const again = await O.procedures.createAccount({ recoveryCode: generateRecoveryCode() });
  check('a second create from the same device is refused', !again.ok && again.error === 'already_signed_in', j(again));

  // ---- sign out ----
  await O.reducers.signOutDevice({});
  await waitFor('signed out', () => [...O.db.myAccount.iter()].length === 0);
  check('sign_out_device unlinks this device', [...O.db.myAccount.iter()].length === 0 && [...O.db.myDevices.iter()].length === 0);

  // ---- sign in on a second identity ----
  const second = await connect('second', undefined, MY);
  const S = second.conn;
  check('second device starts with no access', [...S.db.myPropertyReports.iter()].length === 0 && [...S.db.myAccount.iter()].length === 0);
  const bad = await S.procedures.signInWithCode({ recoveryCode: wrongCode() });
  check('wrong code: invalid_code with attemptsLeft 4', !bad.ok && bad.error === 'invalid_code' && bad.attemptsLeft === 4, j(bad));
  const good = await S.procedures.signInWithCode({ recoveryCode: sloppy(CODE) });
  check('sign_in_with_code (typed lowercase with spaces) works', good.ok && good.error === '', j(good));
  await waitFor('second sees report', () => [...S.db.myPropertyReports.iter()].length === 1);
  check('second device now sees the account properties (report, assessment, verification, address)',
    [...S.db.myPropertyReports.iter()].length === 1 && [...S.db.myAssessments.iter()].length === 1 &&
    [...S.db.myVerifications.iter()].some(v => v.propertyId === ver.propertyId && v.state === 'verified') && [...S.db.myPropertyPrivates.iter()].length === 1);
  const rb = await S.procedures.readBlob({ objectKey: key, seq: 0 });
  check('second device can read the media (read_blob)', rb.ok, rb.error);
  check('second device lists 1 device on the account', [...S.db.myDevices.iter()].length === 1 && [...S.db.myDevices.iter()][0]!.isCurrent);

  // ---- brute force: every wrong code is the same invalid_code, the 5th failure locks the identity ----
  const third = await connect('third', undefined, MY);
  const T = third.conn;
  const fails = [];
  for (let i = 0; i < 5; i++) fails.push(await T.procedures.signInWithCode({ recoveryCode: wrongCode() }));
  check('4 wrong codes are all invalid_code (attemptsLeft 4,3,2,1)', fails.slice(0, 4).every((r, i) => !r.ok && r.error === 'invalid_code' && r.attemptsLeft === 4 - i), j(fails.slice(0, 4)));
  check('the 5th wrong code locks with retryAfterS', !fails[4]!.ok && fails[4]!.error === 'locked' && fails[4]!.retryAfterS > 0, j(fails[4]));
  const locked = await T.procedures.signInWithCode({ recoveryCode: CODE });
  check('while locked even the RIGHT code is refused and nothing links', !locked.ok && locked.error === 'locked' && [...T.db.myAccount.iter()].length === 0, j(locked));

  // ---- replace the code (second device); the old code stops working, other devices stay linked ----
  const rep = await S.procedures.replaceRecoveryCode({ oldCode: CODE, newCode: NEW_CODE });
  check('replace_recovery_code', rep.ok, j(rep));
  const fourth = await connect('fourth', undefined, MY);
  const F = fourth.conn;
  const oldTry = await F.procedures.signInWithCode({ recoveryCode: CODE });
  check('old code no longer signs in (invalid_code)', !oldTry.ok && oldTry.error === 'invalid_code', j(oldTry));
  const newTry = await F.procedures.signInWithCode({ recoveryCode: NEW_CODE });
  check('new code signs in', newTry.ok, j(newTry));
  await waitFor('fourth sees report', () => [...F.db.myPropertyReports.iter()].length === 1);
  check('the account now has 2 devices (second + fourth)', [...S.db.myDevices.iter()].length === 2);

  // ---- step-up ----
  const stepWrong = await S.procedures.stepUpWithCode({ recoveryCode: wrongCode() });
  check('step-up with a wrong code is invalid_code', !stepWrong.ok && stepWrong.error === 'invalid_code', j(stepWrong));
  const stepOk = await S.procedures.stepUpWithCode({ recoveryCode: NEW_CODE });
  check('step_up_with_code with the current code', stepOk.ok, j(stepOk));
  check('my_stepup active for the second device', !!(await waitFor('stepup active', () => [...S.db.myStepup.iter()].find(r => r.active))));

  setConfig(true);
  await waitFor('require flag', () => [...O.db.myStepup.iter()][0]?.requireStepup);
  check('require_stepup on: my_stepup shows required', [...O.db.myStepup.iter()][0]?.requireStepup === true);
  await waitFor('owner gated', () => [...O.db.myPropertyReports.iter()].length === 0);
  check('require_stepup on: the original device (signed out, no account) sees NO full report', [...O.db.myPropertyReports.iter()].length === 0 && [...O.db.myAssessments.iter()].length === 0 && [...O.db.myMediaAssets.iter()].length === 0);
  const rbO = await O.procedures.readBlob({ objectKey: key, seq: 0 });
  check('require_stepup on: read_blob for the signed-out (revoked) device returns forbidden', !rbO.ok && rbO.error === 'forbidden', rbO.error);
  check('require_stepup on: the stepped-up second device still sees the report', [...S.db.myPropertyReports.iter()].length === 1);
  const rbS = await S.procedures.readBlob({ objectKey: key, seq: 0 });
  check('require_stepup on: read_blob works for the stepped-up device', rbS.ok, rbS.error);

  // ---- cleanup ----
  setConfig(false);
  await S.reducers.deleteAccount({});
  await waitFor('account deleted', () => [...S.db.myAccount.iter()].length === 0);
  check('delete_account removes the account and device links', [...S.db.myAccount.iter()].length === 0 && [...S.db.myDevices.iter()].length === 0);
  const afterDelete = await F.procedures.signInWithCode({ recoveryCode: NEW_CODE });
  check('after delete_account the code no longer signs anything in', !afterDelete.ok && afterDelete.error === 'invalid_code', j(afterDelete));
  check('delete_account does not re-grant a signed-out (revoked) device: it still sees nothing', [...O.db.myPropertyReports.iter()].length === 0);

  for (const c of [R, W, O, S, T, F]) c.disconnect();
}

main()
  .catch(e => {
    check('unexpected error', false, String((e as Error)?.stack ?? e));
    try {
      setConfig(false);
    } catch {
      // best effort
    }
  })
  .finally(() => {
    console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  });
