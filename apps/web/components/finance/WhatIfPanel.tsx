'use client';

import type { Scenario } from '@hack/contracts/finance';

export function WhatIfPanel({
  scenario,
  onChange,
}: {
  scenario: Scenario;
  onChange: (s: Scenario) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">What-if</p>
      <h2 className="mt-0.5 text-[15px] font-bold text-slate-950">Adjust assumptions</h2>
      <p className="mt-1 text-[11px] text-slate-500">
        Updates the chart instantly in this browser. Educational estimate — not financial advice.
      </p>

      <label className="mt-3 block space-y-1">
        <span className="text-[12px] font-semibold text-slate-700">Repair case</span>
        <select
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px]"
          value={scenario.repairCase}
          onChange={(e) =>
            onChange({
              ...scenario,
              repairCase: e.target.value as Scenario['repairCase'],
            })
          }
        >
          <option value="low">Low</option>
          <option value="likely">Likely</option>
          <option value="high">High</option>
        </select>
      </label>

      <label className="mt-3 block space-y-1">
        <span className="flex justify-between text-[12px] font-semibold text-slate-700">
          <span>Payout delay</span>
          <span>{scenario.payoutDelayDays} days</span>
        </span>
        <input
          type="range"
          min={0}
          max={180}
          value={scenario.payoutDelayDays}
          onChange={(e) =>
            onChange({ ...scenario, payoutDelayDays: Number(e.target.value) })
          }
          className="w-full"
        />
      </label>

      <label className="mt-3 block space-y-1">
        <span className="flex justify-between text-[12px] font-semibold text-slate-700">
          <span>Income loss</span>
          <span>{scenario.incomeLossMonths} mo</span>
        </span>
        <input
          type="range"
          min={0}
          max={6}
          step={0.5}
          value={scenario.incomeLossMonths}
          onChange={(e) =>
            onChange({ ...scenario, incomeLossMonths: Number(e.target.value) })
          }
          className="w-full"
        />
      </label>

      <label className="mt-3 block space-y-1">
        <span className="flex justify-between text-[12px] font-semibold text-slate-700">
          <span>Repair start</span>
          <span>day {scenario.repairStartDay}</span>
        </span>
        <input
          type="range"
          min={0}
          max={60}
          value={scenario.repairStartDay}
          onChange={(e) =>
            onChange({ ...scenario, repairStartDay: Number(e.target.value) })
          }
          className="w-full"
        />
      </label>

      <label className="mt-3 block space-y-1">
        <span className="text-[12px] font-semibold text-slate-700">
          Deductible override ($) — optional
        </span>
        <input
          type="number"
          min={0}
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px]"
          value={
            scenario.deductibleOverrideCents == null
              ? ''
              : Math.round(scenario.deductibleOverrideCents / 100)
          }
          placeholder="Use policy deductible"
          onChange={(e) => {
            const v = e.target.value;
            onChange({
              ...scenario,
              deductibleOverrideCents: v === '' ? undefined : Math.round(Number(v) * 100),
            });
          }}
        />
      </label>
    </section>
  );
}
