'use client';

import type { ReactNode } from 'react';
import type { AffectedIntake, RecoveryPlan, Scenario, SimulationResult } from '@hack/contracts/finance';
import { CoachChat } from './CoachChat';
import { FinanceDisclaimer } from './FinanceDisclaimer';
import { IntakeForm } from './IntakeForm';
import { PlanView } from './PlanView';
import { WhatIfPanel } from './WhatIfPanel';

/**
 * Shared Recovery Navigator chrome — same layout as the fixture preview:
 * header → intake → (what-if + plan + coach once a plan exists).
 */
export function RecoveryWorkspace({
  title = 'Recovery Navigator',
  banner,
  beforeIntake,
  intakeInitial,
  intakeBusy,
  onIntake,
  error,
  emptyState,
  plan,
  sim,
  scenario,
  onScenario,
  coachRemote = [],
  onAskCoach,
  footer,
}: {
  title?: string;
  banner?: ReactNode;
  beforeIntake?: ReactNode;
  intakeInitial?: AffectedIntake | null;
  intakeBusy?: boolean;
  onIntake?: (intake: AffectedIntake) => void;
  error?: string | null;
  /** When set, replaces the intake form (e.g. no assessed report yet). */
  emptyState?: ReactNode;
  plan?: RecoveryPlan | null;
  sim?: SimulationResult | null;
  scenario?: Scenario;
  onScenario?: (s: Scenario) => void;
  coachRemote?: Array<{ role: string; text: string }>;
  onAskCoach?: (text: string) => Promise<void>;
  footer?: ReactNode;
}) {
  return (
    <>
      <header className="space-y-2">
        <h1 className="text-lg font-bold tracking-[-0.02em] text-slate-950">{title}</h1>
        <FinanceDisclaimer />
        {banner}
      </header>

      {beforeIntake}

      {emptyState ? (
        emptyState
      ) : onIntake ? (
        <IntakeForm initial={intakeInitial} busy={intakeBusy} onSubmit={onIntake} />
      ) : null}

      {error ? <p className="text-[12px] font-semibold text-red-700">{error}</p> : null}

      {plan && scenario && onScenario ? (
        <>
          <WhatIfPanel scenario={scenario} onChange={onScenario} />
          <PlanView plan={plan} sim={sim} />
          <CoachChat plan={plan} remote={coachRemote} onAsk={onAskCoach} />
        </>
      ) : null}

      {footer}
    </>
  );
}
