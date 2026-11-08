import type { AgentStep } from '@hack/contracts/agent';
import type { JobKind, JobRow, Logger, NimClient, ServiceConnection } from '@hack/agent';
import type { StoragePort } from '@hack/storage';
import type { JobContext, JobHandler } from './handlers/types';

// ARCHITECTURE §6.6 / stdb-bindings README §6: watch svc_jobs → claim_job(lease) → proceed only when the row shows
// state 'leased' with leaseOwner == self → run the handler → complete_job. Lease expiry + requeue_expired_jobs
// (module, max 2 attempts) handle crashes.

export const LEASE_MS = 120_000;
/** How long to wait for our own claim to appear in the subscription cache. */
const LEASE_CONFIRM_MS = 3_000;

/**
 * First agent_step seq for a job. The worker can't read agent_step (no svc view), so seqs are partitioned:
 * 1000 per analyze round (re-shoots) and 100 per retry attempt, which keeps the timeline ordered across both.
 */
export function stepSeqBase(job: Pick<JobRow, 'attempts'>, payload: unknown): number {
  const round = Number((payload as { round?: unknown } | null)?.round ?? 0);
  const r = Number.isInteger(round) && round >= 0 ? Math.min(round, 60) : 0;
  return r * 1000 + Math.min(job.attempts, 9) * 100;
}

export interface RunnerOptions {
  stdb: ServiceConnection;
  storage: StoragePort;
  nim: NimClient;
  log: Logger;
  handlers: Partial<Record<JobKind, JobHandler>>;
  concurrency: number;
  pollMs?: number;
}

export class Runner {
  private running = false;
  private readonly inflight = new Map<string, Promise<void>>();
  private loopPromise: Promise<void> | null = null;
  private readonly abort = new AbortController();

  constructor(private readonly opts: RunnerOptions) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loopPromise = this.loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.abort.abort(new Error('worker shutting down'));
    await this.loopPromise;
    await Promise.allSettled(this.inflight.values());
  }

  /** One polling pass; exported for tests. Returns the job ids started. */
  async tick(): Promise<string[]> {
    const { stdb, handlers, concurrency } = this.opts;
    const free = concurrency - this.inflight.size;
    if (free <= 0) return [];
    const kinds = Object.keys(handlers) as JobKind[];
    const queued = await stdb.listQueuedJobs(kinds, free * 2);
    const started: string[] = [];
    for (const job of queued) {
      if (started.length >= free) break;
      if (this.inflight.has(job.id)) continue;
      const claimed = await this.claim(job);
      if (!claimed) continue;
      const p = this.execute(claimed).finally(() => this.inflight.delete(job.id));
      this.inflight.set(job.id, p);
      started.push(job.id);
    }
    return started;
  }

  private async loop(): Promise<void> {
    const pollMs = this.opts.pollMs ?? 1_000;
    while (this.running) {
      try {
        await this.tick();
      } catch (e) {
        this.opts.log.warn('poll failed', { error: (e as Error).message });
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }

  private async claim(job: JobRow): Promise<JobRow | null> {
    const { stdb, log } = this.opts;
    try {
      await stdb.claimJob(job.id, LEASE_MS);
    } catch (e) {
      log.debug('claim rejected', { jobId: job.id, error: (e as Error).message });
      return null;
    }
    const deadline = Date.now() + LEASE_CONFIRM_MS;
    for (;;) {
      const fresh = await stdb.getJob(job.id);
      if (fresh && fresh.state === 'leased' && fresh.leaseOwner === stdb.identityHex) return fresh;
      if (fresh && fresh.leaseOwner && fresh.leaseOwner !== stdb.identityHex) return null; // another worker won
      if (Date.now() >= deadline) {
        log.warn('claim not confirmed in time; leaving the job for the lease scheduler', { jobId: job.id });
        return null;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  private async execute(job: JobRow): Promise<void> {
    const { stdb, storage, nim, log, handlers } = this.opts;
    const handler = handlers[job.kind];
    const jobLog = log.child(`${job.kind}#${job.id}`);
    let payload: unknown = {};
    try {
      payload = JSON.parse(job.payloadJson || '{}');
    } catch {
      payload = {};
    }
    let seq = stepSeqBase(job, payload);
    const ctx: JobContext = {
      job: {
        id: job.id,
        kind: job.kind,
        reportId: job.reportId ?? undefined,
        propertyId: job.propertyId ?? undefined,
        verificationId: job.verificationId ?? undefined,
        subject: job.subject ?? undefined,
        payload,
      },
      stdb,
      storage,
      nim,
      log: jobLog,
      signal: this.abort.signal,
      scratch: new Map(),
      step: async (s: Omit<AgentStep, 'reportId' | 'seq' | 'at'>) => {
        if (!job.reportId) return;
        const mySeq = seq++;
        try {
          await stdb.recordAgentStep({ ...s, summary: s.summary.slice(0, 400), reportId: job.reportId, seq: mySeq });
        } catch (e) {
          jobLog.warn('record_agent_step failed', { error: (e as Error).message, step: s.name });
        }
      },
    };
    const t0 = Date.now();
    try {
      if (!handler) throw new Error(`no handler for ${job.kind}`);
      await handler(ctx);
      await stdb.completeJob(job.id, true);
      jobLog.info('job done', { ms: Date.now() - t0 });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      jobLog.error('job failed', { ms: Date.now() - t0, error: message.slice(0, 300) });
      await stdb.completeJob(job.id, false, message.slice(0, 300)).catch((err: Error) =>
        jobLog.error('complete_job failed', { error: err.message }),
      );
    }
  }
}
