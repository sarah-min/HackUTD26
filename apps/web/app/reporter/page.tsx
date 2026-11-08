'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { AppShell } from '@/components/chrome/AppShell';
import { PinMap } from '@/components/map';
import { damageLevelClasses } from '@/lib/format';
import { idToString, useMyReports, useStdb } from '@/lib/stdb';

export default function ReporterPage() {
  const { isActive, error } = useStdb();
  const { rows, ready } = useMyReports();

  const pins = useMemo(
    () =>
      rows
        .filter((r) => r.private?.lat != null && r.private?.lng != null)
        .map(({ report, private: priv }) => ({
          id: idToString(report.id),
          lat: priv!.lat as number,
          lng: priv!.lng as number,
          label: priv?.addressLine1 ?? `Report ${idToString(report.id)}`,
          level: report.overallLevel,
          claimed: report.claimed,
          href: `/report/${idToString(report.id)}`,
        })),
    [rows],
  );

  return (
    <AppShell>
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">Reporter</p>
        <h1 className="mt-0.5 text-lg font-bold tracking-[-0.02em] text-slate-950">
          My submissions
        </h1>
        <p className="mt-1 text-[12px] text-slate-500">
          Only reports from this browser. Nobody else&apos;s pins are shown.
        </p>
      </header>

      {!isActive || !ready ? (
        <p className="text-sm text-slate-600">Connecting… {error ? error.message : null}</p>
      ) : (
        <>
          <PinMap pins={pins} />

          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
              <p>No reports from this browser yet.</p>
              <Link
                className="mt-3 inline-block font-bold text-blue-700 underline"
                href="/report/new"
              >
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
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {report.claimed ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                              Claimed
                            </span>
                          ) : null}
                          {report.status === 'draft' || report.status === 'needs_more_footage' ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                              Add evidence
                            </span>
                          ) : null}
                          {report.status === 'failed' ? (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">
                              Retry
                            </span>
                          ) : null}
                          {report.source !== 'live' ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
                              {report.source}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${damageLevelClasses(report.overallLevel)}`}
                      >
                        {report.overallLevel}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Link
        className="block rounded-xl bg-blue-700 px-4 py-3 text-center text-[13px] font-bold text-white"
        href="/report/new"
      >
        New report
      </Link>
    </AppShell>
  );
}
