/**
 * Seeds the DEV database with FIXTURE reports around a demo area so the area map (Damage / Hazards toggle)
 * and nearby-report beats have data. Every row is synthetic: addresses are "<n> Fixture Row", assessments
 * carry source "fixture" and "[FIXTURE]" summaries, nothing is a real person, place report or model output.
 *
 *   cd scripts && pnpm seed:demo -- --dry-run     # print the plan, touch nothing
 *   cd scripts && pnpm seed:demo                  # seed dev
 *
 * Config from ../.env.local (gitignored): STDB_URI, STDB_MODULE, DEV_WORKER_TOKEN. Tokens are never printed.
 * Refuses to run unless STDB_MODULE ends in "-dev" (override: --i-know-this-is-prod; don't).
 * Idempotent-ish: a cluster is skipped when its cell already holds >= that many seeded-style reports,
 * so reruns don't pile on. The 72 h window means seeded cells age out; rerun to refresh after a wipe or 3 days.
 * Flow per report (reuses the real reducers so the area-cell refresh path is exercised):
 *   reporter (anonymous identity): create_report -> attach_media (fixture key) -> submit_report
 *   worker (DEV_WORKER_TOKEN): claim_job -> record_frame x2 -> record_assessment -> complete_job
 */
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DbConnection } from '@hack/stdb-bindings';
import { cellId, normalizeParts } from '@hack/address';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const FORCE_PROD = argv.includes('--i-know-this-is-prod');

const here = dirname(fileURLToPath(import.meta.url));
function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  let text = '';
  try {
    text = readFileSync(join(here, '..', '.env.local'), 'utf8');
  } catch {
    return out;
  }
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith('#')) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = { ...loadEnv(), ...process.env } as Record<string, string | undefined>;
const URI = env.STDB_URI ?? 'https://maincloud.spacetimedb.com';
const MODULE = env.STDB_MODULE ?? '';
const TOKEN = env.DEV_WORKER_TOKEN ?? '';

// ---------- the fixture plan ----------
type Level = 'affected' | 'minor' | 'major' | 'destroyed';
interface Seed { level: Level; flags: string[] }
interface Cluster { name: string; hazard: string; base: { lat: number; lng: number }; seeds: Seed[] }

// Demo area: Richardson, TX (UT Dallas neighbourhood). Clusters are ~0.5 km apart so they are separate cells.
const CLUSTERS: Cluster[] = [
  {
    name: 'A (tornado, hazards visible)',
    hazard: 'tornado',
    base: { lat: 32.9857, lng: -96.7502 },
    seeds: [
      { level: 'major', flags: ['downed_power_line'] },
      { level: 'destroyed', flags: ['gas_leak_suspected', 'structural_collapse'] },
      { level: 'minor', flags: [] },
      { level: 'major', flags: ['road_blocked'] },
      { level: 'affected', flags: [] },
    ],
  },
  {
    name: 'B (flood)',
    hazard: 'flood',
    base: { lat: 32.9911, lng: -96.7448 },
    seeds: [
      { level: 'minor', flags: ['standing_water_interior'] },
      { level: 'major', flags: ['standing_water_interior', 'road_blocked'] },
      { level: 'affected', flags: [] },
      { level: 'minor', flags: [] },
    ],
  },
  {
    name: 'C (hail, <3 reports: flag types stay hidden)',
    hazard: 'hail',
    base: { lat: 32.9803, lng: -96.7561 },
    seeds: [
      { level: 'minor', flags: [] },
      { level: 'affected', flags: ['road_blocked'] },
    ],
  },
];

/** Points that all land in the same ~250 m cell as the base (so the cluster really has N reports in one cell). */
function pointsInOneCell(base: { lat: number; lng: number }, n: number): { lat: number; lng: number }[] {
  const want = cellId(base.lat, base.lng);
  // centre the base on its cell along longitude (cell width varies with latitude)
  let lo = base.lng;
  let hi = base.lng;
  while (cellId(base.lat, lo - 0.00005) === want) lo -= 0.00005;
  while (cellId(base.lat, hi + 0.00005) === want) hi += 0.00005;
  let latLo = base.lat;
  let latHi = base.lat;
  while (cellId(latLo - 0.00005, base.lng) === want) latLo -= 0.00005;
  while (cellId(latHi + 0.00005, base.lng) === want) latHi += 0.00005;
  const out: { lat: number; lng: number }[] = [];
  for (let i = 0; i < n; i++) {
    const fl = (i + 1) / (n + 1);
    const fg = ((i * 7) % (n + 2) + 1) / (n + 3);
    const p = { lat: latLo + (latHi - latLo) * fl, lng: lo + (hi - lo) * fg };
    if (cellId(p.lat, p.lng) !== want) throw new Error('internal: point left the cell');
    out.push(p);
  }
  return out;
}

