import type { AgentStep } from '@hack/contracts/agent';
import type { JobRow, ObjectStore, ServiceConnection } from '@hack/agent';

export function fakeStorage(objects: Record<string, Buffer> = {}, opts: { failGet?: boolean } = {}) {
  const deleted: string[] = [];
  const puts: string[] = [];
  const storage: ObjectStore = {
    getObject: async (k) => {
      if (opts.failGet) throw new Error('network down');
      const v = objects[k];
      if (!v) throw new Error('NoSuchKey');
      return v;
    },
    putObject: async (k, b) => void (puts.push(k), (objects[k] = b)),
    deleteObject: async (k) => void (deleted.push(k), delete objects[k]),
    ping: async () => true,
  };
  return { storage, deleted, puts, objects };
}

export function fakeStdb(init: Partial<ServiceConnection> = {}) {
  const calls: { name: string; args: unknown }[] = [];
  const steps: Omit<AgentStep, 'at'>[] = [];
  const stdb = {
    identityHex: 'aa',
    getJob: async () => null,
    listQueuedJobs: async () => [],
    getReport: async () => null,
    getReportPrivate: async () => null,
    getPropertyPrivate: async () => null,
    listMedia: async () => [],
    listFrames: async () => [],
    getVerification: async () => null,
    claimJob: async (id: string, ms: number) => void calls.push({ name: 'claim_job', args: { id, ms } }),
    completeJob: async (id: string, ok: boolean, error?: string) => void calls.push({ name: 'complete_job', args: { id, ok, error } }),
    recordFrame: async (a: unknown) => void calls.push({ name: 'record_frame', args: a }),
    recordAgentStep: async (s: Omit<AgentStep, 'at'>) => void steps.push(s),
    recordAssessment: async (a: unknown) => void calls.push({ name: 'record_assessment', args: a }),
    recordVerification: async (a: unknown) => void calls.push({ name: 'record_verification', args: a }),
    recordAreaNotices: async (a: unknown) => void calls.push({ name: 'record_area_notices', args: a }),
    recordRecoveryPlan: async (a: unknown) => void calls.push({ name: 'record_recovery_plan', args: a }),
    recordCoachReply: async (a: unknown) => void calls.push({ name: 'record_coach_reply', args: a }),
    ...init,
  } as ServiceConnection;
  return { stdb, calls, steps };
}

export const job = (p: Partial<JobRow>): JobRow => ({
  id: '1', kind: 'analyze', reportId: null, propertyId: null, verificationId: null, subject: null, payloadJson: '{}',
  state: 'queued', attempts: 0, leaseOwner: null, leaseExpiresAt: null, lastError: null, createdAt: 0, ...p,
});

export const silentLog = { debug() {}, info() {}, warn() {}, error() {}, child() { return silentLog; } };
