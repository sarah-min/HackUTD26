import type { AgentStep } from '@hack/contracts';
import type { StoragePort } from '@hack/storage';
import type { Logger } from './log';
import type { NimClient } from './nim';
import type {
  FrameRow,
  JobRow,
  MediaAssetRow,
  PropertyPrivateRow,
  ReportPrivateRow,
  ReportRow,
  VerificationRow,
} from './rows';

// CONTRACTS.md §9. Re-exported from apps/worker/src/handlers/types.ts (the contract location) so that
// packages/agent can type its tools without importing from an app.

export type JobKind = JobRow['kind'];

/** Typed service-identity access to the module (reducer calls + private reads). */
export interface ServiceConnection {
  readonly identityHex: string;
  call(reducer: string, args: unknown[]): Promise<void>;
  // reads
  getJob(jobId: string): Promise<JobRow | null>;
  listQueuedJobs(kinds: readonly JobKind[], limit: number): Promise<JobRow[]>;
  getReport(reportId: string): Promise<ReportRow | null>;
  getReportPrivate(reportId: string): Promise<ReportPrivateRow | null>;
  getPropertyPrivate(propertyId: string): Promise<PropertyPrivateRow | null>;
  listMedia(reportId: string): Promise<MediaAssetRow[]>;
  listFrames(reportId: string): Promise<FrameRow[]>;
  maxAgentStepSeq(reportId: string): Promise<number>;
  getVerification(verificationId: string): Promise<VerificationRow | null>;
  // service reducers (CONTRACTS §5.2)
  claimJob(jobId: string, leaseMs: number): Promise<void>;
  completeJob(jobId: string, ok: boolean, error?: string): Promise<void>;
  recordFrame(args: { reportId: string; frameIndex: number; tSec: number; thumbKey: string; findingJson: string }): Promise<void>;
  recordAgentStep(step: Omit<AgentStep, 'at'>): Promise<void>;
  recordAssessment(args: {
    reportId: string;
    json: string;
    overallLevel: string;
    usableFrames: number;
    totalFrames: number;
    lifeSafetyCsv: string;
  }): Promise<void>;
  recordVerification(args: { verificationId: string; ok: boolean; failReason?: string; nameOnDoc?: string }): Promise<void>;
}

export interface JobInfo {
  id: string;
  kind: JobKind;
  reportId?: string;
  propertyId?: string;
  verificationId?: string;
  subject?: string;
  payload: unknown;
}

export interface JobContext {
  job: JobInfo;
  stdb: ServiceConnection;
  storage: StoragePort;
  nim: NimClient;
  log: Logger; // never log IdDocumentFields or finance JSON
  /** analyze only: auto seq + record_agent_step. */
  step(s: Omit<AgentStep, 'reportId' | 'seq' | 'at'>): Promise<void>;
  /** Additive: cancellation for this job or tool call. */
  signal?: AbortSignal;
  /** Additive: per-job scratch space shared by tools (location, cost, findings…). */
  scratch?: Map<string, unknown>;
}

export type JobHandler = (ctx: JobContext) => Promise<void>;

const fallbackScratch = new WeakMap<object, Map<string, unknown>>();
export function scratchOf(ctx: JobContext): Map<string, unknown> {
  if (ctx.scratch) return ctx.scratch;
  let m = fallbackScratch.get(ctx.job);
  if (!m) fallbackScratch.set(ctx.job, (m = new Map()));
  return m;
}
