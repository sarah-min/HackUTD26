// Shared test harness helpers for the module (uses spacetimedb's in-process test runtime).
import { createModuleTestHarness, TestAuth, TestClock } from 'spacetimedb/server/test-utils';
import { ConnectionId, Timestamp } from 'spacetimedb';
import * as mod from '../src/index';

export { mod };
export const T0 = Timestamp.fromDate(new Date('2026-11-07T18:00:00Z'));
export const HEX = (c: string) => c.repeat(64).slice(0, 64);

export function addr(line1: string, lat: number | null, lng: number | null, extra: Partial<Record<string, unknown>> = {}) {
  return { line1, city: 'Dallas', state: 'TX', zip: '75201', lat, lng, normalized: 'x', source: 'census', ...extra };
}

export const BASE_LAT = 32.7767;
export const BASE_LNG = -96.797;

export function setup() {
  const clock = new TestClock(T0);
  const h = createModuleTestHarness(mod.default, mod as unknown as Record<string, unknown>, { clock });
  const internal = TestAuth.internal();
  const call = <A>(auth: TestAuth, reducer: (ctx: any, args: A) => void, args: A) =>
    h.withReducerTx(auth, ctx => reducer(ctx, args));
  call(internal, mod.init as any, {});

  const user = (name: string) =>
    TestAuth.fromJwtPayload(JSON.stringify({ iss: 'https://test.local', sub: name, aud: 'hack' }), ConnectionId.random());
  const idOf = (auth: TestAuth) => h.viewContext(auth).sender;
  const view = <R>(auth: TestAuth, v: (ctx: any, params: {}) => R) => v(h.viewContext(auth), {});

  const worker = user('worker');
  call(internal, mod.admin_add_service as any, { identity: idOf(worker).toHexString(), role: 'worker' });

  const advanceMs = (ms: number) =>
    clock.set(new Timestamp(clock.now().microsSinceUnixEpoch + BigInt(Math.round(ms)) * 1000n));

  /** Create a report as `auth` and return its id. */
  const createReport = (auth: TestAuth, over: Record<string, unknown> = {}) => {
    const before = new Set([...h.db.report.iter()].map(r => r.id));
    call(auth, mod.create_report as any, {
      input_json: JSON.stringify({
        hazard: 'hurricane_wind',
        address: addr('123 Main Street', BASE_LAT, BASE_LNG),
        selfDanger: false,
        isSelfReport: false,
        reporterSecretHash: HEX('a'),
        ...over,
      }),
    });
    const created = [...h.db.report.iter()].find(r => !before.has(r.id));
    if (!created) throw new Error('report not created');
    return created.id;
  };

  /** Stores `size` bytes under `key` as `auth` (begin_upload + 512 KiB chunks). */
  const upload = (auth: TestAuth, key: string, contentType: string, size = 1000, fill = 7) => {
    const CH = 512 * 1024;
    const n = Math.ceil(size / CH);
    call(auth, mod.begin_upload as any, { object_key: key, content_type: contentType, size_bytes: BigInt(size), sha256: HEX('b'), chunk_count: n });
    for (let i = 0; i < n; i++)
      call(auth, mod.upload_chunk as any, { object_key: key, seq: i, bytes: new Uint8Array(Math.min(CH, size - i * CH)).fill(fill) });
  };

  const attach = (auth: TestAuth, reportId: bigint, kind: 'video' | 'image' = 'video', n = 0) => {
    upload(auth, `media/${reportId}/${HEX(String(n % 10))}.${kind === 'video' ? 'mp4' : 'jpg'}`, kind === 'video' ? 'video/mp4' : 'image/jpeg');
    return call(auth, mod.attach_media as any, {
      report_id: reportId,
      kind,
      object_key: `media/${reportId}/${HEX(String(n % 10))}.${kind === 'video' ? 'mp4' : 'jpg'}`,
      content_type: kind === 'video' ? 'video/mp4' : 'image/jpeg',
      size_bytes: 1000n,
      sha256: HEX(String(n % 10)),
    });
  };

  const jobsFor = (reportId: bigint) => [...h.db.job.iter()].filter(j => j.report_id === reportId);

  /** Drive a report through submit → claim → record_assessment. */
  const assess = (
    reporter: TestAuth,
    reportId: bigint,
    o: { level?: string; flags?: string; usable?: number; total?: number } = {}
  ) => {
    call(reporter, mod.submit_report as any, { report_id: reportId });
    const job = jobsFor(reportId).find(j => j.state === 'queued')!;
    call(worker, mod.claim_job as any, { job_id: job.id, lease_ms: 60_000 });
    call(worker, mod.record_assessment as any, {
      report_id: reportId,
      json: '{}',
      overall_level: o.level ?? 'major',
      usable_frames: o.usable ?? 4,
      total_frames: o.total ?? 4,
      life_safety_csv: o.flags ?? '',
    });
    call(worker, mod.complete_job as any, { job_id: job.id, ok: true });
  };

  /** Start + pass a verification for `auth` at `address`. Returns the verification row. */
  const verify = (auth: TestAuth, address = addr('123 Main St', BASE_LAT, BASE_LNG), ok = true) => {
    call(auth, mod.start_verification as any, {
      address_json: JSON.stringify(address),
      doc_kind: 'drivers_license',
      secret_hash: HEX('b'),
    });
    const mine = [...h.db.verification.identity.filter(idOf(auth))];
    const v = mine[mine.length - 1];
    upload(auth, `idv/${v.id}/doc.jpg`, 'image/jpeg');
    call(auth, mod.submit_verification as any, { verification_id: v.id, object_key: `idv/${v.id}/doc.jpg` });
    const job = [...h.db.job.iter()].find(j => j.verification_id === v.id)!;
    call(worker, mod.claim_job as any, { job_id: job.id, lease_ms: 60_000 });
    call(worker, mod.record_verification as any, {
      verification_id: v.id,
      ok,
      fail_reason: ok ? undefined : 'address_mismatch',
      name_on_doc: ok ? 'SPECIMEN PERSON' : undefined,
    });
    call(worker, mod.complete_job as any, { job_id: job.id, ok: true });
    return h.db.verification.id.find(v.id)!;
  };

  return { h, clock, internal, call, user, idOf, view, worker, advanceMs, createReport, upload, attach, assess, verify, jobsFor };
}
