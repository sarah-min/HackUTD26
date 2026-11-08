import { DbConnection, tables } from '@hack/stdb-bindings';
import type { AgentStep } from '@hack/contracts/agent';
import type {
  FrameRow,
  JobKind,
  JobRow,
  MediaAssetRow,
  PropertyPrivateRow,
  ReportPrivateRow,
  ReportRow,
  ServiceConnection,
  VerificationRow,
} from '@hack/agent';

// ServiceConnection over the SpacetimeDB SDK and Part 2's generated bindings (packages/stdb-bindings/README.md §6).
// Reads come from the local subscription cache: the worker-only svc_* views (rows exist only while their job is
// queued or leased, including svc_reports now that report is private) plus the public property table. Writes are the
// typed service reducers.

/** Minimal structural types for SDK values, so this file doesn't depend on SDK internals. */
type Ident = { toHexString(): string };
type Ts = { toMillis(): bigint | number };

const ms = (t: Ts | undefined | null): number | null => (t ? Number(t.toMillis()) : null);
const hex = (i: Ident | undefined | null): string | null => (i ? i.toHexString() : null);
const sid = (n: bigint | undefined | null): string | null => (n === undefined || n === null ? null : n.toString(10));

export function toU64(id: string): bigint {
  if (!/^\d{1,20}$/.test(id)) throw new Error(`invalid id ${id}`);
  return BigInt(id);
}

export const SERVICE_TABLES = [
  tables.svcJobs,
  tables.svcReportPrivates,
  tables.svcPropertyPrivates,
  tables.svcMediaAssets,
  tables.svcFrames,
  tables.svcVerifications,
  tables.svcAssessments,
  tables.svcAffectedProfiles,
  tables.svcRecoveryPlans,
  tables.svcCoachMessages,
  tables.svcReports, // report is private: reports for open jobs only, same row shape
  tables.property,
] as const;

export interface ConnectOptions {
  uri: string;
  module: string;
  /** Omit to mint a new identity (first run; see src/identity.ts). */
  token?: string;
  timeoutMs?: number;
}

/** Connects, subscribes to the service views and resolves once the initial rows are applied. */
export async function connectService(opts: ConnectOptions): Promise<{ conn: DbConnection; identityHex: string; token: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`SpacetimeDB connect timed out (${opts.module})`)), opts.timeoutMs ?? 30_000);
    let builder = DbConnection.builder().withUri(opts.uri).withDatabaseName(opts.module);
    if (opts.token) builder = builder.withToken(opts.token);
    builder
      .onConnect((conn: DbConnection, identity: Ident, token: string) => {
        conn
          .subscriptionBuilder()
          .onApplied(() => {
            clearTimeout(timer);
            resolve({ conn, identityHex: identity.toHexString(), token });
          })
          .onError((ctx: any) => { // reason: the SDK ErrorContext type is deeply generic
            clearTimeout(timer);
            reject(ctx?.event instanceof Error ? ctx.event : new Error('subscription error'));
          })
          .subscribe(SERVICE_TABLES as any); // reason: heterogeneous typed queries; the SDK accepts an array
      })
      .onConnectError((_ctx: unknown, err: Error) => {
        clearTimeout(timer);
        reject(err);
      })
      .build();
  });
}

export class SdkServiceConnection implements ServiceConnection {
  constructor(
    readonly conn: DbConnection,
    readonly identityHex: string,
  ) {}

  static async connect(opts: ConnectOptions & { token: string }): Promise<SdkServiceConnection> {
    const { conn, identityHex } = await connectService(opts);
    return new SdkServiceConnection(conn, identityHex);
  }

  disconnect(): void {
    this.conn.disconnect();
  }

  // ---- reads (local cache) ----
  async getJob(jobId: string): Promise<JobRow | null> {
    const id = toU64(jobId);
    for (const r of this.conn.db.svcJobs.iter()) if (r.id === id) return toJob(r);
    return null;
  }

  async listQueuedJobs(kinds: readonly JobKind[], limit: number): Promise<JobRow[]> {
    return [...this.conn.db.svcJobs.iter()]
      .filter((r) => r.state === 'queued' && kinds.includes(r.kind as JobKind))
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .slice(0, limit)
      .map(toJob);
  }

  async getReport(reportId: string): Promise<ReportRow | null> {
    const id = toU64(reportId);
    for (const r of this.conn.db.svcReports.iter())
      if (r.id === id)
        return {
          id: reportId, reporter: hex(r.reporter) ?? '', propertyId: sid(r.propertyId)!, cellId: r.cellId, status: r.status,
          hazard: r.hazard, selfDanger: r.selfDanger, lifeSafetyCsv: r.lifeSafetyCsv, overallLevel: r.overallLevel,
          usableFrames: r.usableFrames, totalFrames: r.totalFrames, statusReason: r.statusReason ?? null, claimed: r.claimed,
          source: r.source, createdAt: ms(r.createdAt) ?? 0, updatedAt: ms(r.updatedAt) ?? 0,
        };
    return null;
  }

  async getReportPrivate(reportId: string): Promise<ReportPrivateRow | null> {
    const id = toU64(reportId);
    for (const r of this.conn.db.svcReportPrivates.iter())
      if (r.reportId === id)
        return { reportId, isSelfReport: r.isSelfReport, addressLine1: r.addressLine1, lat: r.lat ?? null, lng: r.lng ?? null, notes: r.notes ?? null };
    return null;
  }

