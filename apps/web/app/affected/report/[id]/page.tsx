'use client';
// /affected/report/[id] — page shell for a verified affected person (T2.12).
// Embeds P3's <DamageReport> and <AgentTrace mode="full">, and P4's <RecoverySummaryCard>,
// through components/affected/external.ts. The reporter's identity is never shown.
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { idFromString, idToString, useReport, useVerifiedFor } from '@/lib/stdb';
import { AgentTrace, Banner911, DamageReport, HazardList, RecoverySummaryCard } from '@/components/affected/external';
import { DAMAGE_LEVEL_TEXT, STATUS_TEXT, parseFlagsCsv, parseLevel } from '@/components/affected/helpers';
import { AppShell } from '@/components/chrome/AppShell';

export default function AffectedReportPage() {
  const params = useParams<{ id: string }>();
  const reportId = idFromString(params.id);
  const { report, ready } = useReport(reportId);
  const { verified, ready: verReady } = useVerifiedFor(report?.propertyId ?? null);

  if (reportId === null) {
    return (
      <AppShell>
        <p className="text-[13px] text-slate-700">That link isn&apos;t valid.</p>
      </AppShell>
    );
  }
  if (!ready || (report && !verReady)) {
    return (
      <AppShell>
        <p className="text-sm text-slate-600">Loading…</p>
      </AppShell>
    );
  }
  if (!report) {
    return (
      <AppShell>
        <p className="text-[13px] text-slate-700">We couldn&apos;t find that report.</p>
      </AppShell>
    );
  }

  if (!verified) {
    return (
      <AppShell>
        <header>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">Affected</p>
          <h1 className="mt-0.5 text-lg font-bold tracking-[-0.02em] text-slate-950">
            Verify to see this report
          </h1>
          <p className="mt-1 text-[12px] text-slate-500">
            Only the verified resident of this address can open the full damage report.
          </p>
        </header>
        <Link
          href="/affected/start"
          className="block rounded-xl bg-blue-700 px-4 py-3 text-center text-[13px] font-bold text-white"
        >
          I&apos;ve been affected
        </Link>
      </AppShell>
    );
  }

  const id = idToString(report.id);
  const propertyId = idToString(report.propertyId);
  const flags = parseFlagsCsv(report.lifeSafetyCsv);

  return (
    <AppShell>
      <Link
        href={`/affected/property/${propertyId}`}
        className="text-[12px] font-bold text-blue-700 underline"
      >
        ← Your home
      </Link>
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">
          Damage report
        </p>
        <h1 className="mt-0.5 text-lg font-bold tracking-[-0.02em] text-slate-950">
          {DAMAGE_LEVEL_TEXT[parseLevel(report.overallLevel)]}
        </h1>
        <p className="mt-1 text-[12px] text-slate-500">
          {report.hazard.replace(/_/g, ' ')} · {STATUS_TEXT[report.status] ?? report.status}
          {report.source !== 'live' ? (
            <span className="ml-2 rounded bg-slate-100 px-1 text-[10px] font-bold uppercase text-slate-600">
              {report.source}
            </span>
          ) : null}
        </p>
      </header>

      {report.selfDanger || flags.length > 0 ? (
        <Banner911
          reason={
            report.selfDanger
              ? 'The person who filmed this reported someone in danger at the time.'
              : 'The footage shows a possible life-safety hazard.'
          }
        />
      ) : null}
      <HazardList flags={flags} />

      {report.status === 'needs_more_footage' ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900">
          The footage wasn&apos;t clear enough for a full assessment. You can film your home
          yourself to add a report.
        </p>
      ) : null}

      <DamageReport reportId={id} />
      {report.status === 'assessed' ? (
        <RecoverySummaryCard propertyId={propertyId} reportId={id} />
      ) : null}
      <AgentTrace reportId={id} mode="full" />

      <p className="text-[11px] text-slate-500">
        AI estimate, not an insurance determination or inspection.
      </p>
    </AppShell>
  );
}
