'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { RecoverySummaryCardProps } from '@/components/affected/placeholders/types';
import { formatCents } from '@/lib/format';
import { idFromString } from '@/lib/stdb';
import { FinanceDisclaimer } from './FinanceDisclaimer';
import { useRecoveryData } from './useRecoveryData';

/**
 * Compact plan teaser for the affected report page.
 * Prefers the live recovery_plan for this report; otherwise a CTA to build one.
 */
export function RecoverySummaryCard({ propertyId, reportId }: RecoverySummaryCardProps) {
  const propId = idFromString(propertyId);
  const repId = idFromString(reportId);
  const { plans, ready } = useRecoveryData(propId);

  const plan = useMemo(() => {
    if (repId == null) return plans[0]?.plan ?? null;
    return plans.find((p) => p.reportId === repId)?.plan ?? plans[0]?.plan ?? null;
  }, [plans, repId]);

  const worst = useMemo(() => {
    if (!plan) return null;
    return [...plan.indicators].sort((a, b) => {
      const rank = { risk: 2, watch: 1, good: 0 } as const;
      return rank[b.status] - rank[a.status];
    })[0];
  }, [plan]);

  return (
    <section
      aria-label="Recovery summary"
      data-source={plan?.source ?? 'synthetic'}
      className="rounded-2xl border border-slate-200 bg-white p-4"
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">Recovery</p>
      <h2 className="mt-0.5 text-[15px] font-bold text-slate-950">Recovery Navigator</h2>
      <FinanceDisclaimer />

      {!ready ? (
        <p className="mt-2 text-[12px] text-slate-500">Loading plan…</p>
      ) : plan ? (
        <>
          <p className="mt-2 text-xl font-bold tracking-[-0.03em] text-slate-950">
            Gap {formatCents(plan.gapCents.likely)}
          </p>
          {worst ? (
            <p className="mt-1 text-[12px] text-slate-600">
              Watch: <span className="font-semibold">{worst.label}</span> ({worst.status})
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
          Complete intake to see coverage gap, indicators, and next steps.
        </p>
      )}

      <Link
        href={`/affected/property/${propertyId}/recovery`}
        className="mt-3 block rounded-xl bg-blue-700 px-4 py-3 text-center text-[13px] font-bold text-white"
      >
        {plan ? 'Open Recovery Navigator' : 'Build a recovery plan'}
      </Link>
    </section>
  );
}
