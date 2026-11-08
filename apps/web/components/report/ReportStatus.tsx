'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/chrome/AppHeader';
import { Banner911, HazardList } from '@/components/safety';
import {
  idFromString,
  idToString,
  useReport,
  useReportSteps,
  useStdb,
} from '@/lib/stdb';
import type { LifeSafetyFlag } from '@hack/contracts/common';
import { DAMAGE_LEVEL_LABEL, REPORT_STATUS_LABEL, damageLevelClasses } from '@/lib/format';

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
      <div className="min-h-screen bg-[#f5f7fa]">
        <AppHeader dense />
        <main className="mx-auto max-w-md px-4 py-8 text-sm text-slate-600">
          Connecting… {connError ? connError.message : null}
        </main>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-[#f5f7fa]">
        <AppHeader dense />
        <main className="mx-auto max-w-md space-y-3 px-4 py-8">
          <p className="text-slate-700">No report found for this identity (or still syncing).</p>
          <Link className="text-blue-700 underline" href="/reporter">
            My submissions
          </Link>
        </main>
      </div>
    );
  }

  const flags = parseFlags(report.lifeSafetyCsv);
  const status = report.status;
  const needsAction = status === 'needs_more_footage' || status === 'failed';

  return (
    <div className="min-h-screen bg-slate-200 text-slate-900">
      <div className="mx-auto min-h-screen max-w-[480px] space-y-3 bg-[#f5f7fa] pb-8 shadow-[0_0_45px_rgba(15,23,42,0.12)]">
        <AppHeader dense />

        <div className="space-y-3 px-3.5">
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
            <h1 className="mt-1 text-xl font-bold tracking-[-0.025em]">
              {REPORT_STATUS_LABEL[status] ?? status}
            </h1>
            <p className="mt-1 text-[12px] text-slate-500">
              Hazard: {report.hazard.replace(/_/g, ' ')}
            </p>
            {report.statusReason != null && String(report.statusReason) !== '' ? (
              <p className="mt-2 text-[12px] text-amber-800">{String(report.statusReason)}</p>
            ) : null}

            {status === 'draft' ? (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
                Draft saved. Photo/video upload is coming soon — analysis starts after evidence is
                attached.
              </p>
            ) : null}

            {needsAction ? (
              <div className="mt-3 space-y-2 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-[12px] text-red-950">
                <p className="font-bold">
                  {status === 'needs_more_footage'
                    ? 'More footage is needed for a reliable assessment.'
                    : 'Analysis failed. You can try again after uploading new evidence.'}
                </p>
                <p className="text-[11px] text-red-900/80">
                  Re-shoot / retry will unlock once media upload is available.
                </p>
                <Link className="inline-block font-bold text-blue-800 underline" href="/report/new">
                  Start a new report
                </Link>
              </div>
            ) : null}
          </section>

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
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Status timeline
            </p>
            {steps.length === 0 ? (
              <p className="mt-2 text-[12px] text-slate-400">
                Pipeline steps appear here once analysis runs.
              </p>
            ) : (
              <ol className="mt-3 space-y-0">
                {steps.map((s, i) => (
                  <li className="relative flex min-h-[56px] gap-3" key={idToString(s.id)}>
                    {i < steps.length - 1 ? (
                      <span className="absolute top-6 left-[11px] h-[40px] w-0.5 bg-emerald-400" />
                    ) : null}
                    <span className="relative z-10 grid size-6 shrink-0 place-items-center rounded-full border-2 border-emerald-500 bg-emerald-500 text-[10px] font-bold text-white">
                      {i + 1}
                    </span>
                    <div className="-mt-0.5">
                      <p className="text-[13px] font-bold text-slate-800">{s.name}</p>
                      {s.summary ? (
                        <p className="mt-0.5 text-[11px] text-slate-500">{s.summary}</p>
                      ) : null}
                    </div>
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

          <Link
            className="block text-center text-[12px] font-bold text-blue-700 underline"
            href="/report/new"
          >
            Start another report
          </Link>
        </div>
      </div>
    </div>
  );
}
