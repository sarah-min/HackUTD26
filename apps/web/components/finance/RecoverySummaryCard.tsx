'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DamageAssessmentSchema } from '@hack/contracts/assessment';
import { ScenarioSchema, type Scenario } from '@hack/contracts/finance';
import { estimateRepairCost } from '@hack/damage';
import { getPersona, simulate } from '@hack/finance';
import type { RecoverySummaryCardProps } from '@/components/affected/placeholders/types';
import { idFromString, useVerifiedReportData } from '@/lib/stdb';
import { CoachChat } from './CoachChat';
import { FinanceDisclaimer } from './FinanceDisclaimer';
import { PlanView } from './PlanView';
import { WhatIfPanel } from './WhatIfPanel';
import { useRecoveryData } from './useRecoveryData';

/**
 * On the damage report: same plan stack as the Recovery Navigator fixture
 * (what-if → PlanView → coach) when a plan exists.
 */
export function RecoverySummaryCard({ propertyId, reportId }: RecoverySummaryCardProps) {
  const propId = idFromString(propertyId);
  const repId = idFromString(reportId);
  const { plans, profile, ready } = useRecoveryData(propId);
  const { assessment: assessmentRow } = useVerifiedReportData(repId);
  const [scenario, setScenario] = useState<Scenario>(() => ScenarioSchema.parse({}));

  const plan = useMemo(() => {
    if (repId == null) return plans[0]?.plan ?? null;
    return plans.find((p) => p.reportId === repId)?.plan ?? plans[0]?.plan ?? null;
  }, [plans, repId]);

  const assessment = useMemo(() => {
    if (!assessmentRow?.json) return null;
    const parsed = DamageAssessmentSchema.safeParse(JSON.parse(assessmentRow.json));
    return parsed.success ? parsed.data : null;
  }, [assessmentRow?.json]);

  const sim = useMemo(() => {
    if (!plan || !profile || !assessment) return null;
    try {
      const persona = getPersona(profile.personaId);
      const cost = estimateRepairCost({
        componentLevels: assessment.componentLevels,
        homeSqft: profile.homeSqft,
        stories: profile.stories,
        tenure: profile.tenure,
      });
      return simulate({
        profile: persona,
        intake: profile,
        cost,
        declarations: assessment.declarations,
        hazard: assessment.hazard,
        scenario,
      });
    } catch {
      return null;
    }
  }, [plan, profile, assessment, scenario]);

  if (!ready) {
    return (
      <section
        aria-label="Recovery summary"
        className="rounded-2xl border border-slate-200 bg-white p-4"
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">Recovery</p>
        <h2 className="mt-0.5 text-[15px] font-bold text-slate-950">Recovery Navigator</h2>
        <FinanceDisclaimer />
        <p className="mt-2 text-[12px] text-slate-500">Loading plan…</p>
      </section>
    );
  }

  if (plan) {
    return (
      <section aria-label="Recovery summary" data-source={plan.source} className="space-y-3">
        <header className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">Recovery</p>
          <h2 className="text-[15px] font-bold text-slate-950">Recovery Navigator</h2>
          <FinanceDisclaimer />
          <Link
            href={`/affected/property/${propertyId}/recovery`}
            className="inline-block text-[12px] font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2"
          >
            Edit intake / open full navigator
          </Link>
        </header>
        <WhatIfPanel scenario={scenario} onChange={setScenario} />
        <PlanView plan={plan} sim={sim} />
        <CoachChat plan={plan} remote={[]} />
      </section>
    );
  }

  return (
    <section
      aria-label="Recovery summary"
      className="rounded-2xl border border-slate-200 bg-white p-4"
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">Recovery</p>
      <h2 className="mt-0.5 text-[15px] font-bold text-slate-950">Recovery Navigator</h2>
      <FinanceDisclaimer />
      <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
        Complete intake to see coverage gap, indicators, forecast, and funding options.
      </p>
      <Link
        href={`/affected/property/${propertyId}/recovery`}
        className="mt-3 block rounded-xl bg-blue-700 px-4 py-3 text-center text-[13px] font-bold text-white"
      >
        Build a recovery plan
      </Link>
    </section>
  );
}
