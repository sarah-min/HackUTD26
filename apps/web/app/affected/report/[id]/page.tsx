'use client';
// /affected/report/[id] — page shell for a verified affected person (T2.12).
// Embeds P3's <DamageReport> and <AgentTrace mode="full">, and P4's <RecoverySummaryCard>,
// through components/affected/external.ts. The reporter's identity is never shown.
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { idFromString, idToString, useReport, useVerifiedFor } from '@/lib/stdb';
import { AgentTrace, Banner911, DamageReport, HazardList, RecoverySummaryCard } from '@/components/affected/external';
import { DAMAGE_LEVEL_TEXT, STATUS_TEXT, parseFlagsCsv, parseLevel } from '@/components/affected/helpers';

export default function AffectedReportPage() {
  const params = useParams<{ id: string }>();
  const reportId = idFromString(params.id);
  const { report, ready } = useReport(reportId);
  const { verified, ready: verReady } = useVerifiedFor(report?.propertyId ?? null);

  if (reportId === null) return <main className="px-4 py-6">That link isn't valid.</main>;
  if (!ready || (report && !verReady)) return <main className="px-4 py-6 text-gray-600">Loading…</main>;
  if (!report) return <main className="px-4 py-6">We couldn't find that report.</main>;

  if (!verified) {
    return (
      <main className="mx-auto max-w-md space-y-3 px-4 py-6">
        <h1 className="text-xl font-semibold">Verify to see this report</h1>
        <p className="text-sm text-gray-600">Only the verified resident of this address can open the full damage report.</p>
        <Link href="/affected/start" className="inline-block rounded-lg bg-black px-4 py-3 font-medium text-white">
          I've been affected
        </Link>
      </main>
    );
  }

  const id = idToString(report.id);
  const propertyId = idToString(report.propertyId);
  const flags = parseFlagsCsv(report.lifeSafetyCsv);

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <Link href={`/affected/property/${propertyId}`} className="text-sm underline">
        ← Your home
      </Link>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{DAMAGE_LEVEL_TEXT[parseLevel(report.overallLevel)]}</h1>
        <p className="text-sm text-gray-600">
          {report.hazard.replace(/_/g, ' ')} · {STATUS_TEXT[report.status] ?? report.status}
          {report.source !== 'live' && <span className="ml-2 rounded bg-gray-200 px-1 text-xs">{report.source}</span>}
        </p>
      </header>

      {(report.selfDanger || flags.length > 0) && (
        <Banner911
          reason={
            report.selfDanger
              ? 'The person who filmed this reported someone in danger at the time.'
              : 'The footage shows a possible life-safety hazard.'
          }
        />
      )}
      <HazardList flags={flags} />

      {report.status === 'needs_more_footage' && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          The footage wasn't clear enough for a full assessment. You can film your home yourself to add a report.
        </p>
      )}

      <DamageReport reportId={id} />
      {report.status === 'assessed' && <RecoverySummaryCard propertyId={propertyId} reportId={id} />}
      <AgentTrace reportId={id} mode="full" />

      <p className="text-xs text-gray-500">
        AI estimate, not an insurance determination or inspection.
      </p>
    </main>
  );
}
