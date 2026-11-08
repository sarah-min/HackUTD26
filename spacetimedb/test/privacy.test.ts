// Privacy regression matrix: every caller kind × every view, plus unauthorized reducer attempts that
// name other people's ids. If one of these fails, a privacy boundary moved. Do not "fix" the test.
import { describe, expect, it } from 'vitest';
import { setup, mod, addr, BASE_LAT, BASE_LNG, HEX } from './helpers';

const MY = [
  'my_reports', 'my_report_privates', 'my_verifications', 'my_property_privates', 'my_media_assets',
  'my_frames', 'my_assessments', 'my_agent_steps', 'my_affected_profiles', 'my_recovery_plans', 'my_coach_messages',
] as const;
const SVC = [
  'svc_jobs', 'svc_report_privates', 'svc_property_privates', 'svc_media_assets', 'svc_frames',
  'svc_assessments', 'svc_verifications', 'svc_affected_profiles', 'svc_recovery_plans', 'svc_coach_messages',
] as const;
const WEB = ['web_report_upload_auth', 'web_verification_auth', 'web_media_index'] as const;
type ViewName = (typeof MY)[number] | (typeof SVC)[number] | (typeof WEB)[number];

/** Two properties (A, B), reports on both, and one caller of each kind. */
function world() {
  const s = setup();
  const stranger = s.user('stranger');
  const reporterA = s.user('reporterA');
  const reporterB = s.user('reporterB');
  const pending = s.user('pending'); // started a verification for A, never decided
  const failed = s.user('failed'); // failed verification for A
  const ownerA = s.user('ownerA');
  const ownerB = s.user('ownerB');
  const web = s.user('web');
  s.call(s.internal, mod.admin_add_service as any, { identity: s.idOf(web).toHexString(), role: 'web' });
  const admin = s.user('admin'); // a real client identity with the admin role (not the module itself)
  s.call(s.internal, mod.admin_add_service as any, { identity: s.idOf(admin).toHexString(), role: 'admin' });

  const addrB = addr('900 Far Road', BASE_LAT + 0.1, BASE_LNG);

  const build = (reporter: any, over: Record<string, unknown>, flags: string) => {
    const rid = s.createReport(reporter, over);
    s.attach(reporter, rid);
    s.call(reporter, mod.submit_report as any, { report_id: rid });
    const job = s.jobsFor(rid).find(j => j.state === 'queued')!;
    s.call(s.worker, mod.claim_job as any, { job_id: job.id, lease_ms: 60_000 });
    s.call(s.worker, mod.record_frame as any, {
      report_id: rid, frame_index: 0, t_sec: 1, thumb_key: `frames/${rid}/0.jpg`, finding_json: '{}',
    });
    s.call(s.worker, mod.record_agent_step as any, {
      report_id: rid, seq: 0, kind: 'tool_call', name: 'status step', summary: 'reporter-visible', visibility: 'reporter',
    });
    s.call(s.worker, mod.record_agent_step as any, {
      report_id: rid, seq: 1, kind: 'tool_call', name: 'detail step', summary: 'affected-only', visibility: 'affected',
    });
    s.call(s.worker, mod.record_assessment as any, {
      report_id: rid, json: '{"secret":"damage-and-cost-detail"}', overall_level: 'major',
      usable_frames: 4, total_frames: 4, life_safety_csv: flags,
    });
    s.call(s.worker, mod.complete_job as any, { job_id: job.id, ok: true });
    return rid;
  };
  const reportA = build(reporterA, { notes: 'private note A' }, 'person_trapped');
  const reportB = build(reporterB, { address: addrB, notes: 'private note B' }, 'gas_leak_suspected');
  const propA = s.h.db.report.id.find(reportA)!.property_id;
  const propB = s.h.db.report.id.find(reportB)!.property_id;
  expect(propA).not.toBe(propB);

  const vA = s.verify(ownerA);
  const vB = s.verify(ownerB, addrB);
  const vFailed = s.verify(failed, addr('123 Main St', BASE_LAT, BASE_LNG), false);
  s.call(pending, mod.start_verification as any, {
    address_json: JSON.stringify(addr('123 Main St', BASE_LAT, BASE_LNG)),
    doc_kind: 'state_id',
    secret_hash: HEX('c'),
  });
  expect(vA.property_id).toBe(propA);
  expect(vB.property_id).toBe(propB);

  // Plans and coach messages for both owners (service writes them).
  for (const [who, v, rid] of [[ownerA, vA, reportA], [ownerB, vB, reportB]] as const) {
    s.call(who, mod.save_affected_intake as any, { property_id: v.property_id, intake_json: '{"personaId":"p"}' });
    s.call(s.worker, mod.record_recovery_plan as any, {
      identity: s.idOf(who).toHexString(), property_id: v.property_id, report_id: rid, json: '{"plan":"private"}',
    });
    s.call(who, mod.ask_coach as any, { property_id: v.property_id, report_id: rid, text: 'What first?' });
  }

  const rows = (who: any, name: ViewName) => s.view(who, (mod as any)[name]) as any[];
  const callers = { stranger, reporterA, pending, failed, ownerA, ownerB, web, worker: s.worker, admin };
  return { s, callers, reportA, reportB, propA, propB, vA, vB, vFailed, rows, addrB };
}

