'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AgentTrace } from '@/components/agent-trace';
import { AppShell } from '@/components/chrome/AppShell';
import { Banner911, HazardList } from '@/components/safety';
import {
  idFromString,
  idToString,
  useReport,
  useStdb,
} from '@/lib/stdb';
import type { LifeSafetyFlag } from '@hack/contracts/common';
import { DAMAGE_LEVEL_LABEL, REPORT_STATUS_LABEL, damageLevelClasses } from '@/lib/format';
import { EvidencePanel } from './EvidencePanel';
import { RetrySubmit } from './RetrySubmit';

function parseFlags(csv: string): LifeSafetyFlag[] {
  if (!csv.trim()) return [];
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as LifeSafetyFlag[];
}

export function ReportStatus({ reportIdParam }: { reportIdParam: string }) {
  const reportId = idFromString(reportIdParam);
  const params = useSearchParams();
  const self = params.get('self') === '1';
  const addressPrefill = params.get('address') ?? '';
  const { isActive, error: connError } = useStdb();
  const { report, ready } = useReport(reportId);

  if (reportId === null) {
    return (
      <AppShell>
        <p className="text-red-700">That report id is not valid.</p>
        <Link className="inline-block text-[13px] font-bold text-blue-700 underline" href="/reporter">
          My submissions
        </Link>
      </AppShell>
    );
  }

  if (!ready || !isActive) {
    return (
      <AppShell>
        <p className="text-sm text-slate-600">
          Connecting… {connError ? connError.message : null}
        </p>
      </AppShell>
    );
  }

  if (!report) {
    return (
      <AppShell>
        <p className="text-slate-700">No report found for this identity (or still syncing).</p>
        <Link className="inline-block text-[13px] font-bold text-blue-700 underline" href="/reporter">
          My submissions
        </Link>
      </AppShell>
    );
  }

  const flags = parseFlags(report.lifeSafetyCsv);
  const status = report.status;
  const needsEvidence = status === 'draft' || status === 'needs_more_footage';

  return (
    <AppShell>
      {report.selfDanger ? (
        <Banner911 reason="This report flagged on-scene danger." />
      ) : (
        <Banner911 />
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">
            Report {idToString(report.id)}
          </p>
          {report.claimed ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
              Claimed
            </span>
          ) : null}
          {report.source !== 'live' ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
              {report.source}
            </span>
          ) : null}
        </div>
        <h1 className="mt-1 text-lg font-bold tracking-[-0.02em] text-slate-950">
          {REPORT_STATUS_LABEL[status] ?? status}
        </h1>
        <p className="mt-1 text-[12px] text-slate-500">
          Hazard: {report.hazard.replace(/_/g, ' ')}
        </p>
        {report.statusReason != null && String(report.statusReason) !== '' ? (
          <p className="mt-2 text-[12px] text-amber-800">{String(report.statusReason)}</p>
        ) : null}
      </section>

      {needsEvidence ? <EvidencePanel reportId={report.id} /> : null}
      {status === 'failed' ? <RetrySubmit reportId={report.id} /> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
          Overall assessment
        </p>
        <p
          className={`mt-2 inline-flex rounded-full px-3 py-1.5 text-[12px] font-bold ${damageLevelClasses(report.overallLevel)}`}
        >
          {DAMAGE_LEVEL_LABEL[report.overallLevel as keyof typeof DAMAGE_LEVEL_LABEL] ??
            report.overallLevel}
        </p>
        <div className="mt-3">
          <p className="mb-2 text-[12px] font-bold text-slate-800">Life-safety flags</p>
          {flags.length > 0 ? (
            <HazardList flags={flags} />
          ) : (
            <p className="text-[12px] text-slate-400">None yet</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
          Pipeline
        </p>
        <AgentTrace reportId={idToString(report.id)} mode="pipeline" />
      </section>

      <aside className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4 text-[11px] leading-relaxed text-slate-600">
        The resident can claim this report via{' '}
        <Link className="font-bold text-slate-800 underline" href="/affected/start">
          I&apos;ve been affected
        </Link>
        .
      </aside>

      {self ? (
        <Link
          className="block rounded-xl bg-blue-700 px-4 py-3 text-center text-[13px] font-bold text-white"
          href={`/affected/start?address=${encodeURIComponent(addressPrefill)}&self=1`}
        >
          Continue to verify this is your property
        </Link>
      ) : null}

      <Link
        className="block text-center text-[12px] font-bold text-blue-700 underline"
        href="/report/new"
      >
        Start another report
      </Link>
    </AppShell>
  );
}
