// Worker-only views: service callers see private rows tied to OPEN jobs; nobody else sees anything.
import { describe, expect, it } from 'vitest';
import { setup, mod, addr, BASE_LAT, BASE_LNG } from './helpers';

const SVC_VIEWS = [
  'svc_jobs',
  'svc_report_privates',
  'svc_property_privates',
  'svc_media_assets',
  'svc_frames',
  'svc_assessments',
  'svc_verifications',
  'svc_affected_profiles',
  'svc_recovery_plans',
  'svc_coach_messages',
] as const;

const v = (s: ReturnType<typeof setup>, who: any, name: (typeof SVC_VIEWS)[number]) =>
  s.view(who, (mod as any)[name]) as any[];

describe('service views (worker access to private data)', () => {
  it('return nothing to non-service identities, even the reporter and a verified owner', () => {
    const s = setup();
    const reporter = s.user('reporter');
    const owner = s.user('owner');
    const rid = s.createReport(reporter);
    s.attach(reporter, rid);
    s.call(reporter, mod.submit_report as any, { report_id: rid });
    s.verify(owner);
    for (const name of SVC_VIEWS) {
      expect(v(s, reporter, name), name).toHaveLength(0);
      expect(v(s, owner, name), name).toHaveLength(0);
    }
  });

  it('expose an open analyze job with its report_private, property_private and media to the worker', () => {
    const s = setup();
    const reporter = s.user('reporter');
    const rid = s.createReport(reporter);
    s.attach(reporter, rid);
    s.call(reporter, mod.submit_report as any, { report_id: rid });

    const jobs = v(s, s.worker, 'svc_jobs');
    expect(jobs.map(j => j.kind)).toEqual(['analyze']);
    expect(v(s, s.worker, 'svc_report_privates').map(r => r.report_id)).toEqual([rid]);
    expect(v(s, s.worker, 'svc_property_privates')).toHaveLength(1);
    expect(v(s, s.worker, 'svc_media_assets')).toHaveLength(1);

    // Still visible while leased (the worker must see its own lease), gone once done.
    s.call(s.worker, mod.claim_job as any, { job_id: jobs[0].id, lease_ms: 60_000 });
    expect(v(s, s.worker, 'svc_jobs').map(j => j.state)).toEqual(['leased']);
    s.call(s.worker, mod.complete_job as any, { job_id: jobs[0].id, ok: true });
    for (const name of SVC_VIEWS) expect(v(s, s.worker, name), name).toHaveLength(0);
  });

  it('expose the verification row for an open verify_identity job only', () => {
    const s = setup();
    const alice = s.user('alice');
    s.call(alice, mod.start_verification as any, {
      address_json: JSON.stringify(addr('9 Elm St', BASE_LAT, BASE_LNG)),
      doc_kind: 'state_id',
      secret_hash: 'e'.repeat(64),
    });
    const ver = [...s.h.db.verification.identity.filter(s.idOf(alice))][0];
    expect(v(s, s.worker, 'svc_verifications')).toHaveLength(0); // no job yet
    s.upload(alice, `idv/${ver.id}/doc.jpg`, 'image/jpeg');
    s.call(alice, mod.submit_verification as any, { verification_id: ver.id, object_key: `idv/${ver.id}/doc.jpg` });
    const rows = v(s, s.worker, 'svc_verifications');
    expect(rows.map(r => r.id)).toEqual([ver.id]);
    expect(rows[0].object_key).toBe(`idv/${ver.id}/doc.jpg`);
    expect(v(s, s.worker, 'svc_property_privates')).toHaveLength(1);
  });

  it('expose intake, assessment and coach rows for open plan/coach jobs, scoped to that subject', () => {
    const s = setup();
    const reporter = s.user('reporter');
    const owner = s.user('owner');
    const other = s.user('other');
    const rid = s.createReport(reporter);
    s.attach(reporter, rid);
    s.assess(reporter, rid);
    const ver = s.verify(owner);
    s.verify(other); // a second verified person on the same property
    s.call(other, mod.save_affected_intake as any, { property_id: ver.property_id, intake_json: '{"personaId":"x"}' });
    // Finish other's plan job so only owner's work stays open.
    const otherPlan = [...s.h.db.job.iter()].find(j => j.kind === 'plan')!;
    s.call(s.worker, mod.claim_job as any, { job_id: otherPlan.id, lease_ms: 60_000 });
    s.call(s.worker, mod.complete_job as any, { job_id: otherPlan.id, ok: true });

    s.call(owner, mod.save_affected_intake as any, { property_id: ver.property_id, intake_json: '{"personaId":"p1"}' });
    const profiles = v(s, s.worker, 'svc_affected_profiles');
    expect(profiles).toHaveLength(1);
    expect(profiles[0].identity.isEqual(s.idOf(owner))).toBe(true);
    expect(v(s, s.worker, 'svc_assessments').map(a => a.report_id)).toEqual([rid]);

    // The worker writes the plan for owner's open plan job; then the plan is visible while a coach job is open.
    s.call(s.worker, mod.record_recovery_plan as any, {
      identity: s.idOf(owner).toHexString(),
      property_id: ver.property_id,
      report_id: rid,
      json: '{}',
    });
    expect(v(s, s.worker, 'svc_recovery_plans')).toHaveLength(1);
    s.call(owner, mod.ask_coach as any, { property_id: ver.property_id, report_id: rid, text: 'What first?' });
    const msgs = v(s, s.worker, 'svc_coach_messages');
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs.every(m => m.identity.isEqual(s.idOf(owner)))).toBe(true);
  });
});
