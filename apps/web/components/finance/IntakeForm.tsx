'use client';

import { useState } from 'react';
import {
  AffectedIntakeSchema,
  type AffectedIntake,
} from '@hack/contracts/finance';
import type { Vulnerability } from '@hack/contracts/common';
import { PERSONAS } from '@hack/finance';
const VULNS: { id: Vulnerability; label: string }[] = [
  { id: 'elderly', label: 'Elderly' },
  { id: 'child_under_5', label: 'Child under 5' },
  { id: 'disability', label: 'Disability' },
  { id: 'medical_device', label: 'Medical device' },
  { id: 'no_transport', label: 'No transport' },
  { id: 'pets', label: 'Pets' },
  { id: 'limited_english', label: 'Limited English' },
];

const DEFAULT: AffectedIntake = AffectedIntakeSchema.parse({
  household: { peopleCount: 2, vulnerabilities: [] },
  tenure: 'own',
  homeSqft: 1800,
  stories: 1,
  insurance: {
    policyType: 'homeowners',
    dwellingCoverageCents: 5_000_000,
    contentsCoverageCents: 500_000,
    deductibleCents: 100_000,
    floodCovered: false,
  },
  personaId: PERSONAS[0]!.id,
});

export function IntakeForm({
  initial,
  busy,
  onSubmit,
}: {
  initial?: AffectedIntake | null;
  busy?: boolean;
  onSubmit: (intake: AffectedIntake) => void;
}) {
  const [form, setForm] = useState<AffectedIntake>(initial ?? DEFAULT);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = AffectedIntakeSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid intake');
      return;
    }
    setError(null);
    onSubmit(parsed.data);
  }

  function toggleVuln(v: Vulnerability) {
    setForm((f) => {
      const has = f.household.vulnerabilities.includes(v);
      return {
        ...f,
        household: {
          ...f.household,
          vulnerabilities: has
            ? f.household.vulnerabilities.filter((x) => x !== v)
            : [...f.household.vulnerabilities, v],
        },
      };
    });
  }

  return (
    <form className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4" onSubmit={submit}>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">Intake</p>
      <h2 className="text-[15px] font-bold text-slate-950">Household &amp; coverage</h2>
      <p className="text-[11px] text-amber-800">Synthetic demo profiles — labeled fixture data.</p>

      <label className="block space-y-1">
        <span className="text-[12px] font-semibold text-slate-700">Demo persona</span>
        <select
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px]"
          value={form.personaId}
          disabled={busy}
          onChange={(e) => setForm({ ...form, personaId: e.target.value })}
        >
          {PERSONAS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-[12px] font-semibold text-slate-700">People</span>
          <input
            type="number"
            min={1}
            max={20}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px]"
            value={form.household.peopleCount}
            disabled={busy}
            onChange={(e) =>
              setForm({
                ...form,
                household: { ...form.household, peopleCount: Number(e.target.value) || 1 },
              })
            }
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-semibold text-slate-700">Tenure</span>
          <select
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px]"
            value={form.tenure}
            disabled={busy}
            onChange={(e) =>
              setForm({ ...form, tenure: e.target.value as 'own' | 'rent' })
            }
          >
            <option value="own">Own</option>
            <option value="rent">Rent</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-semibold text-slate-700">Home sqft</span>
          <input
            type="number"
            min={200}
            max={10000}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px]"
            value={form.homeSqft}
            disabled={busy}
            onChange={(e) => setForm({ ...form, homeSqft: Number(e.target.value) || 1800 })}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-semibold text-slate-700">Stories</span>
          <input
            type="number"
            min={1}
            max={4}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px]"
            value={form.stories}
            disabled={busy}
            onChange={(e) => setForm({ ...form, stories: Number(e.target.value) || 1 })}
          />
        </label>
      </div>

      <fieldset>
        <legend className="mb-1 text-[12px] font-semibold text-slate-700">Vulnerabilities</legend>
        <div className="flex flex-wrap gap-1.5">
          {VULNS.map((v) => {
            const on = form.household.vulnerabilities.includes(v.id);
            return (
              <button
                key={v.id}
                type="button"
                disabled={busy}
                onClick={() => toggleVuln(v.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  on ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="block space-y-1">
        <span className="text-[12px] font-semibold text-slate-700">Policy</span>
        <select
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px]"
          value={form.insurance.policyType}
          disabled={busy}
          onChange={(e) =>
            setForm({
              ...form,
              insurance: {
                ...form.insurance,
                policyType: e.target.value as AffectedIntake['insurance']['policyType'],
              },
            })
          }
        >
          <option value="homeowners">Homeowners</option>
          <option value="renters">Renters</option>
          <option value="none">None</option>
          <option value="unknown">Unknown</option>
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-[12px] font-semibold text-slate-700">Deductible ($)</span>
          <input
            type="number"
            min={0}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px]"
            value={Math.round((form.insurance.deductibleCents ?? 0) / 100)}
            disabled={busy}
            onChange={(e) =>
              setForm({
                ...form,
                insurance: {
                  ...form.insurance,
                  deductibleCents: Math.round(Number(e.target.value) * 100) || 0,
                },
              })
            }
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-[12px] font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={form.insurance.floodCovered}
            disabled={busy}
            onChange={(e) =>
              setForm({
                ...form,
                insurance: { ...form.insurance, floodCovered: e.target.checked },
              })
            }
          />
          Flood covered
        </label>
      </div>

      {error ? <p className="text-[12px] font-semibold text-red-700">{error}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-blue-700 px-4 py-3 text-[13px] font-bold text-white disabled:opacity-60"
      >
        {busy ? 'Saving…' : 'Build recovery plan'}
      </button>
    </form>
  );
}
