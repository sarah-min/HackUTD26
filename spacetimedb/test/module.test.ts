import { describe, it, expect } from 'vitest';
import { setup, mod, addr, HEX, BASE_LAT, BASE_LNG } from './helpers';

describe('auth: every reducer rejects the wrong caller', () => {
  it('service-only reducers reject a normal client', () => {
    const s = setup();
    const alice = s.user('alice');
    const rid = s.createReport(alice);
    const cases: [any, any][] = [
      [mod.claim_job, { job_id: 1n, lease_ms: 1000 }],
      [mod.complete_job, { job_id: 1n, ok: true }],
      [mod.record_frame, { report_id: rid, frame_index: 0, t_sec: 0, thumb_key: 'k', finding_json: '{}' }],
      [mod.record_agent_step, { report_id: rid, seq: 0, kind: 'pipeline', name: 'n', summary: 's', visibility: 'reporter' }],
      [mod.record_assessment, { report_id: rid, json: '{}', overall_level: 'minor', usable_frames: 1, total_frames: 1, life_safety_csv: '' }],
      [mod.record_verification, { verification_id: 1n, ok: true }],
      [mod.record_recovery_plan, { identity: HEX('c'), property_id: 1n, report_id: rid, json: '{}' }],
      [mod.record_coach_reply, { identity: HEX('c'), property_id: 1n, report_id: rid, text: 'hi' }],
    ];
    for (const [r, args] of cases) expect(() => s.call(alice, r, args)).toThrow(/unauthorized/);
  });

  it('admin_add_service is admin-only (workers are not admins)', () => {
    const s = setup();
    expect(() => s.call(s.user('alice'), mod.admin_add_service as any, { identity: HEX('d'), role: 'worker' })).toThrow(/admin only/);
    expect(() => s.call(s.worker, mod.admin_add_service as any, { identity: HEX('d'), role: 'admin' })).toThrow(/admin only/);
  });

  it('reporter-only reducers reject other identities', () => {
    const s = setup();
    const alice = s.user('alice');
    const bob = s.user('bob');
    const rid = s.createReport(alice);
    expect(() => s.attach(bob, rid)).toThrow(/reporter only/);
    s.attach(alice, rid);
    expect(() => s.call(bob, mod.submit_report as any, { report_id: rid })).toThrow(/reporter only/);
  });

  it('submit_verification is self-only; save_affected_intake/ask_coach need verification', () => {
    const s = setup();
    const alice = s.user('alice');
    const mallory = s.user('mallory');
    s.call(alice, mod.start_verification as any, { address_json: JSON.stringify(addr('9 Elm St', BASE_LAT, BASE_LNG)), doc_kind: 'state_id', secret_hash: HEX('e') });
    const v = [...s.h.db.verification.iter()][0];
    expect(() => s.call(mallory, mod.submit_verification as any, { verification_id: v.id, object_key: `idv/${v.id}/x.jpg` })).toThrow(/not your verification/);
    expect(() => s.call(alice, mod.submit_verification as any, { verification_id: v.id, object_key: `idv/999/x.jpg` })).toThrow(/idv\/<verificationId>/);
    expect(() => s.call(mallory, mod.save_affected_intake as any, { property_id: v.property_id, intake_json: '{}' })).toThrow(/verify for this property/);
    expect(() => s.call(mallory, mod.ask_coach as any, { property_id: v.property_id, report_id: 1n, text: 'hi' })).toThrow(/verify for this property/);
  });

  it('scheduled reducers cannot be called by clients', () => {
    const s = setup();
    const arg = { scheduled_id: 1n, scheduled_at: { tag: 'Interval', value: 0n } };
    expect(() => s.call(s.user('alice'), mod.requeue_expired_jobs as any, { arg })).toThrow(/scheduled only/);
    expect(() => s.call(s.worker, mod.refresh_area_cells as any, { arg })).toThrow(/scheduled only/);
  });
});