const json = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
const key = (rows: any[], k: string) => rows.map(r => r[k]).sort();

describe('privacy matrix: sender-scoped views', () => {
  it('a stranger sees nothing in any view', () => {
    const { callers, rows } = world();
    for (const name of [...MY, ...SVC, ...WEB]) expect(rows(callers.stranger, name), name).toHaveLength(0);
  });

  it('the reporter sees only their own report, its private row and reporter-visible steps', () => {
    const { callers, rows, reportA, reportB, s } = world();
    const w = callers.reporterA;
    expect(key(rows(w, 'my_reports'), 'id')).toEqual([reportA]);
    expect(key(rows(w, 'my_report_privates'), 'report_id')).toEqual([reportA]);
    expect(rows(w, 'my_agent_steps').map(x => x.visibility)).toEqual(['reporter']);
    expect(rows(w, 'my_agent_steps').every(x => x.report_id === reportA)).toBe(true);
    // No damage or cost detail, no property address, no media bytes/keys, no plans.
    for (const name of ['my_assessments', 'my_frames', 'my_media_assets', 'my_property_privates', 'my_verifications',
      'my_affected_profiles', 'my_recovery_plans', 'my_coach_messages'] as const) {
      expect(rows(w, name), name).toHaveLength(0);
    }
    expect(json(rows(w, 'my_agent_steps'))).not.toContain('affected-only');
    expect(s.h.db.report.id.find(reportB)).toBeTruthy(); // exists, just not theirs
    for (const name of [...SVC, ...WEB]) expect(rows(w, name), name).toHaveLength(0);
  });

  it('an unverified (pending) person sees only their own verification; no report details', () => {
    const { callers, rows } = world();
    const w = callers.pending;
    expect(rows(w, 'my_verifications')).toHaveLength(1);
    expect(rows(w, 'my_verifications')[0].state).toBe('pending');
    for (const name of MY.filter(n => n !== 'my_verifications')) expect(rows(w, name), name).toHaveLength(0);
    for (const name of [...SVC, ...WEB]) expect(rows(w, name), name).toHaveLength(0);
  });

  it('a failed verification never grants access', () => {
    const { callers, rows, vFailed } = world();
    const w = callers.failed;
    expect(key(rows(w, 'my_verifications'), 'id')).toEqual([vFailed.id]);
    expect(rows(w, 'my_verifications')[0].state).toBe('failed');
    for (const name of MY.filter(n => n !== 'my_verifications')) expect(rows(w, name), name).toHaveLength(0);
  });

  it('a verified owner sees only their own property, never the other one', () => {
    const { callers, rows, reportA, reportB, propA, propB } = world();
    const check = (who: any, mine: bigint, theirs: bigint, myProp: bigint, otherProp: bigint) => {
      expect(key(rows(who, 'my_report_privates'), 'report_id')).toEqual([mine]);
      expect(key(rows(who, 'my_property_privates'), 'property_id')).toEqual([myProp]);
      expect(rows(who, 'my_media_assets').every(m => m.report_id === mine)).toBe(true);
      expect(rows(who, 'my_media_assets').length).toBeGreaterThan(0);
      expect(rows(who, 'my_frames').every(f => f.report_id === mine)).toBe(true);
      expect(key(rows(who, 'my_assessments'), 'report_id')).toEqual([mine]);
      expect(rows(who, 'my_agent_steps').map(x => x.visibility).sort()).toEqual(['affected', 'reporter']);
      expect(rows(who, 'my_agent_steps').every(x => x.report_id === mine)).toBe(true);
      for (const name of ['my_affected_profiles', 'my_recovery_plans'] as const) {
        expect(rows(who, name), name).toHaveLength(1);
        expect(rows(who, name)[0].property_id).toBe(myProp);
      }
      expect(rows(who, 'my_coach_messages').every(m => m.property_id === myProp)).toBe(true);
      expect(rows(who, 'my_coach_messages').length).toBeGreaterThan(0);
      // Nothing from the other property, in any view.
      const all = MY.flatMap(n => rows(who, n));
      expect(all.some(r => r.report_id === theirs || r.property_id === otherProp)).toBe(false);
      expect(rows(who, 'my_reports')).toHaveLength(0); // verified != reporter
      for (const name of [...SVC, ...WEB]) expect(rows(who, name), name).toHaveLength(0);
    };
    check(callers.ownerA, reportA, reportB, propA, propB);
    check(callers.ownerB, reportB, reportA, propB, propA);
  });

  it('a verified owner never sees another person\'s plan, profile or coach messages (same property or not)', () => {
    const { callers, rows, s } = world();
    const idA = s.idOf(callers.ownerA);
    const idB = s.idOf(callers.ownerB);
    for (const r of [...rows(callers.ownerA, 'my_recovery_plans'), ...rows(callers.ownerA, 'my_affected_profiles'), ...rows(callers.ownerA, 'my_coach_messages')]) {
      expect(r.identity.isEqual(idA)).toBe(true);
    }
    for (const r of [...rows(callers.ownerB, 'my_recovery_plans'), ...rows(callers.ownerB, 'my_affected_profiles'), ...rows(callers.ownerB, 'my_coach_messages')]) {
      expect(r.identity.isEqual(idB)).toBe(true);
    }
    // Second verified person on property A: still sees none of ownerA's plan/profile/coach.
    const twin = s.user('twinA');
    s.verify(twin);
    for (const name of ['my_recovery_plans', 'my_affected_profiles', 'my_coach_messages'] as const) {
      expect(rows(twin, name), name).toHaveLength(0);
    }
  });

  it('svc_* views: only worker/admin, only open-job rows; web and everyone else get nothing', () => {
    const { callers, rows } = world();
    for (const name of SVC) {
      for (const k of ['stranger', 'reporterA', 'pending', 'failed', 'ownerA', 'ownerB', 'web'] as const) {
        expect(rows(callers[k], name), `${name} as ${k}`).toHaveLength(0);
      }
    }
    // Open plan/coach jobs exist for both owners.
    expect(rows(callers.worker, 'svc_jobs').length).toBeGreaterThan(0);
    expect(key(rows(callers.admin, 'svc_jobs'), 'id')).toEqual(key(rows(callers.worker, 'svc_jobs'), 'id'));
    expect(rows(callers.worker, 'svc_jobs').every(j => j.state === 'queued' || j.state === 'leased')).toBe(true);
  });

  it('web_* views: only web/admin; never idv/ keys; no failed verifications; worker cannot read them', () => {
    const { callers, rows, vFailed, vA } = world();
    for (const name of WEB) {
      for (const k of ['stranger', 'reporterA', 'pending', 'failed', 'ownerA', 'ownerB', 'worker'] as const) {
        expect(rows(callers[k], name), `${name} as ${k}`).toHaveLength(0);
      }
    }
    expect(rows(callers.web, 'web_media_index').length).toBeGreaterThan(0);
    expect(rows(callers.web, 'web_media_index').some(r => r.object_key.startsWith('idv/'))).toBe(false);
    expect(rows(callers.admin, 'web_media_index').some(r => r.object_key.startsWith('idv/'))).toBe(false);
    const vids = key(rows(callers.web, 'web_verification_auth'), 'verification_id');
    expect(vids).not.toContain(vFailed.id);
    expect(vids).toContain(vA.id);
    // Upload auth rows exist only for uploadable statuses (all reports here are assessed).
    expect(rows(callers.web, 'web_report_upload_auth')).toHaveLength(0);
  });

  it('web and worker are not reporters or verified owners (my_* stays empty for service roles)', () => {
    const { callers, rows } = world();
    for (const k of ['web', 'worker', 'admin'] as const) {
      for (const name of MY) expect(rows(callers[k], name), `${name} as ${k}`).toHaveLength(0);
    }
  });
});

