import {
  ScenarioSchema,
  SimulationResultSchema,
  type AffectedIntake,
  type FinancialProfile,
  type Scenario,
  type SimulationResult,
} from '@hack/contracts/finance';
import type { Hazard } from '@hack/contracts/common';
import { computeIndicators } from './indicators';
import { buildFundingOptions, recommendedMix, totalCostOfFunds } from './options';
import { buildForecast } from './forecast';
import { computePayoutGap } from './payout';
import type { CostEstimate, DisasterDeclaration } from './types';

export function simulate(args: {
  profile: FinancialProfile;
  intake: AffectedIntake;
  cost: CostEstimate;
  declarations: DisasterDeclaration[];
  hazard: Hazard;
  scenario: Scenario;
  now?: number;
}): SimulationResult {
  const scenario = ScenarioSchema.parse(args.scenario);
  const payout = computePayoutGap({
    cost: args.cost,
    intake: args.intake,
    hazard: args.hazard,
    deductibleOverrideCents: scenario.deductibleOverrideCents,
  });

  const repair =
    scenario.repairCase === 'low'
      ? payout.repairCostCents.low
      : scenario.repairCase === 'high'
        ? payout.repairCostCents.high
        : payout.repairCostCents.likely;
  const expected =
    scenario.repairCase === 'low'
      ? payout.expectedPayoutCents.low
      : scenario.repairCase === 'high'
        ? payout.expectedPayoutCents.high
        : payout.expectedPayoutCents.likely;
  const gapLikely = payout.gapCents.likely;

  const options = buildFundingOptions({
    profile: args.profile,
    gapLikelyCents: gapLikely,
    declarations: args.declarations,
  });
  const mix =
    scenario.fundingMix ?? recommendedMix(options, Math.max(0, repair - expected));
  const optionsById = new Map(options.map((o) => [o.id, o]));

  const startAt = args.now ?? Date.now();
  const { forecast, firstShortfallDay } = buildForecast({
    profile: args.profile,
    scenario,
    repairCostCents: repair,
    expectedPayoutCents: expected,
    fundingMix: mix,
    optionsById,
    startAt,
  });

  const indicators = computeIndicators({
    profile: args.profile,
    gapLikelyCents: gapLikely,
    repairLikelyCents: payout.repairCostCents.likely,
  });

  return SimulationResultSchema.parse({
    forecast,
    indicators,
    gapCents: payout.gapCents,
    firstShortfallDay,
    totalCostOfFundsCents: totalCostOfFunds(mix, args.profile),
  });
}