describe('report status machine', () => {
  it('draft → queued → processing → needs_more_footage → re-shoot → assessed', () => {
    const s = setup();
    const alice = s.user('alice');
    const rid = s.createReport(alice);
    const r0 = s.h.db.report.id.find(rid)!;
    expect(r0.status).toBe('draft');
    expect(r0.claimed).toBe(false);
    expect(() => s.call(alice, mod.submit_report as any, { report_id: rid })).toThrow(/attach at least one/);

    s.attach(alice, rid, 'video');
    expect(() => s.attach(alice, rid, 'video', 1)).toThrow(/max 1 video/);
    expect(() => s.attach(alice, rid, 'image', 2)).toThrow(/max 8 photos|no mixing/);
    s.call(alice, mod.submit_report as any, { report_id: rid });
    expect(s.h.db.report.id.find(rid)!.status).toBe('queued');
    expect(() => s.attach(alice, rid, 'image')).toThrow(/cannot (attach media|upload) in status queued/);

    const job = s.jobsFor(rid)[0];
    expect(job.kind).toBe('analyze');
    s.call(s.worker, mod.claim_job as any, { job_id: job.id, lease_ms: 60_000 });
    expect(s.h.db.report.id.find(rid)!.status).toBe('processing');
    expect(() => s.call(s.worker, mod.claim_job as any, { job_id: job.id, lease_ms: 60_000 })).toThrow(/not claimable/);

    s.call(s.worker, mod.record_assessment as any, { report_id: rid, json: '{}', overall_level: 'minor', usable_frames: 1, total_frames: 4, life_safety_csv: '' });
    s.call(s.worker, mod.complete_job as any, { job_id: job.id, ok: true });
    expect(s.h.db.report.id.find(rid)!.status).toBe('needs_more_footage');

    // Re-shoot: a fresh round allows up to 8 photos again.
    for (let i = 0; i < 8; i++) s.attach(alice, rid, 'image', i);
    expect(() => s.attach(alice, rid, 'image', 9)).toThrow(/max 8 photos/);
    s.assess(alice, rid, { level: 'major', usable: 8, total: 8, flags: 'downed_power_line' });
    const done = s.h.db.report.id.find(rid)!;
    expect(done.status).toBe('assessed');
    expect(done.overall_level).toBe('major');
    expect(done.life_safety_csv).toBe('downed_power_line');
  });

  it('two failed attempts → report failed; retry from failed reuses last media', () => {
    const s = setup();
    const alice = s.user('alice');
    const rid = s.createReport(alice);
    s.attach(alice, rid);
    s.call(alice, mod.submit_report as any, { report_id: rid });
    const job = s.jobsFor(rid)[0];
    s.call(s.worker, mod.claim_job as any, { job_id: job.id, lease_ms: 60_000 });
    s.call(s.worker, mod.complete_job as any, { job_id: job.id, ok: false, error: 'boom' });
    expect(s.h.db.job.id.find(job.id)!.state).toBe('queued');
    expect(s.h.db.report.id.find(rid)!.status).toBe('queued');
    s.call(s.worker, mod.claim_job as any, { job_id: job.id, lease_ms: 60_000 });
    s.call(s.worker, mod.complete_job as any, { job_id: job.id, ok: false, error: 'boom again' });
    expect(s.h.db.job.id.find(job.id)!.state).toBe('failed');
    const r = s.h.db.report.id.find(rid)!;
    expect(r.status).toBe('failed');
    expect(r.status_reason).toBe('boom again');
    s.call(alice, mod.submit_report as any, { report_id: rid });
    expect(s.h.db.report.id.find(rid)!.status).toBe('queued');
  });

  it('complete_job only by the leasing worker', () => {
    const s = setup();
    const alice = s.user('alice');
    const w2 = s.user('worker2');
    s.call(s.internal, mod.admin_add_service as any, { identity: s.idOf(w2).toHexString(), role: 'worker' });
    const rid = s.createReport(alice);
    s.attach(alice, rid);
    s.call(alice, mod.submit_report as any, { report_id: rid });
    const job = s.jobsFor(rid)[0];
    s.call(s.worker, mod.claim_job as any, { job_id: job.id, lease_ms: 60_000 });
    expect(() => s.call(w2, mod.complete_job as any, { job_id: job.id, ok: true })).toThrow(/another worker/);
  });
});

