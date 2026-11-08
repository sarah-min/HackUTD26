import type { AffectedIntake, InsuranceInfo } from '@hack/contracts/finance';
import type { Hazard } from '@hack/contracts/common';
import { STRUCTURE_COMPONENTS, type CostEstimate, type RepairCase } from './types';
import { deductibleCents } from './deductible';

function caseTotal(cost: CostEstimate, repairCase: RepairCase): number {
  if (repairCase === 'low') return cost.lowCents;
  if (repairCase === 'high') return cost.highCents;
  return cost.likelyCents;
}

function scaleFactor(cost: CostEstimate, repairCase: RepairCase): number {
  if (cost.likelyCents === 0) return 0;
  return caseTotal(cost, repairCase) / cost.likelyCents;
}

function scaledBuckets(cost: CostEstimate, repairCase: RepairCase): { structureCents: number; contentsCents: number } {
  const factor = scaleFactor(cost, repairCase);
  let structure = 0;
  let contents = 0;
  for (const line of cost.lineItems) {
    const scaled = Math.round(line.likelyCents * factor);
    if (line.component === 'contents') contents += scaled;
    else if ((STRUCTURE_COMPONENTS as readonly string[]).includes(line.component)) structure += scaled;
    // vehicle ignored for insurance payout buckets (not dwelling/contents)
  }
  return { structureCents: structure, contentsCents: contents };
}

export type PayoutResult = {
  repairCostCents: { low: number; likely: number; high: number };
  expectedPayoutCents: { low: number; likely: number; high: number };
  gapCents: { low: number; likely: number; high: number };
  payoutNotes: string[];
};

function payoutForCase(args: {
  cost: CostEstimate;
  repairCase: RepairCase;
  insurance: InsuranceInfo;
  hazard: Hazard;
  deductible: number;
  notes: string[];
}): number {
  const { insurance, hazard, deductible, notes } = args;
  if (insurance.policyType === 'none' || insurance.policyType === 'unknown') {
    const note = 'No usable policy on file for this estimate — payout assumed $0. Confirm coverage with your insurer.';
    if (!notes.includes(note)) notes.push(note);
    return 0;
  }

  if (hazard === 'flood' && !insurance.floodCovered) {
    const note =
      'Flood damage: standard homeowners/renters policies typically exclude flood — check your policy.';
    if (!notes.includes(note)) notes.push(note);
    return 0;
  }

  const { structureCents, contentsCents } = scaledBuckets(args.cost, args.repairCase);

  if (insurance.policyType === 'renters') {
    return Math.max(0, Math.min(contentsCents, insurance.contentsCoverageCents) - deductible);
  }

  // homeowners
  return Math.max(
    0,
    Math.min(structureCents, insurance.dwellingCoverageCents) +
      Math.min(contentsCents, insurance.contentsCoverageCents) -
      deductible,
  );
}

export function computePayoutGap(args: {
  cost: CostEstimate;
  intake: AffectedIntake;
  hazard: Hazard;
  deductibleOverrideCents?: number;
}): PayoutResult {
  const notes: string[] = [];
  const deductible = deductibleCents(args.intake.insurance, {
    deductibleOverrideCents: args.deductibleOverrideCents,
  });

  const repairCostCents = {
    low: args.cost.lowCents,
    likely: args.cost.likelyCents,
    high: args.cost.highCents,
  };

  const expectedPayoutCents = {
    low: payoutForCase({
      cost: args.cost,
      repairCase: 'low',
      insurance: args.intake.insurance,
      hazard: args.hazard,
      deductible,
      notes,
    }),
    likely: payoutForCase({
      cost: args.cost,
      repairCase: 'likely',
      insurance: args.intake.insurance,
      hazard: args.hazard,
      deductible,
      notes,
    }),
    high: payoutForCase({
      cost: args.cost,
      repairCase: 'high',
      insurance: args.intake.insurance,
      hazard: args.hazard,
      deductible,
      notes,
    }),
  };

  const gapCents = {
    low: Math.max(0, repairCostCents.low - expectedPayoutCents.low),
    likely: Math.max(0, repairCostCents.likely - expectedPayoutCents.likely),
    high: Math.max(0, repairCostCents.high - expectedPayoutCents.high),
  };

  return { repairCostCents, expectedPayoutCents, gapCents, payoutNotes: notes };
}
