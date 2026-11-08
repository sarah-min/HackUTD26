import { z } from 'zod';
import {
  ComponentSchema,
  DamageLevelSchema,
  HazardSchema,
  LifeSafetyFlagSchema,
  SourceSchema,
} from './common';

// Part 3 contract (CONTRACTS.md §3.1). Additive changes only.

export const WaterDepthSchema = z.enum(['none', 'ankle', 'knee', 'waist', 'above_waist', 'unknown']);

export const FrameFindingSchema = z.object({
  frameIndex: z.number().int().min(0),
  tSec: z.number().min(0), // 0 for photos
  usable: z.boolean(),
  unusableReason: z.enum(['dark', 'blurry', 'not_a_structure', 'parse_error', 'other']).optional(),
  components: z.array(
    z.object({
      component: ComponentSchema,
      level: DamageLevelSchema,
      evidence: z.string().max(200),
      confidence: z.number().min(0).max(1),
    }),
  ),
  lifeSafety: z.array(
    z.object({
      flag: LifeSafetyFlagSchema,
      evidence: z.string().max(200),
      confidence: z.number().min(0).max(1),
    }),
  ),
  hazardObserved: HazardSchema.optional(),
  waterDepth: WaterDepthSchema.default('unknown'),
  caption: z.string().max(240),
});
export type FrameFinding = z.infer<typeof FrameFindingSchema>;

export const CostLineItemSchema = z.object({
  component: ComponentSchema,
  level: DamageLevelSchema,
  basis: z.string(),
  likelyCents: z.number().int().nonnegative(),
});
export type CostLineItem = z.infer<typeof CostLineItemSchema>;

export const COST_DISCLAIMER = 'Illustrative estimate, not a contractor quote or insurance determination.' as const;

export const CostEstimateSchema = z.object({
  lowCents: z.number().int().nonnegative(),
  likelyCents: z.number().int().nonnegative(),
  highCents: z.number().int().nonnegative(),
  lineItems: z.array(CostLineItemSchema),
  inputs: z.object({
    homeSqft: z.number().int(),
    stories: z.number().int(),
    tenure: z.enum(['own', 'rent']),
    assumed: z.boolean(), // true → defaults were used; UI shows "assumed home size"
  }),
  costModelVersion: z.string(),
  disclaimer: z.literal(COST_DISCLAIMER),
  notes: z.array(z.string()).optional(), // additive: e.g. renter exclusion note
});
export type CostEstimate = z.infer<typeof CostEstimateSchema>;

export const DisasterDeclarationSchema = z.object({
  femaDeclarationString: z.string(),
  declarationType: z.string(),
  incidentType: z.string(),
  title: z.string(),
  declarationDate: z.string(),
  ihProgramDeclared: z.boolean(),
  sourceUrl: z.string().url(),
});
export type DisasterDeclaration = z.infer<typeof DisasterDeclarationSchema>;

export const WeatherAlertSchema = z.object({ event: z.string(), severity: z.string(), headline: z.string() });
export type WeatherAlert = z.infer<typeof WeatherAlertSchema>;

export const AssessmentLocationSchema = z.object({
  stateCode: z.string(),
  countyName: z.string(),
  countyFips: z.string(),
});
export type AssessmentLocation = z.infer<typeof AssessmentLocationSchema>;

export const DamageAssessmentSchema = z.object({
  reportId: z.string(),
  propertyId: z.string(),
  overallLevel: DamageLevelSchema, // code-computed
  componentLevels: z.record(ComponentSchema, DamageLevelSchema), // code-computed
  lifeSafety: z.array(LifeSafetyFlagSchema), // code-computed
  hazard: HazardSchema,
  confidence: z.number().min(0).max(1), // code-computed
  usableFrameCount: z.number().int(),
  totalFrameCount: z.number().int(),
  cost: CostEstimateSchema, // code-computed, assumed defaults
  declarations: z.array(DisasterDeclarationSchema),
  activeAlerts: z.array(WeatherAlertSchema),
  location: AssessmentLocationSchema.optional(),
  summary: z.string().max(1200), // model
  recommendedActions: z.array(z.string().max(200)).max(8), // model
  claimNotice: z.string().max(3000).optional(), // model
  modelId: z.string(),
  visionModelId: z.string(),
  promptVersion: z.string(),
  source: SourceSchema,
  createdAt: z.number().int(),
});
export type DamageAssessment = z.infer<typeof DamageAssessmentSchema>;

/** Additive: the only fields the agent's `finish` action may supply. Code merges them (CONTRACTS §3.1). */
export const AgentFinishSchema = z.object({
  summary: z.string().min(1).max(1200),
  recommendedActions: z.array(z.string().min(1).max(200)).max(8),
  claimNotice: z.string().max(3000).optional(),
  hazard: HazardSchema.optional(),
});
export type AgentFinish = z.infer<typeof AgentFinishSchema>;
