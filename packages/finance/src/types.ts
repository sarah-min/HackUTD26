import type { Component, DamageLevel, Hazard } from '@hack/contracts/common';

/** Matches CONTRACTS CostEstimate until P3's assessment.ts is importable. */
export type CostEstimate = {
  lowCents: number;
  likelyCents: number;
  highCents: number;
  lineItems: Array<{
    component: Component;
    level: DamageLevel;
    basis: string;
    likelyCents: number;
  }>;
  inputs: { homeSqft: number; stories: number; tenure: 'own' | 'rent'; assumed: boolean };
  costModelVersion: string;
  disclaimer: 'Illustrative estimate, not a contractor quote or insurance determination.';
  notes?: string[];
};

export type DisasterDeclaration = {
  femaDeclarationString: string;
  declarationType: string;
  incidentType: string;
  title: string;
  declarationDate: string;
  ihProgramDeclared: boolean;
  sourceUrl: string;
};

/** Slice of DamageAssessment the plan engine needs (P3 owns the full schema). */
export type PlanAssessmentInput = {
  hazard: Hazard;
  declarations: DisasterDeclaration[];
};

export type RepairCase = 'low' | 'likely' | 'high';

export const STRUCTURE_COMPONENTS = [
  'roof',
  'exterior_walls',
  'windows_doors',
  'foundation',
  'interior',
  'utilities',
  'yard_debris',
] as const satisfies readonly Component[];

export const MS_PER_DAY = 86_400_000;
