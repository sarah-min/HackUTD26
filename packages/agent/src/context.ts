import type { AgentStep } from '@hack/contracts/agent';
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

/**
 * Typed service-identity access to the module. Reads come from Part 2's worker-only `svc_*` views (rows exist only
 * while their job is queued or leased) plus the public `report` / `property` tables; writes are service reducers.
 * The concrete adapter is apps/worker/src/stdb/sdk.ts (SpacetimeDB SDK + generated bindings).
 */
/**
 * Object storage as the worker uses it. Files live in SpacetimeDB (blob tables): the worker reads media and ID
 * images, writes frame thumbnails and deletes ID images (apps/worker/src/stdb/storage.ts).
 */
export interface ObjectStore {
  getObject(key: string): Promise<Buffer>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  ping(): Promise<boolean>;
}
/** @deprecated Old name from the S3 design; use ObjectStore. */
export type StoragePort = ObjectStore;

export interface ServiceConnection {
  readonly identityHex: string;
  // reads
  getJob(jobId: string): Promise<JobRow | null>;
  listQueuedJobs(kinds: readonly JobKind[], limit: number): Promise<JobRow[]>;
  getReport(reportId: string): Promise<ReportRow | null>;
  getReportPrivate(reportId: string): Promise<ReportPrivateRow | null>;
  getPropertyPrivate(propertyId: string): Promise<PropertyPrivateRow | null>;
  /** Media for the report; with `round`, only that upload round (analyze payload `{"round": n}`). */
  listMedia(reportId: string, round?: number): Promise<MediaAssetRow[]>;
  listFrames(reportId: string): Promise<FrameRow[]>;
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
  /** Replaces the county's public notices (CONTRACTS §5.2 record_area_notices). `noticesJson` = AreaNoticeInput[] JSON. */
  recordAreaNotices(args: { propertyId: string; countyFips: string; noticesJson: string }): Promise<void>;
  /** For Part 4's plan/coach handlers. `identity` = the job's `subject` (64-char hex). */
  recordRecoveryPlan(args: { identity: string; propertyId: string; reportId: string; json: string }): Promise<void>;
  recordCoachReply(args: { identity: string; propertyId: string; reportId: string; text: string }): Promise<void>;
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
  storage: ObjectStore;
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