describe('leases', () => {
  it('expired leases are requeued, then fail after 2 attempts', () => {
    const s = setup();
    const alice = s.user('alice');
    const rid = s.createReport(alice);
    s.attach(alice, rid);
    s.call(alice, mod.submit_report as any, { report_id: rid });
    const job = s.jobsFor(rid)[0];
    const tick = { arg: { scheduled_id: 1n, scheduled_at: { tag: 'Interval', value: 0n } } };

    s.call(s.worker, mod.claim_job as any, { job_id: job.id, lease_ms: 1000 });
    s.call(s.internal, mod.requeue_expired_jobs as any, tick);
    expect(s.h.db.job.id.find(job.id)!.state).toBe('leased'); // not expired yet
    s.advanceMs(1500);
    s.call(s.internal, mod.requeue_expired_jobs as any, tick);
    const j1 = s.h.db.job.id.find(job.id)!;
    expect(j1.state).toBe('queued');
    expect(j1.attempts).toBe(1);

    s.call(s.worker, mod.claim_job as any, { job_id: job.id, lease_ms: 1000 });
    s.advanceMs(1500);
    s.call(s.internal, mod.requeue_expired_jobs as any, tick);
    expect(s.h.db.job.id.find(job.id)!.state).toBe('failed');
    expect(s.h.db.report.id.find(rid)!.status).toBe('failed');
  });

  it('an expired lease can be re-claimed directly', () => {
    const s = setup();
    const alice = s.user('alice');
    const rid = s.createReport(alice);
    s.attach(alice, rid);
    s.call(alice, mod.submit_report as any, { report_id: rid });
    const job = s.jobsFor(rid)[0];
    s.call(s.worker, mod.claim_job as any, { job_id: job.id, lease_ms: 1000 });
    s.advanceMs(2000);
    s.call(s.worker, mod.claim_job as any, { job_id: job.id, lease_ms: 1000 });
    expect(s.h.db.job.id.find(job.id)!.state).toBe('leased');
  });
});

describe('property matching', () => {
  it('same address in different formatting → same property', () => {
    const s = setup();
    const a = s.user('a');
    const r1 = s.createReport(a, { address: addr('123 Main Street', BASE_LAT, BASE_LNG) });
    const r2 = s.createReport(a, { address: addr('123 main st.', null, null) });
    expect(s.h.db.report.id.find(r1)!.property_id).toBe(s.h.db.report.id.find(r2)!.property_id);
  });

  it('within 30 m → same property; ~100 m away → new property', () => {
    const s = setup();
    const a = s.user('a');
    const r1 = s.createReport(a, { address: addr('123 Main St', BASE_LAT, BASE_LNG) });
    const r2 = s.createReport(a, { address: addr('125 Main St', BASE_LAT + 0.00018, BASE_LNG) }); // ~20 m
    const r3 = s.createReport(a, { address: addr('300 Main St', BASE_LAT + 0.0009, BASE_LNG) }); // ~100 m
    const p = (id: bigint) => s.h.db.report.id.find(id)!.property_id;
    expect(p(r2)).toBe(p(r1));
    expect(p(r3)).not.toBe(p(r1));
  });

  it('start_verification matches the reporter-created property', () => {
    const s = setup();
    const rid = s.createReport(s.user('reporter'), { address: addr('123 Main Street', BASE_LAT, BASE_LNG) });
    const v = s.verify(s.user('owner'), addr('123 MAIN ST', BASE_LAT, BASE_LNG));
    expect(v.property_id).toBe(s.h.db.report.id.find(rid)!.property_id);
  });

  it('rejects malformed input', () => {
    const s = setup();
    const a = s.user('a');
    expect(() => s.createReport(a, { hazard: 'meteor' })).toThrow(/invalid hazard/);
    expect(() => s.createReport(a, { reporterSecretHash: 'abc' })).toThrow(/reporterSecretHash/);
    expect(() => s.createReport(a, { address: addr('1 X St', 32, null) })).toThrow(/lat and lng/);
  });
});

