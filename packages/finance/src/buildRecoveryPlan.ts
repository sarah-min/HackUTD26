import {
  RecoveryPlanSchema,
  ScenarioSchema,
  type AffectedIntake,
  type FinancialProfile,
  type RecoveryPlan,
} from '@hack/contracts/finance';
import { computeIndicators } from './indicators';
import { buildFundingOptions, recommendedMix } from './options';
import { buildForecast } from './forecast';
import { computePayoutGap } from './payout';
import type { CostEstimate, PlanAssessmentInput } from './types';

function nextSteps(args: {
  gapLikely: number;
  floodNote: boolean;
  hasDeclaration: boolean;
}): string[] {
  const steps: string[] = [];
  steps.push('Call your insurer to open a claim and confirm deductible and flood coverage.');
  if (args.floodNote) {
    steps.push('Ask whether you have a separate flood policy (e.g. NFIP) for this loss.');
  }
  if (args.gapLikely > 0) {
    steps.push('Review the recommended funding mix and adjust the what-if controls before committing cash.');
  }
  if (args.hasDeclaration) {
    steps.push('Check SBA / FEMA eligibility using the links on the funding options list.');
  }
  steps.push('Educational estimate using a synthetic demo profile — not financial advice.');
  return steps.slice(0, 6);
}

export function buildRecoveryPlan(args: {
  propertyId: string;
  reportId: string;
  intake: AffectedIntake;
  profile: FinancialProfile;
  assessment: PlanAssessmentInput;
  cost: CostEstimate;
  now?: number;
}): RecoveryPlan {
  const scenario = ScenarioSchema.parse({});
  const payout = computePayoutGap({
    cost: args.cost,
    intake: args.intake,
    hazard: args.assessment.hazard,
  });

  const indicators = computeIndicators({
    profile: args.profile,
    gapLikelyCents: payout.gapCents.likely,
    repairLikelyCents: payout.repairCostCents.likely,
  });

  const options = buildFundingOptions({
    profile: args.profile,
    gapLikelyCents: payout.gapCents.likely,
    declarations: args.assessment.declarations,
  });
  const mix = recommendedMix(options, payout.gapCents.likely);
  const optionsById = new Map(options.map((o) => [o.id, o]));

  const startAt = args.now ?? Date.now();
  const { forecast, firstShortfallDay } = buildForecast({
    profile: args.profile,
    scenario,
    repairCostCents: payout.repairCostCents.likely,
    expectedPayoutCents: payout.expectedPayoutCents.likely,
    fundingMix: mix,
    optionsById,
    startAt,
  });

  const plan = {
    propertyId: args.propertyId,
    reportId: args.reportId,
    profileId: args.profile.id,
    cost: args.cost,
    repairCostCents: payout.repairCostCents,
    expectedPayoutCents: payout.expectedPayoutCents,
    gapCents: payout.gapCents,
    payoutNotes: payout.payoutNotes,
    indicators,
    options,
    recommendedMix: mix,
    forecast,
    firstShortfallDay,
    nextSteps: nextSteps({
      gapLikely: payout.gapCents.likely,
      floodNote: payout.payoutNotes.some((n) => n.includes('Flood damage')),
      hasDeclaration: args.assessment.declarations.length > 0,
    }),
    disclaimer: 'Educational estimate using a synthetic demo profile. Not financial advice.' as const,
    source: 'synthetic' as const,
    createdAt: startAt,
  };

  return RecoveryPlanSchema.parse(plan);
}
