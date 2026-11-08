'use client';

import type { RecoveryPlan, SimulationResult } from '@hack/contracts/finance';
import { formatCents } from '@/lib/format';
import { ForecastChart } from './ForecastChart';

const STATUS_CLASS = {
  good: 'bg-emerald-100 text-emerald-800',
  watch: 'bg-amber-100 text-amber-900',
  risk: 'bg-red-100 text-red-800',
} as const;

export function PlanView({
  plan,
  sim,
}: {
  plan: RecoveryPlan;
  /** Live what-if override; falls back to plan fields. */
  sim?: SimulationResult | null;
}) {
  const gap = sim?.gapCents ?? plan.gapCents;
  const indicators = sim?.indicators ?? plan.indicators;
  const forecast = sim?.forecast ?? plan.forecast;
  const firstShortfall = sim?.firstShortfallDay ?? plan.firstShortfallDay;

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-slate-200 bg-white p-4" data-source={plan.source}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">Coverage gap</p>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
            {plan.source}
          </span>
        </div>
        <p className="mt-1 text-2xl font-bold tracking-[-0.03em] text-slate-950">
          {formatCents(gap.likely)}
        </p>
        <p className="mt-1 text-[12px] text-slate-500">
          Repair {formatCents(plan.repairCostCents.likely)} · payout{' '}
          {formatCents(plan.expectedPayoutCents.likely)} (likely). Range{' '}
          {formatCents(gap.low)}–{formatCents(gap.high)}.
        </p>
        {plan.payoutNotes.length > 0 ? (
          <ul className="mt-2 space-y-1 text-[11px] text-amber-900">
            {plan.payoutNotes.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        ) : null}
        <p className="mt-2 text-[11px] text-slate-500">{plan.disclaimer}</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Indicators</p>
        <ul className="mt-2 space-y-2">
          {indicators.map((ind) => (
            <li key={ind.id} className="rounded-xl bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-bold text-slate-900">{ind.label}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_CLASS[ind.status]}`}
                >
                  {ind.status}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">{ind.explanation}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
          90-day cash forecast
        </p>
        <div className="mt-2">
          <ForecastChart forecast={forecast} firstShortfallDay={firstShortfall} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
          Funding options
        </p>
        <ul className="mt-2 space-y-2">
          {plan.options.map((o) => {
            const inMix = plan.recommendedMix.find((m) => m.optionId === o.id);
            return (
              <li
                key={o.id}
                className={`rounded-xl border px-3 py-2 ${
                  inMix ? 'border-blue-200 bg-blue-50/60' : 'border-slate-100 bg-slate-50'
                }`}
              >
                <div className="flex justify-between gap-2">
                  <p className="text-[12px] font-bold text-slate-900">{o.label}</p>
                  <p className="text-[12px] font-semibold text-slate-700">
                    {o.availableCents == null ? '—' : formatCents(o.availableCents)}
                  </p>
                </div>
                {inMix ? (
                  <p className="mt-0.5 text-[11px] font-semibold text-blue-800">
                    Recommended {formatCents(inMix.amountCents)}
                  </p>
                ) : null}
                {o.eligibilityNote ? (
                  <p className="mt-0.5 text-[11px] text-slate-500">{o.eligibilityNote}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Next steps</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-[12px] text-slate-700">
          {plan.nextSteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