const STREETS = ['Fixture Row', 'Specimen Court', 'Sample Lane', 'Synthetic Way', 'Mockingbird Test Dr'];

if (!MODULE) {
  console.error('STDB_MODULE is not set (expected in ../.env.local).');
  process.exit(2);
}
if (!MODULE.endsWith('-dev') && !FORCE_PROD) {
  console.error(`Refusing to run: STDB_MODULE "${MODULE}" is not a -dev database. This script writes FIXTURE rows.`);
  process.exit(2);
}

const plan = CLUSTERS.map(c => ({ c, pts: pointsInOneCell(c.base, c.seeds.length) }));
console.log(`seed-demo → ${URI} / ${MODULE}${DRY ? '  (DRY RUN)' : ''}`);
for (const { c, pts } of plan) {
  console.log(`  cluster ${c.name}: cell ${cellId(pts[0]!.lat, pts[0]!.lng)}, ${c.seeds.length} reports`);
  c.seeds.forEach((s, i) =>
    console.log(`    - ${s.level.padEnd(9)} flags=[${s.flags.join(',')}] @ ${pts[i]!.lat.toFixed(5)},${pts[i]!.lng.toFixed(5)}`)
  );
}
if (DRY) process.exit(0);
if (!TOKEN) {
  console.error('Missing DEV_WORKER_TOKEN in ../.env.local (service identity needed to record assessments).');
  process.exit(2);
}

// ---------- helpers ----------
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const hex = (id: { toHexString(): string }) => id.toHexString().toLowerCase().replace(/^0x/, '');

async function waitFor<T>(label: string, fn: () => T | undefined | null | false, ms = 15000): Promise<T> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = fn();
    if (v) return v as T;
    await sleep(100);
  }
  throw new Error(`timed out waiting for: ${label}`);
}

