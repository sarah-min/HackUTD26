import {
  COST_DISCLAIMER,
  CostEstimateSchema,
  type Component,
  type CostEstimate,
  type CostLineItem,
  type DamageLevel,
} from '@hack/contracts';
import {
  COMPONENT_SHARE_BPS,
  CONTENTS_CENTS,
  COST_MODEL_VERSION,
  DAMAGE_FRACTION_BPS,
  DEFAULT_HOME,
  HIGH_FACTOR_BPS,
  LOW_FACTOR_BPS,
  REPLACEMENT_COST_PER_SQFT_CENTS,
  STRUCTURE_COMPONENTS,
  VEHICLE_CENTS,
} from './costTable';
import { dollars, mulDivRound, pct } from './money';

export interface EstimateRepairCostArgs {
  componentLevels: Partial<Record<Component, DamageLevel>>;
  homeSqft?: number;
  stories?: number;
  tenure?: 'own' | 'rent';
}

export const RENTER_NOTE =
  "Renter: structure repairs are usually the landlord's responsibility, so they are excluded; contents and vehicle are kept.";
export const ASSUMED_NOTE = 'Assumed home size (1,800 sqft, 1 story, owner). Update your home details for a closer estimate.';

/** CONTRACTS.md §6, deterministic and integer-cent exact. Missing inputs → defaults with assumed=true. */
export function estimateRepairCost(args: EstimateRepairCostArgs): CostEstimate {
  const assumed = args.homeSqft === undefined || args.stories === undefined || args.tenure === undefined;
  const homeSqft = args.homeSqft ?? DEFAULT_HOME.homeSqft;
  const stories = args.stories ?? DEFAULT_HOME.stories;
  const tenure = args.tenure ?? DEFAULT_HOME.tenure;
  if (!Number.isSafeInteger(homeSqft) || homeSqft <= 0 || homeSqft > 100_000) {
    throw new Error(`estimateRepairCost: homeSqft must be a positive integer ≤ 100000, got ${homeSqft}`);
  }
  if (!Number.isSafeInteger(stories) || stories <= 0 || stories > 10) {
    throw new Error(`estimateRepairCost: stories must be an integer between 1 and 10, got ${stories}`);
  }

  const level = (c: Component): DamageLevel => args.componentLevels[c] ?? 'none';
  const structureValue = homeSqft * REPLACEMENT_COST_PER_SQFT_CENTS;
  const lineItems: CostLineItem[] = [];
  const notes: string[] = [];
  if (assumed) notes.push(ASSUMED_NOTE);

  let structureTotal = 0;
  for (const c of STRUCTURE_COMPONENTS) {
    const lv = level(c);
    if (lv === 'none') continue;
    const share = COMPONENT_SHARE_BPS[c];
    const fraction = DAMAGE_FRACTION_BPS[lv];
    const cents = mulDivRound(structureValue, share, fraction, 100_000_000);
    const basis = `${homeSqft.toLocaleString('en-US')} sqft × ${dollars(REPLACEMENT_COST_PER_SQFT_CENTS)}/sqft × ${pct(share)} ${c.replace(/_/g, ' ')} share × ${pct(fraction)} (${lv})`;
    if (tenure === 'rent') {
      lineItems.push({ component: c, level: lv, basis: `Excluded for renters (landlord): ${basis}`, likelyCents: 0 });
    } else {
      lineItems.push({ component: c, level: lv, basis, likelyCents: cents });
      structureTotal += cents;
    }
  }
  if (structureTotal > structureValue) {
    notes.push(`Structure total capped at the home's replacement value (${dollars(structureValue)}).`);
    structureTotal = structureValue;
  }
  if (tenure === 'rent') notes.push(RENTER_NOTE);

  const contentsLevel = level('contents');
  const contents = CONTENTS_CENTS[contentsLevel];
  if (contentsLevel !== 'none') {
    lineItems.push({
      component: 'contents',
      level: contentsLevel,
      basis: `Fixed contents allowance for ${contentsLevel} damage`,
      likelyCents: contents,
    });
  }
  const vehicleLevel = level('vehicle');
  const vehicle = VEHICLE_CENTS[vehicleLevel];
  if (vehicleLevel !== 'none') {
    lineItems.push({
      component: 'vehicle',
      level: vehicleLevel,
      basis: `Fixed vehicle allowance for ${vehicleLevel} damage`,
      likelyCents: vehicle,
    });
  }

  const likelyCents = structureTotal + contents + vehicle;
  return CostEstimateSchema.parse({
    lowCents: mulDivRound(likelyCents, LOW_FACTOR_BPS, 1, 10_000),
    likelyCents,
    highCents: mulDivRound(likelyCents, HIGH_FACTOR_BPS, 1, 10_000),
    lineItems,
    inputs: { homeSqft, stories, tenure, assumed },
    costModelVersion: COST_MODEL_VERSION,
    disclaimer: COST_DISCLAIMER,
    notes,
  });
}
