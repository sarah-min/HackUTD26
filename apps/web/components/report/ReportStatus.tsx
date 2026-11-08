'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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

const SLOW_MS = 10_000;

/** "hurricane_wind" -> "Hurricane wind". */
function hazardLabel(hazard: string): string {
  const s = hazard.replace(/_/g, ' ').trim();
  return s ? s[0]!.toUpperCase() + s.slice(1) : 'Not specified';
}

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
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (isActive && ready) {
      setSlow(false);
      return;
    }
    const t = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => window.clearTimeout(t);
  }, [isActive, ready]);

  if (reportId === null) {
    return (
      <AppShell>
        <p className="text-[13px] font-semibold text-red-700">We couldn’t find that report.</p>
        <p className="mt-1 text-[12px] text-slate-600">The link may be incomplete. Check it and try again.</p>
        <Link className="mt-3 inline-block text-[13px] font-bold text-blue-700 underline" href="/reporter">
          Go to My submissions
        </Link>
      </AppShell>
    );
  }

  if (connError) {
    return (
      <AppShell>
        <p className="text-[13px] font-semibold text-red-700">We can’t connect right now.</p>
        <p className="mt-1 text-[12px] text-slate-600">
          Check your internet connection and try again. Your report is saved.
        </p>
        <p className="mt-1 text-[11px] text-slate-400">Details: {connError.message}</p>
        <button
          className="mt-3 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-bold text-white"
          onClick={() => window.location.reload()}
          type="button"
        >
          Try again
        </button>
      </AppShell>
    );
  }

  if (!isActive || !ready) {
    return (
      <AppShell>
        <p className="text-sm text-slate-600">
          {slow ? 'This is taking longer than usual…' : 'Loading your report…'}
        </p>
        {slow ? (
          <div className="mt-3 space-y-2 text-[12px] text-slate-500">
            <p>Make sure you’re online. The header shows “Live” once you’re connected.</p>
            <button
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-bold text-white"
              onClick={() => window.location.reload()}
              type="button"
            >
              Reload page
            </button>
            <Link className="block text-[13px] font-bold text-blue-700 underline" href="/reporter">
              Go to My submissions
            </Link>
          </div>
        ) : null}
      </AppShell>
    );
  }

  if (!report) {
    return (
      <AppShell>
        <p className="text-[13px] font-semibold text-slate-800">We can’t find this report yet.</p>
        <p className="mt-1 text-[12px] text-slate-500">
          If you just sent it, give it a few seconds. Reports only appear on the device that sent them.
        </p>
        <Link className="mt-3 inline-block text-[13px] font-bold text-blue-700 underline" href="/reporter">
          Go to My submissions
        </Link>
      </AppShell>
    );
  }

  const flags = parseFlags(report.lifeSafetyCsv);
  const status = report.status;
  const needsEvidence = status === 'draft' || status === 'needs_more_footage';
  const waitingOnWorker = status === 'queued' || status === 'processing';
  const assessed = status === 'assessed';
  // A finished report with level 'none' means nothing in the evidence shows damage to the home
  // (street or area shots only raise hazards). Before that, the level simply isn't known yet.
  const noHomeDamage = assessed && report.overallLevel === 'none';
  const levelLabel = noHomeDamage
    ? 'No visible damage to the home'
    : report.overallLevel === 'none'
      ? assessed
        ? 'Not assessed'
        : 'Waiting for the review'
      : (DAMAGE_LEVEL_LABEL[report.overallLevel as keyof typeof DAMAGE_LEVEL_LABEL] ?? report.overallLevel);

  return (
    <AppShell>
      {report.selfDanger ? (
        <Banner911 reason="Whoever sent this report said there was danger on the scene." />
      ) : (
        <Banner911 />
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">
            Report #{idToString(report.id)}
          </p>
          {report.claimed ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
              Claimed by resident
            </span>
          ) : null}
        </div>
        <h1 className="mt-1 text-lg font-bold tracking-[-0.02em] text-slate-950">
          {REPORT_STATUS_LABEL[status] ?? status}
        </h1>
        <p className="mt-1 text-[12px] text-slate-500">
          Reported for: {hazardLabel(report.hazard)}
        </p>
        {report.statusReason != null && String(report.statusReason) !== '' ? (
          <p className="mt-2 text-[12px] text-amber-800">{String(report.statusReason)}</p>
        ) : null}
        {waitingOnWorker || status === 'draft' ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-950">
            {status === 'draft'
              ? 'Add at least one photo or video below and we’ll start reviewing it.'
              : 'This usually takes about a minute. You can keep this page open; it updates on its own.'}
            {process.env.NODE_ENV === 'development' ? (
              <span className="mt-1 block text-amber-800/80">
                Dev: analysis needs the worker (Brev Nemotron or{' '}
                <code className="font-semibold">pnpm --dir scripts fake-worker</code>). If nothing moves
                for a minute, it probably isn’t running.
              </span>
            ) : null}
          </p>
        ) : null}
      </section>

      {needsEvidence ? <EvidencePanel reportId={report.id} /> : null}
      {status === 'failed' ? <RetrySubmit reportId={report.id} /> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
          Damage to the home
        </p>
        <p
          className={`mt-2 inline-flex rounded-full px-3 py-1.5 text-[12px] font-bold ${damageLevelClasses(report.overallLevel)}`}
        >
          {levelLabel}
        </p>
        {noHomeDamage ? (
          <p className="mt-2 text-[12px] leading-relaxed text-slate-600">
            {flags.length > 0
              ? 'We spotted hazards near the property, but no damage to the house itself. To check the house, add photos or a video of it.'
              : 'We didn’t see any damage to the home in these photos.'}
          </p>
        ) : null}
        <div className="mt-3">
          <p className="mb-2 text-[12px] font-bold text-slate-800">Safety hazards</p>
          {flags.length > 0 ? (
            <HazardList flags={flags} />
          ) : (
            <p className="text-[12px] text-slate-400">
              {assessed ? 'No hazards spotted in these photos.' : 'Any hazards we spot will show up here.'}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
          Progress
        </p>
        <AgentTrace reportId={idToString(report.id)} mode="pipeline" />
      </section>

      <aside className="rounded-2xl border border-slate-200 bg-slate-100/80 p-4 text-[11px] leading-relaxed text-slate-600">
        Live at this address? Go to{' '}
        <Link className="font-bold text-slate-800 underline" href="/affected/start">
          I&apos;ve been affected
        </Link>{' '}
        to claim this report and see the full assessment.
      </aside>

      {self ? (
        <Link
          className="block rounded-xl bg-blue-700 px-4 py-3 text-center text-[13px] font-bold text-white"
          href={`/affected/start?address=${encodeURIComponent(addressPrefill)}&self=1`}
        >
          This is my home: verify it
        </Link>
      ) : null}

      <Link
        className="block text-center text-[12px] font-bold text-blue-700 underline"
        href="/report/new"
      >
        Report damage at another address
      </Link>
    </AppShell>
  );
}
