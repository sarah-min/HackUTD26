'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Banner911, HazardList } from '@/components/safety';
import {
  idFromString,
  idToString,
  useReport,
  useReportSteps,
  useStdb,
} from '@/lib/stdb';
import type { LifeSafetyFlag } from '@hack/contracts/common';

const LEVEL_LABEL: Record<string, string> = {
  none: 'No damage assessed yet',
  affected: 'Affected',
  minor: 'Minor',
  major: 'Major',
  destroyed: 'Destroyed',
};

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
  const { steps } = useReportSteps(reportId);

  if (reportId === null) {
    return (
      <main className="mx-auto max-w-md px-4 py-8">
        <p className="text-red-700">That report id is not valid.</p>
        <Link className="mt-3 inline-block text-blue-700 underline" href="/reporter">
          My submissions
        </Link>
      </main>
    );
  }

  if (!ready || !isActive) {
    return (
      <main className="mx-auto max-w-md px-4 py-8 text-sm text-slate-600">
        Connecting… {connError ? connError.message : null}
      </main>
    );
  }

  if (!report) {
    return (
      <main className="mx-auto max-w-md space-y-3 px-4 py-8">
        <p className="text-slate-700">No report found for this identity (or still syncing).</p>
        <Link className="text-blue-700 underline" href="/reporter">
          My submissions
        </Link>
      </main>
    );
  }

  const flags = parseFlags(report.lifeSafetyCsv);
  const status = report.status;

  return (
    <div className="min-h-screen bg-slate-200 text-slate-900">
      <div className="mx-auto min-h-screen max-w-[480px] space-y-3 bg-[#f5f7fa] px-3.5 py-4 shadow-[0_0_45px_rgba(15,23,42,0.12)]">
        <header className="flex items-center justify-between">
          <Link className="text-[18px] font-bold" href="/">
            Aftermath
          </Link>
          <Link className="text-[11px] font-bold text-blue-700 underline" href="/reporter">
            My submissions
          </Link>
        </header>

        {report.selfDanger ? (
          <Banner911 reason="This report flagged on-scene danger." />
        ) : (
          <Banner911 />
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">
            Report {idToString(report.id)}
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-[-0.025em]">
            Status: <span className="capitalize">{status.replace(/_/g, ' ')}</span>
          </h1>
          <p className="mt-1 text-[12px] text-slate-500">
            Hazard: {report.hazard.replace(/_/g, ' ')}
            {report.claimed ? ' · Claimed by resident' : ''}
          </p>
          {report.statusReason != null && report.statusReason !== '' ? (
            <p className="mt-2 text-[12px] text-amber-800">{String(report.statusReason)}</p>
          ) : null}

          {status === 'draft' ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
              Draft is live on the dev database. Attach media + submit needs{' '}
              <code className="text-[10px]">/api/uploads/presign</code> (P4) next.
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
            Overall assessment
          </p>
          <p className="mt-2 text-[14px] font-bold text-slate-900">
            {LEVEL_LABEL[report.overallLevel] ?? report.overallLevel}
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
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
            Timeline
          </p>
          {steps.length === 0 ? (
            <p className="mt-2 text-[12px] text-slate-400">
              No pipeline steps yet (worker has not run).
            </p>
          ) : (
            <ol className="mt-3 space-y-3">
              {steps.map((s) => (
                <li key={idToString(s.id)} className="text-[13px]">
                  <p className="font-bold text-slate-800">{s.name}</p>
                  {s.summary ? <p className="text-[11px] text-slate-500">{s.summary}</p> : null}
                </li>
              ))}
            </ol>
          )}
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

        <Link className="block text-center text-[12px] font-bold text-blue-700 underline" href="/report/new">
          Start another report
        </Link>
      </div>
    </div>
  );
}
