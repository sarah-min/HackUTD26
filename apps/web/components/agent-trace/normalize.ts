import type { AgentStep } from '@hack/contracts';

/** Accepts rows from the generated bindings (bigint ids, Timestamp objects) or plain AgentStep JSON. */
export interface AgentStepRowLike {
  reportId?: string | number | bigint;
  seq: number | bigint;
  kind: string;
  name: string;
  summary: string;
  visibility: string;
  durationMs?: number | bigint | null | { some?: number } | undefined;
  at?: number | bigint | Date | { toDate?: () => Date; microsSinceUnixEpoch?: bigint } | null;
}

export function toMs(at: AgentStepRowLike['at']): number {
  if (at == null) return 0;
  if (typeof at === 'number') return at;
  if (typeof at === 'bigint') return Number(at / 1000n); // SpacetimeDB micros
  if (at instanceof Date) return at.getTime();
  if (typeof at.toDate === 'function') return at.toDate().getTime();
  if (typeof at.microsSinceUnixEpoch === 'bigint') return Number(at.microsSinceUnixEpoch / 1000n);
  return 0;
}

function optNum(v: AgentStepRowLike['durationMs']): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  return typeof v.some === 'number' ? v.some : undefined;
}

export function normalizeSteps(rows: readonly AgentStepRowLike[], reportId: string): AgentStep[] {
  return rows
    .filter((r) => r.reportId === undefined || String(r.reportId) === String(reportId))
    .map((r) => ({
      reportId: String(reportId),
      seq: Number(r.seq),
      kind: r.kind as AgentStep['kind'],
      name: r.name,
      summary: r.summary,
      visibility: (r.visibility === 'reporter' ? 'reporter' : 'affected') as AgentStep['visibility'],
      durationMs: optNum(r.durationMs),
      at: toMs(r.at),
    }))
    .sort((a, b) => a.seq - b.seq);
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}