  async getPropertyPrivate(propertyId: string): Promise<PropertyPrivateRow | null> {
    const id = toU64(propertyId);
    for (const r of this.conn.db.svcPropertyPrivates.iter())
      if (r.propertyId === id)
        return {
          propertyId, normalized: r.normalized, line1: r.line1, city: r.city, state: r.state, zip: r.zip,
          lat: r.lat ?? null, lng: r.lng ?? null, countyFips: r.countyFips ?? null,
        };
    return null;
  }

  async listMedia(reportId: string, round?: number): Promise<MediaAssetRow[]> {
    const id = toU64(reportId);
    return [...this.conn.db.svcMediaAssets.iter()]
      .filter((r) => r.reportId === id && (round === undefined || r.round === round))
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((r) => ({
        id: sid(r.id)!, reportId, kind: r.kind === 'video' ? ('video' as const) : ('image' as const), objectKey: r.objectKey,
        contentType: r.contentType, sizeBytes: Number(r.sizeBytes), sha256: r.sha256, uploadedAt: ms(r.uploadedAt) ?? 0, round: r.round,
      }));
  }

  async listFrames(reportId: string): Promise<FrameRow[]> {
    const id = toU64(reportId);
    return [...this.conn.db.svcFrames.iter()]
      .filter((r) => r.reportId === id)
      .sort((a, b) => a.frameIndex - b.frameIndex)
      .map((r) => ({ id: sid(r.id)!, reportId, frameIndex: r.frameIndex, tSec: r.tSec, thumbKey: r.thumbKey, findingJson: r.findingJson }));
  }

  async getVerification(verificationId: string): Promise<VerificationRow | null> {
    const id = toU64(verificationId);
    for (const r of this.conn.db.svcVerifications.iter())
      if (r.id === id)
        return {
          id: verificationId, identity: hex(r.identity) ?? '', propertyId: sid(r.propertyId)!, docKind: r.docKind, state: r.state,
          failReason: r.failReason ?? null, objectKey: r.objectKey ?? null, attemptNo: r.attemptNo, createdAt: ms(r.createdAt) ?? 0,
        };
    return null;
  }

  // ---- service reducers (camelCase object args, README §5) ----
  claimJob(jobId: string, leaseMs: number) {
    return this.conn.reducers.claimJob({ jobId: toU64(jobId), leaseMs });
  }

  completeJob(jobId: string, ok: boolean, error?: string) {
    return this.conn.reducers.completeJob({ jobId: toU64(jobId), ok, error: ok ? undefined : error?.slice(0, 500) });
  }

  recordFrame(a: { reportId: string; frameIndex: number; tSec: number; thumbKey: string; findingJson: string }) {
    return this.conn.reducers.recordFrame({ reportId: toU64(a.reportId), frameIndex: a.frameIndex, tSec: a.tSec, thumbKey: a.thumbKey, findingJson: a.findingJson });
  }

  recordAgentStep(s: Omit<AgentStep, 'at'>) {
    return this.conn.reducers.recordAgentStep({
      reportId: toU64(s.reportId), seq: s.seq, kind: s.kind, name: s.name.slice(0, 80), summary: s.summary.slice(0, 400),
      visibility: s.visibility, durationMs: s.durationMs === undefined ? undefined : Math.max(0, Math.round(s.durationMs)),
    });
  }

  recordAssessment(a: { reportId: string; json: string; overallLevel: string; usableFrames: number; totalFrames: number; lifeSafetyCsv: string }) {
    return this.conn.reducers.recordAssessment({
      reportId: toU64(a.reportId), json: a.json, overallLevel: a.overallLevel, usableFrames: a.usableFrames, totalFrames: a.totalFrames,
      lifeSafetyCsv: a.lifeSafetyCsv,
    });
  }

  recordVerification(a: { verificationId: string; ok: boolean; failReason?: string; nameOnDoc?: string }) {
    return this.conn.reducers.recordVerification({
      verificationId: toU64(a.verificationId), ok: a.ok, failReason: a.ok ? undefined : a.failReason, nameOnDoc: a.ok ? a.nameOnDoc?.slice(0, 120) : undefined,
    });
  }

  recordAreaNotices(a: { propertyId: string; countyFips: string; noticesJson: string }) {
    return this.conn.reducers.recordAreaNotices({ propertyId: toU64(a.propertyId), countyFips: a.countyFips, noticesJson: a.noticesJson });
  }

  recordRecoveryPlan(a: { identity: string; propertyId: string; reportId: string; json: string }) {
    return this.conn.reducers.recordRecoveryPlan({ identity: a.identity, propertyId: toU64(a.propertyId), reportId: toU64(a.reportId), json: a.json });
  }

  recordCoachReply(a: { identity: string; propertyId: string; reportId: string; text: string }) {
    return this.conn.reducers.recordCoachReply({ identity: a.identity, propertyId: toU64(a.propertyId), reportId: toU64(a.reportId), text: a.text });
  }
}

type SvcJob = {
  id: bigint; kind: string; reportId?: bigint; propertyId?: bigint; verificationId?: bigint; subject?: Ident; payloadJson: string;
  state: string; attempts: number; leaseOwner?: Ident; leaseExpiresAt?: Ts; lastError?: string; createdAt: Ts;
};

function toJob(r: SvcJob): JobRow {
  return {
    id: sid(r.id)!, kind: r.kind as JobKind, reportId: sid(r.reportId), propertyId: sid(r.propertyId), verificationId: sid(r.verificationId),
    subject: hex(r.subject), payloadJson: r.payloadJson || '{}', state: r.state, attempts: r.attempts, leaseOwner: hex(r.leaseOwner),
    leaseExpiresAt: ms(r.leaseExpiresAt), lastError: r.lastError ?? null, createdAt: ms(r.createdAt) ?? 0,
  };
}