describe('verification', () => {
  it('rate limits start_verification to 3 per hour', () => {
    const s = setup();
    const a = s.user('a');
    const start = () =>
      s.call(a, mod.start_verification as any, { address_json: JSON.stringify(addr('1 Oak St', BASE_LAT, BASE_LNG)), doc_kind: 'drivers_license', secret_hash: HEX('f') });
    start();
    start();
    start();
    expect(start).toThrow(/rate_limited/);
    s.advanceMs(61 * 60 * 1000);
    expect(start).not.toThrow();
    const rows = [...s.h.db.verification.identity.filter(s.idOf(a))];
    expect(rows.map(r => r.attempt_no)).toEqual([1, 2, 3, 4]);
  });

  it('ok flips claimed on existing reports and new reports start claimed; object_key cleared', () => {
    const s = setup();
    const reporter = s.user('reporter');
    const r1 = s.createReport(reporter);
    expect(s.h.db.report.id.find(r1)!.claimed).toBe(false);
    const v = s.verify(s.user('owner'));
    expect(v.state).toBe('verified');
    expect(v.object_key).toBeUndefined();
    expect(v.name_on_doc).toBe('SPECIMEN PERSON');
    expect(s.h.db.report.id.find(r1)!.claimed).toBe(true);
    const r2 = s.createReport(reporter);
    expect(s.h.db.report.id.find(r2)!.claimed).toBe(true);
  });

  it('a failed verification does not claim and stores the reason', () => {
    const s = setup();
    const r1 = s.createReport(s.user('reporter'));
    const v = s.verify(s.user('owner'), undefined, false);
    expect(v.state).toBe('failed');
    expect(v.fail_reason).toBe('address_mismatch');
    expect(v.object_key).toBeUndefined();
    expect(s.h.db.report.id.find(r1)!.claimed).toBe(false);
  });

  it('verify_identity job failing twice → verification failed/unreadable', () => {
    const s = setup();
    const a = s.user('a');
    s.call(a, mod.start_verification as any, { address_json: JSON.stringify(addr('1 Oak St', BASE_LAT, BASE_LNG)), doc_kind: 'state_id', secret_hash: HEX('1') });
    const v = [...s.h.db.verification.iter()][0];
    s.upload(a, `idv/${v.id}/a.jpg`, 'image/jpeg');
    s.call(a, mod.submit_verification as any, { verification_id: v.id, object_key: `idv/${v.id}/a.jpg` });
    const job = [...s.h.db.job.iter()].find(j => j.verification_id === v.id)!;
    for (let i = 0; i < 2; i++) {
      s.call(s.worker, mod.claim_job as any, { job_id: job.id, lease_ms: 60_000 });
      expect(s.h.db.verification.id.find(v.id)!.state).toBe('processing');
      s.call(s.worker, mod.complete_job as any, { job_id: job.id, ok: false, error: 'vl timeout' });
    }
    const after = s.h.db.verification.id.find(v.id)!;
    expect(after.state).toBe('failed');
    expect(after.fail_reason).toBe('unreadable');
    expect(after.object_key).toBeUndefined();
  });
});

