import type { AgentStep } from '@hack/contracts';
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
import type { StdbHttp } from './http';
import { opt } from './sats';

// ServiceConnection over the HTTP API. Column names follow CONTRACTS.md §5.1 (snake_case in the module,
// camelCase here). Enum-like columns are compared as strings (VERIFY with Part 2's module).

type Row = Record<string, unknown>;
const id = (v: string) => {
  if (!/^\d+$/.test(v)) throw new Error(`invalid id ${v}`);
  return v;
};
const num = (v: unknown, d = 0) => (v === null || v === undefined || v === '' ? d : Number(v));
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const ostr = (v: unknown) => (v === null || v === undefined ? null : String(v));
const onum = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const enumStr = (v: unknown) => (v && typeof v === 'object' && 'tag' in (v as Row) ? String((v as Row).tag) : str(v));

export class HttpServiceConnection implements ServiceConnection {
  constructor(
    private readonly http: StdbHttp,
    readonly identityHex: string,
  ) {}

  static async connect(http: StdbHttp): Promise<HttpServiceConnection> {
    return new HttpServiceConnection(http, await http.identityHex());
  }

  call(reducer: string, args: unknown[]) {
    return this.http.call(reducer, args);
  }

  private async one(query: string): Promise<Row | null> {
    return (await this.http.sql(query))[0] ?? null;
  }

  // ---- reads ----
  async getJob(jobId: string) {
    const r = await this.one(`SELECT * FROM job WHERE id = ${id(jobId)}`);
    return r ? toJob(r) : null;
  }

  async listQueuedJobs(kinds: readonly JobKind[], limit: number) {
    const rows = (await this.http.sql(`SELECT * FROM job WHERE state = 'queued'`)).map(toJob);
    return rows
      .filter((j) => kinds.includes(j.kind))
      .sort((a, b) => Number(a.id) - Number(b.id))
      .slice(0, limit);
  }

  async getReport(reportId: string) {
    const r = await this.one(`SELECT * FROM report WHERE id = ${id(reportId)}`);
    return r ? toReport(r) : null;
  }

  async getReportPrivate(reportId: string): Promise<ReportPrivateRow | null> {
    const r = await this.one(`SELECT * FROM report_private WHERE report_id = ${id(reportId)}`);
    return r
      ? { reportId: str(r.reportId), isSelfReport: !!r.isSelfReport, addressLine1: str(r.addressLine1), lat: onum(r.lat), lng: onum(r.lng), notes: ostr(r.notes) }
      : null;
  }

  async getPropertyPrivate(propertyId: string): Promise<PropertyPrivateRow | null> {
    const r = await this.one(`SELECT * FROM property_private WHERE property_id = ${id(propertyId)}`);
    return r
      ? {
          propertyId: str(r.propertyId), normalized: str(r.normalized), line1: str(r.line1), city: str(r.city),
          state: str(r.state), zip: str(r.zip), lat: onum(r.lat), lng: onum(r.lng), countyFips: ostr(r.countyFips),
        }
      : null;
  }

  async listMedia(reportId: string): Promise<MediaAssetRow[]> {
    const rows = await this.http.sql(`SELECT * FROM media_asset WHERE report_id = ${id(reportId)}`);
    return rows
      .map((r) => ({
        id: str(r.id), reportId: str(r.reportId), kind: enumStr(r.kind) === 'video' ? ('video' as const) : ('image' as const),
        objectKey: str(r.objectKey), contentType: str(r.contentType), sizeBytes: num(r.sizeBytes), sha256: str(r.sha256),
        uploadedAt: num(r.uploadedAt),
      }))
      .sort((a, b) => Number(a.id) - Number(b.id));
  }

