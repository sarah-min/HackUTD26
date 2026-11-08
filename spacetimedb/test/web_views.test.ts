// Web-server role ('web'): reads only the narrow web_* auth views, and cannot act as a worker.
import { describe, expect, it } from 'vitest';
import { setup, mod, addr, BASE_LAT, BASE_LNG, HEX } from './helpers';

const WEB_VIEWS = ['web_report_upload_auth', 'web_verification_auth', 'web_media_index'] as const;

function withWeb() {
  const s = setup();
  const web = s.user('web-server');
  s.call(s.internal, mod.admin_add_service as any, { identity: s.idOf(web).toHexString(), role: 'web' });
  const v = (who: any, name: (typeof WEB_VIEWS)[number]) => s.view(who, (mod as any)[name]) as any[];
  return { s, web, v };
}

describe('web auth views (Part 4 upload/media routes)', () => {
  it('return nothing to reporters, verified owners, or the worker', () => {
    const { s, v } = withWeb();
    const reporter = s.user('reporter');
    const owner = s.user('owner');
    const rid = s.createReport(reporter);
    s.attach(reporter, rid);
    s.assess(reporter, rid);
    s.verify(owner);
    for (const name of WEB_VIEWS) {
      expect(v(reporter, name), name).toHaveLength(0);
      expect(v(owner, name), name).toHaveLength(0);
      expect(v(s.worker, name), name).toHaveLength(0);
    }
  });

  it('expose the reporter secret hash only while uploads are allowed', () => {
    const { s, web, v } = withWeb();
    const reporter = s.user('reporter');
    const rid = s.createReport(reporter);
    expect(v(web, 'web_report_upload_auth')).toEqual([
      { report_id: rid, reporter_secret_hash: HEX('a'), status: 'draft' },
    ]);
    s.attach(reporter, rid);
    s.call(reporter, mod.submit_report as any, { report_id: rid });
    expect(v(web, 'web_report_upload_auth')).toHaveLength(0); // queued: no more uploads
  });

  it('expose pending and verified verifications with their property, never failed ones', () => {
    const { s, web, v } = withWeb();
    const alice = s.user('alice');
    s.call(alice, mod.start_verification as any, {
      address_json: JSON.stringify(addr('9 Elm St', BASE_LAT, BASE_LNG)),
      doc_kind: 'state_id',
      secret_hash: HEX('e'),
    });
    const [pending] = v(web, 'web_verification_auth');
    expect(pending).toMatchObject({ secret_hash: HEX('e'), state: 'pending' });

    const owner = s.user('owner');
    const ok = s.verify(owner);
    const bob = s.user('bob');
    const bad = s.verify(bob, addr('123 Main St', BASE_LAT, BASE_LNG), false);
    const rows = v(web, 'web_verification_auth');
    expect(rows.find(r => r.verification_id === ok.id)).toMatchObject({ state: 'verified', property_id: ok.property_id });
    expect(rows.find(r => r.verification_id === bad.id)).toBeUndefined();
  });

  it('index media and frame keys by property, and never list idv/ keys', () => {
    const { s, web, v } = withWeb();
    const reporter = s.user('reporter');
    const rid = s.createReport(reporter);
    s.attach(reporter, rid);
    s.call(reporter, mod.submit_report as any, { report_id: rid });
    const job = s.jobsFor(rid).find(j => j.state === 'queued')!;
    s.call(s.worker, mod.claim_job as any, { job_id: job.id, lease_ms: 60_000 });
    s.call(s.worker, mod.record_frame as any, {
      report_id: rid,
      frame_index: 0,
      t_sec: 0,
      thumb_key: `frames/${rid}/0.jpg`,
      finding_json: '{}',
    });
    s.verify(s.user('owner')); // creates an idv/ key during the flow
    const keys = v(web, 'web_media_index').map(r => r.object_key);
    expect(keys).toContain(`frames/${rid}/0.jpg`);
    expect(keys.some(k => k.startsWith(`media/${rid}/`))).toBe(true);
    expect(keys.some(k => k.startsWith('idv/'))).toBe(false);
    const report = s.h.db.report.id.find(rid)!;
    expect(v(web, 'web_media_index').every(r => r.property_id === report.property_id)).toBe(true);
  });

  it('the web role cannot call worker reducers or see svc_* views', () => {
    const { s, web } = withWeb();
    const reporter = s.user('reporter');
    const rid = s.createReport(reporter);
    s.attach(reporter, rid);
    s.call(reporter, mod.submit_report as any, { report_id: rid });
    const job = s.jobsFor(rid).find(j => j.state === 'queued')!;
    expect(() => s.call(web, mod.claim_job as any, { job_id: job.id, lease_ms: 60_000 })).toThrow(/service only/);
    expect(s.view(web, mod.svc_jobs as any)).toHaveLength(0);
  });
});