async function connect(name: string, token: string | undefined, queries: string[]): Promise<{ conn: DbConnection; idHex: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name}: connect/subscribe timeout`)), 20000);
    let b = DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(MODULE)
      .onConnect((conn, identity) => {
        conn
          .subscriptionBuilder()
          .onApplied(() => {
            clearTimeout(timer);
            resolve({ conn, idHex: hex(identity) });
          })
          .onError(() => {
            clearTimeout(timer);
            reject(new Error(`${name}: subscription error`));
          })
          .subscribe(queries);
      })
      .onConnectError((_c, err) => {
        clearTimeout(timer);
        reject(new Error(`${name}: connect error ${String(err)}`));
      });
    if (token) b = b.withToken(token);
    b.build();
  });
}

function fixtureAssessment(reportId: bigint, propertyId: bigint, hazard: string, s: Seed) {
  const fraction: Record<string, number> = { affected: 0.05, minor: 0.15, major: 0.5, destroyed: 1 };
  const structure = 1800 * 15000;
  const roof = Math.round(structure * 0.15 * fraction[s.level]!);
  const walls = Math.round(structure * 0.15 * 0.15);
  const likely = roof + walls;
  return {
    reportId: String(reportId),
    propertyId: String(propertyId),
    overallLevel: s.level,
    componentLevels: { roof: s.level, exterior_walls: 'minor', windows_doors: 'minor', foundation: 'none', interior: 'none', utilities: 'none', contents: 'none', vehicle: 'none', yard_debris: 'none' },
    lifeSafety: s.flags,
    hazard,
    confidence: 0.76,
    usableFrameCount: 3,
    totalFrameCount: 3,
    cost: {
      lowCents: Math.round(likely * 0.7),
      likelyCents: likely,
      highCents: Math.round(likely * 1.4),
      lineItems: [
        { component: 'roof', level: s.level, basis: '[FIXTURE] 1800 sqft x $150/sqft x 15% roof share', likelyCents: roof },
        { component: 'exterior_walls', level: 'minor', basis: '[FIXTURE] simulated', likelyCents: walls },
      ],
      inputs: { homeSqft: 1800, stories: 1, tenure: 'own', assumed: true },
      costModelVersion: 'cost-v1',
      disclaimer: 'Illustrative estimate, not a contractor quote or insurance determination.',
    },
    declarations: [],
    activeAlerts: [],
    location: { stateCode: 'TX', countyName: '[FIXTURE] County', countyFips: '48113' },
    summary: `[FIXTURE] Seeded demo assessment: ${s.level} damage. Not a real AI result.`,
    recommendedActions: s.flags.length
      ? ['[FIXTURE] Stay clear of the hazard and call 911 if anyone is in danger.']
      : ['[FIXTURE] Photograph all damage before cleanup.'],
    claimNotice: '[FIXTURE] Draft first notice of loss (simulated).',
    modelId: 'seed-demo',
    visionModelId: 'seed-demo',
    promptVersion: 'fixture',
    source: 'fixture',
    createdAt: Date.now(),
  };
}

async function main(): Promise<void> {
  const reporter = await connect('reporter', undefined, ['SELECT * FROM my_reports', 'SELECT * FROM area_cell_summary']);
  const worker = await connect('worker', TOKEN, ['SELECT * FROM svc_jobs', 'SELECT * FROM svc_reports']);
  console.log(`reporter ${reporter.idHex.slice(0, 12)}…, worker ${worker.idHex.slice(0, 12)}… (distinct: ${reporter.idHex !== worker.idHex})`);
  const R = reporter.conn;
  const W = worker.conn;
  const seen = new Set<bigint>();
  let created = 0;
  let skipped = 0;

  for (const { c, pts } of plan) {
    const cell = cellId(pts[0]!.lat, pts[0]!.lng);
    const existing = [...R.db.myReports.iter()].filter(r => r.cellId === cell && r.status === 'assessed').length;
    if (existing >= c.seeds.length) {
      console.log(`skip cluster ${c.name}: cell ${cell} already has ${existing} assessed reports`);
      skipped += c.seeds.length;
      continue;
    }
    console.log(`seeding cluster ${c.name} (cell ${cell}, ${existing} existing)`);
    for (let i = 0; i < c.seeds.length; i++) {
      const s = c.seeds[i]!;
      const p = pts[i]!;
      const parts = normalizeParts({ line1: `${4100 + i * 2 + (c.hazard.length % 7) * 20} ${STREETS[i % STREETS.length]}`, city: 'Richardson', state: 'TX', zip: '75080' });
      const address = { ...parts, lat: p.lat, lng: p.lng, source: 'manual' as const };
      const before = new Set([...R.db.myReports.iter()].map(r => r.id));
      await R.reducers.createReport({
        inputJson: JSON.stringify({
          hazard: c.hazard,
          address,
          selfDanger: false,
          isSelfReport: false,
          reporterSecretHash: sha256(randomBytes(32)),
          notes: '[FIXTURE] seed-demo',
        }),
      });
      const report = await waitFor('new report row', () =>
        [...R.db.myReports.iter()].find(r => !before.has(r.id) && !seen.has(r.id) && hex(r.reporter) === reporter.idHex)
      );
      seen.add(report.id);
      const sha = sha256(`seed-${report.id}`);
      // Files live in SpacetimeDB: upload the bytes (one 1000-byte chunk) before attach_media.
      await R.reducers.beginUpload({ objectKey: `media/${report.id}/${sha}.mp4`, contentType: 'video/mp4', sizeBytes: 1000n, sha256: sha, chunkCount: 1 });
      await R.reducers.uploadChunk({ objectKey: `media/${report.id}/${sha}.mp4`, seq: 0, bytes: new Uint8Array(1000) });
      await R.reducers.attachMedia({ reportId: report.id, kind: 'video', objectKey: `media/${report.id}/${sha}.mp4`, contentType: 'video/mp4', sizeBytes: 1000n, sha256: sha });
      await R.reducers.submitReport({ reportId: report.id });

      const job = await waitFor('analyze job', () =>
        [...W.db.svcJobs.iter()].find(j => j.kind === 'analyze' && j.reportId === report.id && j.state === 'queued')
      );
      await W.reducers.claimJob({ jobId: job.id, leaseMs: 60_000 });
      for (const f of [0, 1]) {
        await W.reducers.recordFrame({
          reportId: report.id,
          frameIndex: f,
          tSec: f * 4,
          thumbKey: `frames/${report.id}/${f}.jpg`,
          findingJson: JSON.stringify({ frameIndex: f, tSec: f * 4, usable: true, components: [], lifeSafety: [], waterDepth: 'none', caption: `[FIXTURE] frame ${f + 1}` }),
        });
      }
      await W.reducers.recordAssessment({
        reportId: report.id,
        json: JSON.stringify(fixtureAssessment(report.id, report.propertyId, c.hazard, s)),
        overallLevel: s.level,
        usableFrames: 3,
        totalFrames: 3,
        lifeSafetyCsv: s.flags.join(','),
      });
      await W.reducers.completeJob({ jobId: job.id, ok: true, error: undefined });
      created++;
      console.log(`  report ${report.id}: ${s.level} [${s.flags.join(',')}]`);
    }
  }

  await sleep(800);
  console.log(`\ncreated ${created} report(s), skipped ${skipped}. Area cells now:`);
  for (const r of R.db.areaCellSummary.iter()) {
    console.log(`  ${r.cellId}: ${r.reportCount72H} reports, worst ${r.worstLevel}, hazard ${r.hazardReportCount72H} (severe ${r.severeHazardCount72H}), flags "${r.hazardFlagsCsv}"`);
  }
  R.disconnect();
  W.disconnect();
  process.exit(0);
}

main().catch(e => {
  console.error(`seed-demo failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