describe('privacy matrix: public tables', () => {
  it('report rows carry no address, coordinates, notes or secret hash', () => {
    const { s } = world();
    for (const r of s.h.db.report.iter()) {
      const keys = Object.keys(r);
      for (const banned of ['address_line1', 'line1', 'lat', 'lng', 'notes', 'reporter_secret_hash', 'normalized']) {
        expect(keys, banned).not.toContain(banned);
      }
    }
  });

  it('property rows carry no address (only cell id, created_at and county)', () => {
    const { s } = world();
    for (const p of s.h.db.property.iter()) {
      expect(Object.keys(p).sort()).toEqual(['cell_id', 'county_fips', 'created_at', 'id']);
    }
  });

  it('area_cell_summary hides hazard flag types below 3 reports', () => {
    const { s, reportA } = world();
    const cell = s.h.db.report.id.find(reportA)!.cell_id;
    const c = s.h.db.area_cell_summary.cell_id.find(cell)!;
    expect(c.report_count_72h).toBe(1);
    expect(c.hazard_report_count_72h).toBe(1); // count is aggregate
    expect(c.hazard_flags_csv).toBe(''); // type is not
  });

  it('area_cell_summary reveals flag types only once a cell has 3 reports', () => {
    const { s, reportA } = world();
    const cell = s.h.db.report.id.find(reportA)!.cell_id;
    for (const n of ['x', 'y']) {
      const u = s.user(n);
      const rid = s.createReport(u);
      s.attach(u, rid);
      s.assess(u, rid, { flags: 'gas_leak_suspected' });
    }
    const c = s.h.db.area_cell_summary.cell_id.find(cell)!;
    expect(c.report_count_72h).toBe(3);
    expect(c.hazard_flags_csv).not.toBe('');
  });

  it('public tables expose only the intended names (no private table is public)', () => {
    const { s } = world();
    // reason: the harness db accessor exposes all tables; the public set is asserted in notices.test.ts via tableAccess.
    for (const t of ['report', 'property', 'area_cell_summary', 'area_notice']) expect((s.h.db as any)[t]).toBeTruthy();
  });
});