  async listFrames(reportId: string): Promise<FrameRow[]> {
    const rows = await this.http.sql(`SELECT * FROM frame WHERE report_id = ${id(reportId)}`);
    return rows
      .map((r) => ({
        id: str(r.id), reportId: str(r.reportId), frameIndex: num(r.frameIndex), tSec: num(r.tSec),
        thumbKey: str(r.thumbKey), findingJson: str(r.findingJson),
      }))
      .sort((a, b) => a.frameIndex - b.frameIndex);
  }

  async maxAgentStepSeq(reportId: string): Promise<number> {
    const rows = await this.http.sql(`SELECT seq FROM agent_step WHERE report_id = ${id(reportId)}`);
    return rows.reduce((m, r) => Math.max(m, num(r.seq, -1)), -1);
  }

  async getVerification(verificationId: string): Promise<VerificationRow | null> {
    const r = await this.one(`SELECT * FROM verification WHERE id = ${id(verificationId)}`);
    return r
      ? {
          id: str(r.id), identity: str(r.identity), propertyId: str(r.propertyId), docKind: enumStr(r.docKind),
          state: enumStr(r.state), failReason: ostr(r.failReason), objectKey: ostr(r.objectKey),
          attemptNo: num(r.attemptNo), createdAt: num(r.createdAt),
        }
      : null;
  }

  // ---- service reducers (argument order = CONTRACTS §5.2) ----
  claimJob(jobId: string, leaseMs: number) {
    return this.call('claim_job', [Number(id(jobId)), leaseMs]);
  }

  completeJob(jobId: string, ok: boolean, error?: string) {
    return this.call('complete_job', [Number(id(jobId)), ok, opt(error?.slice(0, 500))]);
  }

  recordFrame(a: { reportId: string; frameIndex: number; tSec: number; thumbKey: string; findingJson: string }) {
    return this.call('record_frame', [Number(id(a.reportId)), a.frameIndex, a.tSec, a.thumbKey, a.findingJson]);
  }

  recordAgentStep(s: Omit<AgentStep, 'at'>) {
    return this.call('record_agent_step', [
      Number(id(s.reportId)), s.seq, s.kind, s.name.slice(0, 120), s.summary.slice(0, 400), s.visibility, opt(s.durationMs),
    ]);
  }

  recordAssessment(a: { reportId: string; json: string; overallLevel: string; usableFrames: number; totalFrames: number; lifeSafetyCsv: string }) {
    return this.call('record_assessment', [Number(id(a.reportId)), a.json, a.overallLevel, a.usableFrames, a.totalFrames, a.lifeSafetyCsv]);
  }

  recordVerification(a: { verificationId: string; ok: boolean; failReason?: string; nameOnDoc?: string }) {
    return this.call('record_verification', [Number(id(a.verificationId)), a.ok, opt(a.failReason), opt(a.nameOnDoc)]);
  }
}

function toJob(r: Row): JobRow {
  return {
    id: str(r.id), kind: enumStr(r.kind) as JobKind, reportId: ostr(r.reportId), propertyId: ostr(r.propertyId),
    verificationId: ostr(r.verificationId), subject: ostr(r.subject), payloadJson: str(r.payloadJson) || '{}',
    state: enumStr(r.state), attempts: num(r.attempts), leaseOwner: ostr(r.leaseOwner),
    leaseExpiresAt: onum(r.leaseExpiresAt), createdAt: num(r.createdAt),
  };
}

function toReport(r: Row): ReportRow {
  return {
    id: str(r.id), reporter: str(r.reporter), propertyId: str(r.propertyId), cellId: str(r.cellId), status: enumStr(r.status),
    hazard: enumStr(r.hazard), selfDanger: !!r.selfDanger, lifeSafetyCsv: str(r.lifeSafetyCsv), overallLevel: enumStr(r.overallLevel),
    usableFrames: num(r.usableFrames), totalFrames: num(r.totalFrames), statusReason: ostr(r.statusReason), claimed: !!r.claimed,
    source: enumStr(r.source), createdAt: num(r.createdAt), updatedAt: num(r.updatedAt),
  };
}
