import type { Component, DamageLevel } from '@hack/contracts/common';

// CONTRACTS.md §6 (cost-v1). Illustrative defaults only; labeled as such in the UI.
// Shares and fractions are basis points so every multiplication stays in integers.

export const COST_MODEL_VERSION = 'cost-v1';
export const REPLACEMENT_COST_PER_SQFT_CENTS = 15_000; // $150/sqft
export const DEFAULT_HOME = { homeSqft: 1800, stories: 1, tenure: 'own' as const };

export const STRUCTURE_COMPONENTS = [
  'roof',
  'exterior_walls',
  'windows_doors',
  'foundation',
  'interior',
  'utilities',
  'yard_debris',
] as const satisfies readonly Component[];
export type StructureComponent = (typeof STRUCTURE_COMPONENTS)[number];

export const COMPONENT_SHARE_BPS: Record<StructureComponent, number> = {
  roof: 1_500,
  exterior_walls: 1_500,
  windows_doors: 700,
  foundation: 1_200,
  interior: 3_000,
  utilities: 1_100,
  yard_debris: 200,
};

export const DAMAGE_FRACTION_BPS: Record<DamageLevel, number> = {
  none: 0,
  affected: 500,
  minor: 1_500,
  major: 5_000,
  destroyed: 10_000,
};

export const CONTENTS_CENTS: Record<DamageLevel, number> = {
  none: 0,
  affected: 50_000,
  minor: 300_000,
  major: 1_500_000,
  destroyed: 4_000_000,
};

export const VEHICLE_CENTS: Record<DamageLevel, number> = {
  none: 0,
  affected: 50_000,
  minor: 250_000,
  major: 1_200_000,
  destroyed: 2_500_000,
};

export const LOW_FACTOR_BPS = 7_000;
export const HIGH_FACTOR_BPS = 14_000;
