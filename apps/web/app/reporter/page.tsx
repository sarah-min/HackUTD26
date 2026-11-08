'use client';

import Link from 'next/link';
import { idToString, useMyReports, useStdb } from '@/lib/stdb';

const LEVEL_COLOR: Record<string, string> = {
  none: 'bg-slate-200 text-slate-700',
  affected: 'bg-yellow-100 text-yellow-900',
  minor: 'bg-orange-100 text-orange-900',
  major: 'bg-red-100 text-red-900',
  destroyed: 'bg-slate-900 text-white',
};

export default function ReporterPage() {
  const { isActive, error } = useStdb();
  const { rows, ready } = useMyReports();

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-8">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">My submissions</h1>
          <p className="mt-1 text-[12px] text-slate-500">
            Live from SpacetimeDB for this browser identity. Map pins come later.
          </p>
        </div>
        <Link className="text-[12px] font-bold text-blue-700 underline" href="/">
          Home
        </Link>
      </header>

      {!isActive || !ready ? (
        <p className="text-sm text-slate-600">
          Connecting… {error ? error.message : null}
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
          <p>No reports from this browser yet.</p>
          <Link className="mt-3 inline-block font-bold text-blue-700 underline" href="/report/new">
            Create a draft report
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ report, private: priv }) => (
            <li key={idToString(report.id)}>
              <Link
                className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300"
                href={`/report/${idToString(report.id)}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-slate-900">
                      {priv?.addressLine1 ?? `Report ${idToString(report.id)}`}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {report.hazard.replace(/_/g, ' ')} · {report.status.replace(/_/g, ' ')}
                      {report.claimed ? ' · claimed' : ''}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
                      LEVEL_COLOR[report.overallLevel] ?? LEVEL_COLOR.none
                    }`}
                  >
                    {report.overallLevel}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link
        className="block rounded-xl bg-blue-700 px-4 py-3 text-center text-[13px] font-bold text-white"
        href="/report/new"
      >
        New report
      </Link>
    </main>
  );
}