describe('area cells', () => {
  it('flag types hidden below 3 reports; counts and severe counts correct', () => {
    const s = setup();
    const a = s.user('a');
    const mk = (i: number, flags: string, level = 'minor') => {
      const rid = s.createReport(a, { address: addr(`${100 + i * 2} Main St`, BASE_LAT + i * 0.0003, BASE_LNG) });
      s.attach(a, rid);
      s.assess(a, rid, { flags, level });
      return rid;
    };
    const r1 = mk(0, 'gas_leak_suspected', 'major');
    const cell = s.h.db.report.id.find(r1)!.cell_id;
    mk(1, 'downed_power_line');
    // Make sure both landed in the same ~250 m cell.
    const sameCell = [...s.h.db.report.cell_id.filter(cell)].length;
    expect(sameCell).toBe(2);
    let c = s.h.db.area_cell_summary.cell_id.find(cell)!;
    expect(c.report_count_72h).toBe(2);
    expect(c.hazard_report_count_72h).toBe(2);
    expect(c.severe_hazard_count_72h).toBe(1);
    expect(c.worst_level).toBe('major');
    expect(c.hazard_flags_csv).toBe('');

    mk(2, '');
    c = s.h.db.area_cell_summary.cell_id.find(cell)!;
    expect(c.report_count_72h).toBe(3);
    expect(c.hazard_report_count_72h).toBe(2);
    expect(c.hazard_flags_csv).toBe('downed_power_line,gas_leak_suspected');
  });

  it('cells expire after 72 h on refresh', () => {
    const s = setup();
    const a = s.user('a');
    const rid = s.createReport(a);
    s.attach(a, rid);
    s.assess(a, rid, { flags: 'active_fire' });
    const cell = s.h.db.report.id.find(rid)!.cell_id;
    const tick = { arg: { scheduled_id: 1n, scheduled_at: { tag: 'Interval', value: 0n } } };
    s.call(s.internal, mod.refresh_area_cells as any, tick);
    expect(s.h.db.area_cell_summary.cell_id.find(cell)).toBeTruthy();
    s.advanceMs(73 * 3600 * 1000);
    s.call(s.internal, mod.refresh_area_cells as any, tick);
    expect(s.h.db.area_cell_summary.cell_id.find(cell)).toBeFalsy();
  });

  it('needs_more_footage reports are not counted', () => {
    const s = setup();
    const a = s.user('a');
    const rid = s.createReport(a);
    s.attach(a, rid);
    s.assess(a, rid, { usable: 1, total: 4 });
    const cell = s.h.db.report.id.find(rid)!.cell_id;
    expect(s.h.db.area_cell_summary.cell_id.find(cell)).toBeFalsy();
  });
});

describe('views (T2.5 visibility)', () => {
  function scenario() {
    const s = setup();
    const reporter = s.user('reporter');
    const owner = s.user('owner');
    const stranger = s.user('stranger');
    const rid = s.createReport(reporter, { notes: 'elderly man on porch' });
    s.attach(reporter, rid);
    s.call(reporter, mod.submit_report as any, { report_id: rid });
    const job = s.jobsFor(rid)[0];
    s.call(s.worker, mod.claim_job as any, { job_id: job.id, lease_ms: 60_000 });
    s.call(s.worker, mod.record_frame as any, { report_id: rid, frame_index: 0, t_sec: 1, thumb_key: `frames/${rid}/0.jpg`, finding_json: '{}' });
    s.call(s.worker, mod.record_agent_step as any, { report_id: rid, seq: 0, kind: 'pipeline', name: 'extract_frames', summary: 'ok', visibility: 'reporter' });
    s.call(s.worker, mod.record_agent_step as any, { report_id: rid, seq: 1, kind: 'tool_call', name: 'estimate_repair_cost', summary: '$', visibility: 'affected' });
    s.call(s.worker, mod.record_assessment as any, { report_id: rid, json: '{"x":1}', overall_level: 'major', usable_frames: 4, total_frames: 4, life_safety_csv: '' });
    s.call(s.worker, mod.complete_job as any, { job_id: job.id, ok: true });
    return { s, reporter, owner, stranger, rid };
  }

  it('unverified identities see no frames, assessments, media or private rows', () => {
    const { s, stranger, owner } = scenario();
    for (const who of [stranger, owner]) {
      expect(s.view(who, mod.my_frames as any)).toHaveLength(0);
      expect(s.view(who, mod.my_assessments as any)).toHaveLength(0);
      expect(s.view(who, mod.my_media_assets as any)).toHaveLength(0);
      expect(s.view(who, mod.my_report_privates as any)).toHaveLength(0);
      expect(s.view(who, mod.my_property_privates as any)).toHaveLength(0);
      expect(s.view(who, mod.my_agent_steps as any)).toHaveLength(0);
    }
  });

  it('a failed verification still sees nothing; a verified one sees everything', () => {
    const { s, owner, rid } = scenario();
    s.verify(owner, undefined, false);
    expect(s.view(owner, mod.my_assessments as any)).toHaveLength(0);
    s.verify(owner);
    expect(s.view(owner, mod.my_frames as any)).toHaveLength(1);
    expect(s.view(owner, mod.my_assessments as any)).toHaveLength(1);
    expect(s.view(owner, mod.my_media_assets as any)).toHaveLength(1);
    expect((s.view(owner, mod.my_report_privates as any) as any[]).map((r: any) => r.report_id)).toEqual([rid]);
    expect(s.view(owner, mod.my_property_privates as any)).toHaveLength(1);
    expect(s.view(owner, mod.my_agent_steps as any)).toHaveLength(2);
    expect(s.view(owner, mod.my_verifications as any)).toHaveLength(2);
  });

  it('the reporter sees only reporter-visible steps and their own private row, never frames/assessment', () => {
    const { s, reporter, rid } = scenario();
    const steps = s.view(reporter, mod.my_agent_steps as any) as any[];
    expect(steps.map(x => x.name)).toEqual(['extract_frames']);
    expect((s.view(reporter, mod.my_report_privates as any) as any[]).map((r: any) => r.report_id)).toEqual([rid]);
    expect(s.view(reporter, mod.my_frames as any)).toHaveLength(0);
    expect(s.view(reporter, mod.my_assessments as any)).toHaveLength(0);
    expect(s.view(reporter, mod.my_reports as any)).toHaveLength(1);
  });
});