describe('privacy matrix: reducers reject unauthorized callers naming other people\'s ids', () => {
  const ARG = { scheduled_id: 1n, scheduled_at: { tag: 'Interval', value: 0n } };

  it('every worker/service reducer rejects stranger, reporter, pending, failed, verified owners and web', () => {
    const { s, callers, reportA, propA, vA } = world();
    const someJob = [...s.h.db.job.iter()][0];
    const idHex = s.idOf(callers.ownerA).toHexString();
    const attempts: [string, any][] = [
      ['claim_job', { job_id: someJob.id, lease_ms: 60_000 }],
      ['complete_job', { job_id: someJob.id, ok: true }],
      ['record_frame', { report_id: reportA, frame_index: 9, t_sec: 1, thumb_key: `frames/${reportA}/9.jpg`, finding_json: '{}' }],
      ['record_agent_step', { report_id: reportA, seq: 9, kind: 'tool_call', name: 'x', summary: 'x', visibility: 'affected' }],
      ['record_assessment', { report_id: reportA, json: '{}', overall_level: 'none', usable_frames: 4, total_frames: 4, life_safety_csv: '' }],
      ['record_verification', { verification_id: vA.id, ok: true, name_on_doc: 'X' }],
      ['record_recovery_plan', { identity: idHex, property_id: propA, report_id: reportA, json: '{}' }],
      ['record_coach_reply', { identity: idHex, property_id: propA, report_id: reportA, text: 'forged' }],
      ['record_area_notices', { property_id: propA, county_fips: '48113', notices_json: '[]' }],
    ];
    for (const who of ['stranger', 'reporterA', 'pending', 'failed', 'ownerA', 'ownerB', 'web'] as const) {
      for (const [name, args] of attempts) {
        expect(() => s.call(callers[who], (mod as any)[name], args), `${name} as ${who}`).toThrow(/unauthorized: service only/);
      }
    }
  });

  it('admin_add_service is admin-only: workers, web, owners and strangers are all rejected', () => {
    const { s, callers } = world();
    for (const who of ['stranger', 'reporterA', 'ownerA', 'worker', 'web'] as const) {
      expect(() => s.call(callers[who], mod.admin_add_service as any, { identity: HEX('d'), role: 'admin' }), who).toThrow(/admin only/);
    }
  });

  it('scheduled reducers cannot be triggered by any client role', () => {
    const { s, callers } = world();
    for (const who of ['stranger', 'ownerA', 'worker', 'web', 'admin'] as const) {
      expect(() => s.call(callers[who], mod.requeue_expired_jobs as any, { arg: ARG }), who).toThrow(/scheduled only/);
      expect(() => s.call(callers[who], mod.refresh_area_cells as any, { arg: ARG }), who).toThrow(/scheduled only/);
    }
  });

  it('reporter-only reducers reject other people\'s report ids', () => {
    const { s, callers, reportA, reportB } = world();
    // Nobody but the reporter can attach media to, or submit, a report.
    for (const who of ['stranger', 'ownerA', 'reporterA', 'web', 'worker'] as const) {
      expect(() => s.attach(callers[who], reportB), `attach ${who}`).toThrow();
      expect(() => s.call(callers[who], mod.submit_report as any, { report_id: reportB }), `submit ${who}`).toThrow();
    }
    expect(() => s.attach(callers.stranger, reportA)).toThrow();
  });

  it('a verification can only be submitted by its owner; others cannot attach their upload to it', () => {
    const { s, callers } = world();
    const vp = [...s.h.db.verification.iter()].find(v => v.state === 'pending')!;
    for (const who of ['stranger', 'ownerA', 'failed', 'web', 'worker'] as const) {
      expect(
        () => s.call(callers[who], mod.submit_verification as any, { verification_id: vp.id, object_key: `idv/${vp.id}/doc.jpg` }),
        who
      ).toThrow(/not your verification/);
    }
  });

  it('intake and coach are limited to owners verified for THAT property', () => {
    const { s, callers, propA, propB, reportA, reportB } = world();
    const mism = [
      [callers.ownerA, propB, reportB],
      [callers.ownerB, propA, reportA],
    ] as const;
    for (const [who, p, r] of mism) {
      expect(() => s.call(who, mod.save_affected_intake as any, { property_id: p, intake_json: '{}' })).toThrow(/verify for this property/);
      expect(() => s.call(who, mod.ask_coach as any, { property_id: p, report_id: r, text: 'hi' })).toThrow(/verify for this property/);
    }
    for (const who of ['stranger', 'reporterA', 'pending', 'failed'] as const) {
      expect(() => s.call(callers[who], mod.save_affected_intake as any, { property_id: propA, intake_json: '{}' }), who).toThrow(/verify for this property/);
      expect(() => s.call(callers[who], mod.ask_coach as any, { property_id: propA, report_id: reportA, text: 'hi' }), who).toThrow(/verify for this property/);
    }
    // A verified owner cannot point intake at a report on a different property.
    expect(() => s.call(callers.ownerA, mod.save_affected_intake as any, { property_id: propA, intake_json: '{}', report_id: reportB })).toThrow(/not on this property/);
  });

  it('the reporter secret hash is not exposed to strangers, only to the reporter, verified owners (hash only) and web', () => {
    const { callers, rows } = world();
    const holds = (who: any) =>
      json([...MY, ...SVC, ...WEB].flatMap(n => rows(who, n))).includes(HEX('a'));
    expect(holds(callers.stranger)).toBe(false);
    expect(holds(callers.pending)).toBe(false);
    expect(holds(callers.failed)).toBe(false);
    expect(holds(callers.reporterA)).toBe(true); // their own
  });

  it('ID images: idv/ keys are never in any view readable by non-service callers', () => {
    const { callers, rows } = world();
    for (const k of ['stranger', 'reporterA', 'pending', 'failed', 'ownerA', 'ownerB', 'web'] as const) {
      const all = [...MY, ...SVC, ...WEB].flatMap(n => rows(callers[k], n));
      // pending/failed/verified see only their OWN verification row (which carries its own key); nobody else's.
      const text = json(all);
      const own = k === 'pending' || k === 'failed' || k === 'ownerA' || k === 'ownerB';
      if (!own) expect(text, k).not.toContain('idv/');
    }
  });
});
