'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DamageAssessmentSchema } from '@hack/contracts/assessment';
import {
  ScenarioSchema,
  type AffectedIntake,
  type RecoveryPlan,
  type Scenario,
  type SimulationResult,
} from '@hack/contracts/finance';
import { estimateRepairCost } from '@hack/damage';
import { buildRecoveryPlan, getPersona, simulate } from '@hack/finance';
import {
  idFromString,
  idToString,
  R,
  useReducer,
  useReportsForProperty,
  useVerifiedFor,
  useVerifiedReportData,
} from '@/lib/stdb';
import { AppShell } from '@/components/chrome/AppShell';
import { FinanceDisclaimer } from './FinanceDisclaimer';
import { RecoveryWorkspace } from './RecoveryWorkspace';
import { useRecoveryData } from './useRecoveryData';

export function RecoveryNavigator({ propertyIdParam }: { propertyIdParam: string }) {
  const propertyId = idFromString(propertyIdParam);
  const { verified, ready: verReady } = useVerifiedFor(propertyId);
  const { reports } = useReportsForProperty(verified ? propertyId : null);
  const recovery = useRecoveryData(propertyId);
  const saveIntake = useReducer(R.saveAffectedIntake);
  const askCoach = useReducer(R.askCoach);

  const assessed = useMemo(
    () => reports.filter((r) => r.status === 'assessed'),
    [reports],
  );
  const defaultReportId = assessed[0]?.id ?? null;
  const [reportId, setReportId] = useState<bigint | null>(null);
  const chosenReportId = reportId ?? defaultReportId;

  const { assessment: assessmentRow } = useVerifiedReportData(chosenReportId);
  const [localPlan, setLocalPlan] = useState<RecoveryPlan | null>(null);
  const [intake, setIntake] = useState<AffectedIntake | null>(null);
  const [scenario, setScenario] = useState<Scenario>(() => ScenarioSchema.parse({}));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storedPlan =
    recovery.plans.find((p) => chosenReportId != null && p.reportId === chosenReportId)?.plan ??
    recovery.plans[0]?.plan ??
    null;
  const plan = storedPlan ?? localPlan;
  const activeIntake = intake ?? recovery.profile;

  const assessment = useMemo(() => {
    if (!assessmentRow?.json) return null;
    const parsed = DamageAssessmentSchema.safeParse(JSON.parse(assessmentRow.json));
    return parsed.success ? parsed.data : null;
  }, [assessmentRow?.json]);

  const sim: SimulationResult | null = useMemo(() => {
    if (!plan || !activeIntake || !assessment) return null;
    try {
      const profile = getPersona(activeIntake.personaId);
      const cost = estimateRepairCost({
        componentLevels: assessment.componentLevels,
        homeSqft: activeIntake.homeSqft,
        stories: activeIntake.stories,
        tenure: activeIntake.tenure,
      });
      return simulate({
        profile,
        intake: activeIntake,
        cost,
        declarations: assessment.declarations,
        hazard: assessment.hazard,
        scenario,
      });
    } catch {
      return null;
    }
  }, [plan, activeIntake, assessment, scenario]);

  async function onIntake(next: AffectedIntake) {
    setError(null);
    if (propertyId === null) return;
    if (!chosenReportId) {
      setError('No assessed report on this property yet. Film and wait for assessment first.');
      return;
    }
    if (!assessment) {
      setError('Assessment data is still loading. Try again in a moment.');
      return;
    }
    setBusy(true);
    try {
      const profile = getPersona(next.personaId);
      const cost = estimateRepairCost({
        componentLevels: assessment.componentLevels,
        homeSqft: next.homeSqft,
        stories: next.stories,
        tenure: next.tenure,
      });
      const built = buildRecoveryPlan({
        propertyId: idToString(propertyId),
        reportId: idToString(chosenReportId),
        intake: next,
        profile,
        assessment: { hazard: assessment.hazard, declarations: assessment.declarations },
        cost,
      });
      setIntake(next);
      setLocalPlan(built);
      setScenario(ScenarioSchema.parse({}));
      try {
        await saveIntake({
          propertyId,
          intakeJson: JSON.stringify(next),
          reportId: chosenReportId,
        });
      } catch {
        // Client plan still shown; worker plan job may not be registered yet.
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build plan.');
    } finally {
      setBusy(false);
    }
  }

  if (propertyId === null) {
    return (
      <AppShell>
        <p className="text-[13px] text-slate-700">That link isn&apos;t valid.</p>
      </AppShell>
    );
  }

  if (!verReady) {
    return (
      <AppShell>
        <p className="text-sm text-slate-600">Loading…</p>
      </AppShell>
    );
  }

  if (!verified) {
    return (
      <AppShell>
        <header className="space-y-2">
          <h1 className="text-lg font-bold tracking-[-0.02em] text-slate-950">
            Verify to open Recovery Navigator
          </h1>
          <FinanceDisclaimer />
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

  const coachMsgs = recovery.messages.filter(
    (m) => chosenReportId == null || m.reportId === chosenReportId,
  );

  return (
    <AppShell>
      <RecoveryWorkspace
        banner={
          <p>
            <Link
              href={`/affected/property/${idToString(propertyId)}`}
              className="text-[12px] font-semibold text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-blue-700"
            >
              Back to your property
            </Link>
          </p>
        }
        beforeIntake={
          assessed.length > 1 ? (
            <label className="block space-y-1 rounded-2xl border border-slate-200 bg-white p-4">
              <span className="text-[12px] font-semibold text-slate-700">Report</span>
              <select
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px]"
                value={chosenReportId != null ? idToString(chosenReportId) : ''}
                onChange={(e) => {
                  setReportId(idFromString(e.target.value));
                  setLocalPlan(null);
                }}
              >
                {assessed.map((r) => (
                  <option key={idToString(r.id)} value={idToString(r.id)}>
                    Report {idToString(r.id)} · {r.overallLevel} · {r.hazard.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>
          ) : null
        }
        emptyState={
          assessed.length === 0 ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[12px] text-amber-900">
              No assessed report yet. Submit footage and wait for analysis before building a recovery
              plan.
            </p>
          ) : undefined
        }
        intakeInitial={activeIntake}
        intakeBusy={busy}
        onIntake={assessed.length === 0 ? undefined : (v) => void onIntake(v)}
        error={error}
        plan={plan}
        sim={sim}
        scenario={scenario}
        onScenario={setScenario}
        coachRemote={coachMsgs}
        onAskCoach={
          chosenReportId
            ? async (text) => {
                try {
                  await askCoach({ propertyId, reportId: chosenReportId, text });
                } catch {
                  throw new Error('coach_unavailable');
                }
              }
            : undefined
        }
      />
    </AppShell>
  );
}