describe('affected intake, plans and coach', () => {
  it('save_affected_intake picks the most severe assessed report and enqueues a plan job', () => {
    const s = setup();
    const reporter = s.user('reporter');
    const owner = s.user('owner');
    const r1 = s.createReport(reporter);
    s.attach(reporter, r1);
    s.assess(reporter, r1, { level: 'minor' });
    const r2 = s.createReport(reporter);
    s.attach(reporter, r2);
    s.assess(reporter, r2, { level: 'destroyed' });
    const v = s.verify(owner);
    s.call(owner, mod.save_affected_intake as any, { property_id: v.property_id, intake_json: '{"personaId":"p1"}' });
    const plan = [...s.h.db.job.iter()].find(j => j.kind === 'plan')!;
    expect(plan.report_id).toBe(r2);
    expect(plan.subject!.isEqual(s.idOf(owner))).toBe(true);
    // upsert, not duplicate
    s.call(owner, mod.save_affected_intake as any, { property_id: v.property_id, intake_json: '{"personaId":"p2"}', report_id: r1 });
    expect(s.view(owner, mod.my_affected_profiles as any)).toHaveLength(1);
    expect([...s.h.db.job.iter()].filter(j => j.kind === 'plan').map(j => j.report_id)).toEqual([r2, r1]);
  });

  it('save_affected_intake errors without an assessed report', () => {
    const s = setup();
    const owner = s.user('owner');
    const v = s.verify(owner);
    expect(() => s.call(owner, mod.save_affected_intake as any, { property_id: v.property_id, intake_json: '{}' })).toThrow(/no assessed report/);
  });

  it('ask_coach needs a plan and allows one pending reply', () => {
    const s = setup();
    const reporter = s.user('reporter');
    const owner = s.user('owner');
    const rid = s.createReport(reporter);
    s.attach(reporter, rid);
    s.assess(reporter, rid);
    const v = s.verify(owner);
    const ask = () => s.call(owner, mod.ask_coach as any, { property_id: v.property_id, report_id: rid, text: 'How do I pay the gap?' });
    expect(ask).toThrow(/no recovery plan/);
    s.call(s.worker, mod.record_recovery_plan as any, { identity: s.idOf(owner).toHexString(), property_id: v.property_id, report_id: rid, json: '{}' });
    s.call(s.worker, mod.record_recovery_plan as any, { identity: s.idOf(owner).toHexString(), property_id: v.property_id, report_id: rid, json: '{"v":2}' });
    expect(s.view(owner, mod.my_recovery_plans as any)).toHaveLength(1);
    ask();
    expect(ask).toThrow(/already pending/);
    s.call(s.worker, mod.record_coach_reply as any, { identity: s.idOf(owner).toHexString(), property_id: v.property_id, report_id: rid, text: 'Start with savings.' });
    const msgs = s.view(owner, mod.my_coach_messages as any) as any[];
    expect(msgs.map(m => m.role)).toEqual(['user', 'assistant']);
    expect(s.view(s.user('stranger'), mod.my_coach_messages as any)).toHaveLength(0);
  });
});
