import { describe, it, expect } from 'vitest';
import { setup, mod } from './helpers';

const tick = { arg: { scheduled_id: 1n, scheduled_at: { tag: 'Interval', value: 0n } } };

describe('scheduled reducer auth', () => {
  it('rejects a normal client', () => {
    const s = setup();
    expect(() => s.call(s.user('alice'), mod.requeue_expired_jobs as any, tick)).toThrow(/scheduled only/);
    expect(() => s.call(s.user('alice'), mod.refresh_area_cells as any, tick)).toThrow(/scheduled only/);
  });

  it('accepts the internal caller and requeues an expired lease', () => {
    const s = setup();
    const alice = s.user('alice');
    const rid = s.createReport(alice);
    s.attach(alice, rid);
    s.call(alice, mod.submit_report as any, { report_id: rid });
    const job = s.jobsFor(rid)[0];
    s.call(s.worker, mod.claim_job as any, { job_id: job.id, lease_ms: 1000 });
    expect(() => s.call(s.internal, mod.requeue_expired_jobs as any, tick)).not.toThrow();
    expect(s.h.db.job.id.find(job.id)!.state).toBe('leased');
    s.advanceMs(1500);
    s.call(s.internal, mod.requeue_expired_jobs as any, tick);
    const j = s.h.db.job.id.find(job.id)!;
    expect(j.state).toBe('queued');
    expect(j.last_error).toBe('lease expired');
  });

  // Not covered: sender == ctx.databaseIdentity (the live-host scheduler case). TestAuth has no way to
  // make a caller whose identity equals the database identity, so this branch is verified on the live host
  // via `spacetime logs` (no 'scheduled only' errors).
});
