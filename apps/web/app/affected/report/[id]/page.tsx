'use client';
// /affected/report/[id] — page shell for a verified affected person (T2.12).
// Embeds P3's <DamageReport> and <AgentTrace mode="full">, and P4's <RecoverySummaryCard>,
// through components/affected/external.ts. The reporter's identity is never shown.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { idFromString, idToString, useReport, useVerifiedFor } from '@/lib/stdb';
import { AgentTrace, Banner911, DamageReport, HazardList, RecoverySummaryCard } from '@/components/affected/external';
import { DAMAGE_LEVEL_TEXT, STATUS_TEXT, parseFlagsCsv, parseLevel } from '@/components/affected/helpers';
import { AppShell } from '@/components/chrome/AppShell';
import { HAZARD_LABEL } from '@/components/damage-report/repairGuide';
import { DamageReportView } from '@/components/damage-report';
import { SAMPLE_ASSESSMENT, SAMPLE_FRAMES } from '@/components/damage-report/samplePreview';
import { DEV_PREVIEW as DEV, DevPreviewButton } from '@/components/damage-report/DevPreviewButton';
import type { Hazard } from '@hack/contracts/common';
import { AccountLink } from '../../_account/AccountLink';
import { StepupGate } from '../../_account/StepupGate';

export default function AffectedReportPage() {
  const params = useParams<{ id: string }>();
  const reportId = idFromString(params.id);
  const { report, ready } = useReport(reportId);
  const { verified, ready: verReady } = useVerifiedFor(report?.propertyId ?? null);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    if (DEV) setPreview(new URLSearchParams(window.location.search).get('preview') === 'sample');
  }, []);

  if (DEV && preview) {
    return (
      <AppShell>
        <p className="rounded-xl border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-900">
          Dev preview with sample data. Verification skipped; this isn&apos;t a real report.{' '}
          <a className="underline" href={`/affected/report/${params.id}`}>
            Exit preview
          </a>
        </p>
        <DamageReportView reportId={params.id} assessment={SAMPLE_ASSESSMENT} frames={SAMPLE_FRAMES} />
      </AppShell>
    );
  }

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
        {/* With step-up required and not done, the owner's report rows are hidden, so show the prompt. */}
        <StepupGate>
          <p className="text-[13px] text-slate-700">We couldn&apos;t find that report.</p>
        </StepupGate>
        <DevPreviewButton id={params.id} />
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
        <DevPreviewButton id={params.id} />
      </AppShell>
    );
  }

  const id = idToString(report.id);
  const propertyId = idToString(report.propertyId);
  const flags = parseFlagsCsv(report.lifeSafetyCsv);

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/affected/property/${propertyId}`}
          className="text-[12px] font-bold text-blue-700 underline"
        >
          ← Your home
        </Link>
        <AccountLink />
      </div>
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">
          Damage report
        </p>
        <h1 className="mt-0.5 text-lg font-bold tracking-[-0.02em] text-slate-950">
          {report.status === 'assessed'
            ? DAMAGE_LEVEL_TEXT[parseLevel(report.overallLevel)]
            : (STATUS_TEXT[report.status] ?? report.status)}
        </h1>
        <p className="mt-1 text-[12px] text-slate-500">
          {HAZARD_LABEL[report.hazard as Hazard] ?? report.hazard.replace(/_/g, ' ')} ·{' '}
          {STATUS_TEXT[report.status] ?? report.status}
        </p>
      </header>

      {report.selfDanger || flags.length > 0 ? (
        <Banner911
          reason={
            report.selfDanger
              ? 'The person who filmed this reported someone in danger at the time.'
              : 'The photos show a possible safety hazard at or near your home.'
          }
        />
      ) : null}
      <HazardList flags={flags} />

      {report.status === 'needs_more_footage' ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900">
          The photos weren&apos;t clear enough for a full assessment. You can add your own photos or
          a video of your home to get one.
        </p>
      ) : null}

      <StepupGate>
        <DamageReport reportId={id} showHazards={false} />
        {report.status === 'assessed' ? (
          <RecoverySummaryCard propertyId={propertyId} reportId={id} />
        ) : null}
        <details className="rounded-2xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-[13px] font-semibold text-slate-700">
            How this report was made
          </summary>
          <p className="mt-1 text-[12px] text-slate-500">
            Every step the AI took to review the photos, look up your area and estimate costs.
          </p>
          <div className="mt-3">
            <AgentTrace reportId={id} mode="full" />
          </div>
        </details>
      </StepupGate>

      <p className="text-[11px] text-slate-500">
        AI estimate, not an insurance determination or inspection.
      </p>
    </AppShell>
  );
}
