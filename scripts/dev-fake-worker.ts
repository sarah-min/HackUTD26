/**
 * DEV ONLY: fake worker for the `-dev` SpacetimeDB database. Every output is a FIXTURE.
 *
 * Purpose: let teammates exercise the reporter and affected-person UIs end to end before
 * the real Nemotron worker exists. The REAL worker is Part 3's `apps/worker`. Nothing
 * here calls a model, reads media, or reads an ID image.
 *
 * What it does for each queued job (via the service-only `svc_*` views):
 *   analyze         → 3 fixture frames, animated reporter-visible pipeline steps, a fixture
 *                     DamageAssessment (source "fixture", modelId "fake-worker", summary
 *                     starts "[FIXTURE]"), one fixture NWS alert via record_area_notices
 *   verify_identity → verified, unless the object key contains "fail" (→ address_mismatch).
 *                     name_on_doc "SPECIMEN PERSON"
 *   plan            → fixture RecoveryPlan (source "fixture")
 *   coach           → "[FIXTURE] coach reply…"
 * then complete_job(ok).
 *
 * Run (from scripts/):
 *   pnpm install --ignore-workspace     # first time
 *   pnpm fake-worker                    # watch mode
 *   pnpm fake-worker -- --once          # drain the current queue, then exit
 *
 * Config is read from ../.env.local (gitignored): STDB_URI, STDB_MODULE, DEV_WORKER_TOKEN.
 * Refuses to run unless STDB_MODULE ends in "-dev". The token is never printed.
 * Logs job ids and kinds only, no personal data.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DbConnection, tables } from '@hack/stdb-bindings';

// ---------- config ----------
const here = dirname(fileURLToPath(import.meta.url));
function loadEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  let text = '';
  try {
    text = readFileSync(join(here, '..', '.env.local'), 'utf8');
  } catch {
    return out;
  }
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = { ...loadEnvLocal(), ...process.env } as Record<string, string | undefined>;
const URI = env.STDB_URI ?? '';
const MODULE = env.STDB_MODULE ?? '';
const TOKEN = env.DEV_WORKER_TOKEN ?? '';
const ONCE = process.argv.includes('--once');

if (!URI || !MODULE || !TOKEN) {
  console.error('Missing STDB_URI / STDB_MODULE / DEV_WORKER_TOKEN (expected in ../.env.local).');
  process.exit(1);
}
if (!MODULE.endsWith('-dev')) {
  console.error(`Refusing to run: STDB_MODULE "${MODULE}" is not a -dev database. This worker writes fixtures.`);
  process.exit(1);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const now = () => Date.now();

// ---------- deterministic fixture content ----------
const LEVELS = ['minor', 'major', 'destroyed', 'affected'] as const;
const FLAG_SETS: string[][] = [[], ['downed_power_line'], ['standing_water_interior', 'road_blocked'], ['gas_leak_suspected']];
const pick = <T>(xs: readonly T[], id: bigint): T => xs[Number(id % BigInt(xs.length))]!;

function fixtureFinding(i: number, level: string, flags: string[]) {
  return {
    frameIndex: i,
    tSec: i * 4,
    usable: true,
    components: [
      { component: 'roof', level, evidence: '[FIXTURE] simulated roof damage', confidence: 0.8 },
      { component: i === 1 ? 'windows_doors' : 'exterior_walls', level: 'minor', evidence: '[FIXTURE] simulated', confidence: 0.7 },
    ],
    lifeSafety: i === 0 ? flags.map(flag => ({ flag, evidence: '[FIXTURE] simulated hazard', confidence: 0.75 })) : [],
    waterDepth: flags.includes('standing_water_interior') ? 'knee' : 'none',
    caption: `[FIXTURE] frame ${i + 1}`,
  };
}

function fixtureCost(level: string) {
  const fraction: Record<string, number> = { affected: 0.05, minor: 0.15, major: 0.5, destroyed: 1 };
  const structure = 1800 * 15000; // cost-v1 defaults: 1800 sqft × $150/sqft (cents)
  const roof = Math.round(structure * 0.15 * (fraction[level] ?? 0));
  const walls = Math.round(structure * 0.15 * 0.15);
  const likely = roof + walls;
  return {
    lowCents: Math.round(likely * 0.7),
    likelyCents: likely,
    highCents: Math.round(likely * 1.4),
    lineItems: [
      { component: 'roof', level, basis: '[FIXTURE] 1800 sqft × $150/sqft × 15% roof share', likelyCents: roof },
      { component: 'exterior_walls', level: 'minor', basis: '[FIXTURE] 1800 sqft × $150/sqft × 15% × 15%', likelyCents: walls },
    ],
    inputs: { homeSqft: 1800, stories: 1, tenure: 'own', assumed: true },
    costModelVersion: 'cost-v1',
    disclaimer: 'Illustrative estimate, not a contractor quote or insurance determination.',
  };
}

// ---------- connection ----------
type Conn = DbConnection;
let conn: Conn;
const inFlight = new Set<bigint>();

async function connect(): Promise<Conn> {
  return new Promise((resolve, reject) => {
    const c = DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(MODULE)
      .withToken(TOKEN)
      .onConnect((cc: Conn, identity: { toHexString(): string }) => {
        console.log(`[fake-worker] connected to ${MODULE} as ${identity.toHexString().slice(0, 12)}…`);
        cc.subscriptionBuilder()
          .onApplied(() => resolve(cc))
          .onError((ctx: any) => reject(ctx?.event ?? new Error("subscription error"))) // reason: SDK ErrorContext type is deeply generic
          .subscribe([
            tables.svcJobs,
            tables.svcReportPrivates,
            tables.svcPropertyPrivates,
            tables.svcVerifications,
            tables.svcAffectedProfiles,
            tables.svcRecoveryPlans,
            tables.svcCoachMessages,
            tables.svcReports,
            tables.property,
          ] as any); // reason: heterogeneous typed queries; the SDK accepts an array of them
      })
      .onConnectError((_ctx: any, err: Error) => reject(err)) // reason: SDK ErrorContext type is deeply generic
      .build();
    void c;
  });
}

// ---------- job handlers ----------
async function step(reportId: bigint, seq: number, name: string, summary: string, durationMs: number) {
  await conn.reducers.recordAgentStep({
    reportId,
    seq,
    kind: 'pipeline',
    name,
    summary: `[FIXTURE] ${summary}`,
    visibility: 'reporter',
    durationMs,
  });
  await sleep(durationMs);
}

function findReport(id: bigint) {
  for (const r of conn.db.svcReports.iter()) if (r.id === id) return r;
  return undefined;
}
function findPropertyPrivate(pid: bigint) {
  for (const p of conn.db.svcPropertyPrivates.iter()) if (p.propertyId === pid) return p;
  return undefined;
}

async function handleAnalyze(job: any) {
  const reportId: bigint = job.reportId;
  const report = findReport(reportId);
  const level = pick(LEVELS, reportId);
  const flags = pick(FLAG_SETS, reportId);
  let seq = 1;
  await step(reportId, seq++, 'extract_frames', 'Extracted 3 frames', 500);
  const findings = [0, 1, 2].map(i => fixtureFinding(i, i === 0 ? level : 'minor', flags));
  for (const f of findings) {
    // Frame thumbnails are stored in SpacetimeDB (worker-only put_blob): a tiny fixture JPEG header.
    await conn.reducers.putBlob({
      objectKey: `frames/${reportId}/${f.frameIndex}.jpg`,
      contentType: 'image/jpeg',
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    });
    await conn.reducers.recordFrame({
      reportId,
      frameIndex: f.frameIndex,
      tSec: f.tSec,
      thumbKey: `frames/${reportId}/${f.frameIndex}.jpg`,
      findingJson: JSON.stringify(f),
    });
    await step(reportId, seq++, 'analyze_frame', `Analyzed frame ${f.frameIndex + 1}/3`, 400);
  }
  await step(reportId, seq++, 'estimate_repair_cost', 'Estimated repair cost', 400);
  await step(reportId, seq++, 'lookup_disaster_declarations', 'Checked disaster declarations', 400);

  const propertyId: bigint | undefined = report?.propertyId;
  const fips = (propertyId !== undefined && findPropertyPrivate(propertyId)?.countyFips) || '48113';
  if (propertyId !== undefined) {
    await conn.reducers.recordAreaNotices({
      propertyId,
      countyFips: fips,
      noticesJson: JSON.stringify([
        {
          kind: 'nws_alert',
          title: '[FIXTURE] Flash Flood Warning',
          severity: 'Severe',
          headline: '[FIXTURE] Simulated alert for development. Not a real NWS alert.',
          effectiveAt: now(),
          expiresAt: now() + 6 * 3600_000,
        },
      ]),
    });
  }

  const assessment = {
    reportId: String(reportId),
    propertyId: propertyId !== undefined ? String(propertyId) : '0',
    overallLevel: level,
    componentLevels: { roof: level, exterior_walls: 'minor', windows_doors: 'minor', foundation: 'none', interior: 'none', utilities: 'none', contents: 'none', vehicle: 'none', yard_debris: 'none' },
    lifeSafety: flags,
    hazard: report?.hazard ?? 'other',
    confidence: 0.76,
    usableFrameCount: 3,
    totalFrameCount: 3,
    cost: fixtureCost(level),
    declarations: [],
    activeAlerts: [{ event: '[FIXTURE] Flash Flood Warning', severity: 'Severe', headline: '[FIXTURE] Simulated alert' }],
    location: { stateCode: 'TX', countyName: '[FIXTURE] County', countyFips: fips },
    summary: `[FIXTURE] Simulated assessment from the dev fake worker: ${level} roof damage. Not a real AI result.`,
    recommendedActions: flags.length
      ? ['[FIXTURE] Stay clear of the hazard and call 911 if anyone is in danger.']
      : ['[FIXTURE] Photograph all damage before cleanup.'],
    claimNotice: '[FIXTURE] Draft first notice of loss (simulated).',
    modelId: 'fake-worker',
    visionModelId: 'fake-worker',
    promptVersion: 'fixture',
    source: 'fixture',
    createdAt: now(),
  };
  await conn.reducers.recordAssessment({
    reportId,
    json: JSON.stringify(assessment),
    overallLevel: level,
    usableFrames: 3,
    totalFrames: 3,
    lifeSafetyCsv: flags.join(','),
  });
  await step(reportId, seq++, 'done', 'Assessment ready', 100);
}

async function handleVerify(job: any) {
  let key = '';
  for (const v of conn.db.svcVerifications.iter()) if (v.id === job.verificationId) key = v.objectKey ?? '';
  const ok = !key.includes('fail');
  await sleep(800);
  await conn.reducers.recordVerification({
    verificationId: job.verificationId,
    ok,
    failReason: ok ? undefined : 'address_mismatch',
    nameOnDoc: ok ? 'SPECIMEN PERSON' : undefined,
  });
}

function fixturePlan(job: any) {
  const repair = { low: 1_400_000, likely: 2_000_000, high: 2_800_000 };
  const payout = { low: 900_000, likely: 1_300_000, high: 1_800_000 };
  const gap = { low: 500_000, likely: 700_000, high: 1_000_000 };
  const start = now();
  return {
    propertyId: String(job.propertyId),
    reportId: String(job.reportId),
    profileId: 'fixture-persona',
    cost: { ...fixtureCost('major'), inputs: { homeSqft: 1800, stories: 1, tenure: 'own', assumed: false } },
    repairCostCents: repair,
    expectedPayoutCents: payout,
    gapCents: gap,
    payoutNotes: ['[FIXTURE] Simulated payout estimate.'],
    indicators: [
      { id: 'liquidity_runway_months', label: 'Liquidity runway', value: 1.8, unit: 'months', status: 'watch', explanation: '[FIXTURE]' },
      { id: 'emergency_fund_coverage', label: 'Emergency fund coverage', value: 1.2, unit: 'ratio', status: 'watch', explanation: '[FIXTURE]' },
      { id: 'debt_to_income', label: 'Debt-to-income', value: 0.31, unit: 'ratio', status: 'good', explanation: '[FIXTURE]' },
    ],
    options: [
      { id: 'savings', label: 'Savings', availableCents: 450_000, costOfFundsCents: 0, daysToFunds: 0 },
      { id: 'credit_card', label: 'Credit card', availableCents: 600_000, costOfFundsCents: 31_000, daysToFunds: 0 },
    ],
    recommendedMix: [
      { optionId: 'savings', amountCents: 450_000 },
      { optionId: 'credit_card', amountCents: 250_000 },
    ],
    forecast: Array.from({ length: 91 }, (_, day) => ({
      day,
      at: start + day * 86_400_000,
      liquidCents: 840_000 - day * 2_000 + (day >= 30 ? payout.likely : 0) - (day >= 7 ? repair.likely : 0),
      events: day === 7 ? ['[FIXTURE] Repair start'] : day === 30 ? ['[FIXTURE] Insurance payout'] : [],
    })),
    firstShortfallDay: 7,
    nextSteps: ['[FIXTURE] Call your insurer to open a claim.'],
    coachSummary: '[FIXTURE] Simulated coach summary.',
    disclaimer: 'Educational estimate using a synthetic demo profile. Not financial advice.',
    source: 'fixture',
    createdAt: start,
  };
}

async function handlePlan(job: any) {
  await sleep(600);
  await conn.reducers.recordRecoveryPlan({
    identity: job.subject.toHexString(),
    propertyId: job.propertyId,
    reportId: job.reportId,
    json: JSON.stringify(fixturePlan(job)),
  });
}

async function handleCoach(job: any) {
  await sleep(600);
  await conn.reducers.recordCoachReply({
    identity: job.subject.toHexString(),
    propertyId: job.propertyId,
    reportId: job.reportId,
    text: '[FIXTURE] coach reply: this is a simulated answer from the dev fake worker, not real advice.',
  });
}

const HANDLERS: Record<string, (job: any) => Promise<void>> = {
  analyze: handleAnalyze,
  verify_identity: handleVerify,
  plan: handlePlan,
  coach: handleCoach,
};

async function processJob(job: any) {
  inFlight.add(job.id);
  try {
    await conn.reducers.claimJob({ jobId: job.id, leaseMs: 120_000 });
    console.log(`[fake-worker] job ${job.id} ${job.kind}: claimed`);
    const h = HANDLERS[job.kind];
    if (!h) throw new Error(`unknown job kind ${job.kind}`);
    await h(job);
    await conn.reducers.completeJob({ jobId: job.id, ok: true, error: undefined });
    console.log(`[fake-worker] job ${job.id} ${job.kind}: done`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[fake-worker] job ${job.id} ${job.kind}: ${msg}`);
    try {
      await conn.reducers.completeJob({ jobId: job.id, ok: false, error: `[fake-worker] ${msg}`.slice(0, 300) });
    } catch {
      /* lease may not be ours; requeue_expired_jobs will handle it */
    }
  } finally {
    inFlight.delete(job.id);
  }
}

function queued(): any[] {
  return [...conn.db.svcJobs.iter()].filter(j => j.state === 'queued' && !inFlight.has(j.id));
}

async function main() {
  conn = await connect();
  if (ONCE) {
    let jobs = queued();
    while (jobs.length) {
      for (const j of jobs) await processJob(j);
      await sleep(500); // let follow-up jobs (if any) arrive
      jobs = queued();
    }
    console.log('[fake-worker] queue empty; exiting (--once)');
    conn.disconnect();
    process.exit(0);
  }
  console.log('[fake-worker] watching for jobs (Ctrl+C to stop)');
  for (;;) {
    for (const j of queued()) void processJob(j);
    await sleep(1000);
  }
}

main().catch(e => {
  console.error('[fake-worker] fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
