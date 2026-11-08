// Job queue helpers shared by service reducers and the scheduled requeue.
import type { Identity, Timestamp } from 'spacetimedb';
import { MAX_JOB_ATTEMPTS, type Ctx } from './constants';

type JobRow = NonNullable<ReturnType<Ctx['db']['job']['id']['find']>>;

export function enqueueJob(
  ctx: Ctx,
  j: {
    kind: 'analyze' | 'verify_identity' | 'plan' | 'coach';
    report_id?: bigint;
    property_id?: bigint;
    verification_id?: bigint;
    subject?: Identity;
    payload?: unknown;
  }
): JobRow {
  return ctx.db.job.insert({
    id: 0n,
    kind: j.kind,
    report_id: j.report_id,
    property_id: j.property_id,
    verification_id: j.verification_id,
    subject: j.subject,
    payload_json: JSON.stringify(j.payload ?? {}),
    state: 'queued',
    attempts: 0,
    lease_owner: undefined,
    lease_expires_at: undefined,
    last_error: undefined,
    created_at: ctx.timestamp,
  });
}

export function leaseExpired(job: JobRow, now: Timestamp): boolean {
  return (
    job.state === 'leased' &&
    job.lease_expires_at !== undefined &&
    job.lease_expires_at.microsSinceUnixEpoch <= now.microsSinceUnixEpoch
  );
}

/** Side effects when a job permanently fails (CONTRACTS §5.2 complete_job). */
function onPermanentFailure(ctx: Ctx, job: JobRow, error: string): void {
  if (job.kind === 'analyze' && job.report_id !== undefined) {
    const r = ctx.db.report.id.find(job.report_id);
    if (r) {
      ctx.db.report.id.update({ ...r, status: 'failed', status_reason: error.slice(0, 200), updated_at: ctx.timestamp });
    }
  } else if (job.kind === 'verify_identity' && job.verification_id !== undefined) {
    const v = ctx.db.verification.id.find(job.verification_id);
    if (v && (v.state === 'pending' || v.state === 'processing')) {
      ctx.db.verification.id.update({
        ...v,
        state: 'failed',
        fail_reason: 'unreadable',
        object_key: undefined,
        decided_at: ctx.timestamp,
      });
    }
  }
}

/** Record a failed attempt: requeue if attempts remain, else mark failed. */
export function failAttempt(ctx: Ctx, job: JobRow, error: string): void {
  const attempts = job.attempts + 1;
  if (attempts < MAX_JOB_ATTEMPTS) {
    ctx.db.job.id.update({
      ...job,
      state: 'queued',
      attempts,
      lease_owner: undefined,
      lease_expires_at: undefined,
      last_error: error.slice(0, 500),
    });
    // A requeued analyze job sends the report back to 'queued' for the status timeline.
    if (job.kind === 'analyze' && job.report_id !== undefined) {
      const r = ctx.db.report.id.find(job.report_id);
      if (r && r.status === 'processing') ctx.db.report.id.update({ ...r, status: 'queued', updated_at: ctx.timestamp });
    }
    return;
  }
  ctx.db.job.id.update({
    ...job,
    state: 'failed',
    attempts,
    lease_owner: undefined,
    lease_expires_at: undefined,
    last_error: error.slice(0, 500),
  });
  onPermanentFailure(ctx, job, error);
}
