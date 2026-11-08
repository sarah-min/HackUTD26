'use client';

import { useMemo, useState } from 'react';
import { DamageAssessmentSchema, type DamageAssessment } from '@hack/contracts/assessment';
import {
  ScenarioSchema,
  type AffectedIntake,
  type RecoveryPlan,
  type Scenario,
  type SimulationResult,
} from '@hack/contracts/finance';
import { estimateRepairCost } from '@hack/damage';
import { buildRecoveryPlan, getPersona, simulate } from '@hack/finance';
import { AppShell } from '@/components/chrome/AppShell';
import { CoachChat } from './CoachChat';
import { FinanceDisclaimer } from './FinanceDisclaimer';
import { IntakeForm } from './IntakeForm';
import { PlanView } from './PlanView';
import { WhatIfPanel } from './WhatIfPanel';

/** Embedded fixture assessment — labeled source:fixture; not a live model result. */
const FIXTURE_ASSESSMENT: DamageAssessment = DamageAssessmentSchema.parse({
  reportId: '0',
  propertyId: '0',
  overallLevel: 'destroyed',
  componentLevels: {
    roof: 'destroyed',
    exterior_walls: 'minor',
    windows_doors: 'minor',
    foundation: 'none',
    interior: 'minor',
    utilities: 'none',
    contents: 'minor',
    vehicle: 'none',
    yard_debris: 'minor',
  },
  lifeSafety: ['standing_water_interior', 'road_blocked'],
  hazard: 'hurricane_wind',
  confidence: 0.76,
  usableFrameCount: 3,
  totalFrameCount: 3,
  cost: {
    lowCents: 3_260_250,
    likelyCents: 4_657_500,
    highCents: 6_520_500,
    lineItems: [
      {
        component: 'roof',
        level: 'destroyed',
        basis: '[FIXTURE] 1800 sqft × $150/sqft × 15% roof share',
        likelyCents: 4_050_000,
      },
      {
        component: 'exterior_walls',
        level: 'minor',
        basis: '[FIXTURE] 1800 sqft × $150/sqft × 15% × 15%',
        likelyCents: 607_500,
      },
    ],
    inputs: { homeSqft: 1800, stories: 1, tenure: 'own', assumed: true },
    costModelVersion: 'cost-v1',
    disclaimer: 'Illustrative estimate, not a contractor quote or insurance determination.',
  },
  declarations: [],
  activeAlerts: [
    {
      event: '[FIXTURE] Flash Flood Warning',
      severity: 'Severe',
      headline: '[FIXTURE] Simulated alert',
    },
  ],
  location: {
    stateCode: 'TX',
    countyName: '[FIXTURE] County',
    countyFips: '48113',
  },
  summary:
    '[FIXTURE] Simulated assessment for Recovery Navigator preview. Not a real AI result.',
  recommendedActions: [
    '[FIXTURE] Stay clear of the hazard and call 911 if anyone is in danger.',
  ],
  claimNotice: '[FIXTURE] Draft first notice of loss (simulated).',
  modelId: 'fake-worker',
  visionModelId: 'fake-worker',
  promptVersion: 'fixture',
  source: 'fixture',
  createdAt: Date.now(),
});

/**
 * Client-only walkthrough of Recovery Navigator without ID verification or a live
 * assessed report. Visible fixture badge — never presented as live.
 */
export function RecoveryFixturePreview() {
  const [plan, setPlan] = useState<RecoveryPlan | null>(null);
  const [intake, setIntake] = useState<AffectedIntake | null>(null);
  const [scenario, setScenario] = useState<Scenario>(() => ScenarioSchema.parse({}));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sim: SimulationResult | null = useMemo(() => {
    if (!plan || !intake) return null;
    try {
      const profile = getPersona(intake.personaId);
      const cost = estimateRepairCost({
        componentLevels: FIXTURE_ASSESSMENT.componentLevels,
        homeSqft: intake.homeSqft,
        stories: intake.stories,
        tenure: intake.tenure,
      });
      return simulate({
        profile,
        intake,
        cost,
        declarations: FIXTURE_ASSESSMENT.declarations,
        hazard: FIXTURE_ASSESSMENT.hazard,
        scenario,
      });
    } catch {
      return null;
    }
  }, [plan, intake, scenario]);

  function onIntake(next: AffectedIntake) {
    setError(null);
    setBusy(true);
    try {
      const profile = getPersona(next.personaId);
      const cost = estimateRepairCost({
        componentLevels: FIXTURE_ASSESSMENT.componentLevels,
        homeSqft: next.homeSqft,
        stories: next.stories,
        tenure: next.tenure,
      });
      const built = buildRecoveryPlan({
        propertyId: '0',
        reportId: '0',
        intake: next,
        profile,
        assessment: {
          hazard: FIXTURE_ASSESSMENT.hazard,
          declarations: FIXTURE_ASSESSMENT.declarations,
        },
        cost,
      });
      setIntake(next);
      setPlan(built);
      setScenario(ScenarioSchema.parse({}));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build plan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <header className="space-y-2">
        <h1 className="text-lg font-bold tracking-[-0.02em] text-slate-950">
          Recovery Navigator
        </h1>
        <FinanceDisclaimer />
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
          <span className="font-bold uppercase tracking-wide">Fixture</span> — preview only; skips ID
          verify and live assessment.
        </p>
      </header>

      <IntakeForm initial={intake} busy={busy} onSubmit={onIntake} />
      {error ? <p className="text-[12px] font-semibold text-red-700">{error}</p> : null}

      {plan ? (
        <>
          <WhatIfPanel scenario={scenario} onChange={setScenario} />
          <PlanView plan={plan} sim={sim} />
          <CoachChat plan={plan} remote={[]} />
        </>
      ) : null}
    </AppShell>
  );
}
