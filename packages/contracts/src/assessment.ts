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

/** Additive: normalized image region, 0..1 from the top-left corner. Drawn as the highlight box on a frame. */
export const FrameBoxSchema = z
  .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().gt(0).max(1), h: z.number().gt(0).max(1) })
  .refine((b) => b.x + b.w <= 1.0001 && b.y + b.h <= 1.0001, 'box must stay inside the image');
export type FrameBox = z.infer<typeof FrameBoxSchema>;

/** Additive: how much of the visible component is damaged. Feeds the "scope detected" column. */
export const DamageExtentSchema = z.enum(['localized', 'partial', 'widespread']);
export type DamageExtent = z.infer<typeof DamageExtentSchema>;

/**
 * Additive (damage-frame-v4): visible evidence the vision model reports. It never rates severity; code maps each cue to a
 * component and FEMA level (packages/vision/src/rules.ts). Hazard-agnostic: the same cues cover flood, wind, tornado,
 * wildfire, earthquake, hail, landslide and winter storms.
 */
export const DamageCueSchema = z.enum([
  // whole structure
  'structure_collapsed', 'structure_burned_out', 'structure_off_foundation', 'structure_leaning', 'foundation_damaged',
  // roof
  'roof_structure_missing', 'roof_sagging_or_collapsed', 'roof_covering_missing', 'roof_surface_minor', 'object_on_structure',
  // walls and openings
  'wall_section_missing', 'wall_structural_cracks', 'cladding_damaged', 'char_or_soot', 'exterior_cosmetic', 'windows_doors_broken',
  // inside
  'ceiling_collapsed', 'interior_finishes_damaged', 'mud_or_sediment_inside', 'contents_damaged', 'contents_piled_outside',
  // property
  'utility_service_damaged', 'vehicle_damaged', 'vehicle_destroyed', 'debris_on_lot', 'no_visible_damage',
]);
export type DamageCue = z.infer<typeof DamageCueSchema>;

export const SceneSchema = z.enum(['home_exterior', 'home_interior', 'street_or_area', 'aerial', 'vehicle', 'other']);
export type Scene = z.infer<typeof SceneSchema>;

/** Water height, judged only against a visible object of known height. */
export const WaterLevelSchema = z.enum([
  'not_visible', 'below_floor_level', 'ankle', 'below_outlets', 'above_outlets', 'waist_or_higher', 'near_ceiling', 'over_roof',
]);
export type WaterLevel = z.infer<typeof WaterLevelSchema>;
export const WaterReferenceObjectSchema = z.enum([
  'none', 'electrical_outlet', 'door_or_handle', 'countertop_or_furniture', 'stair_steps', 'window_sill', 'vehicle', 'person', 'other_known_height',
]);
export type WaterReferenceObject = z.infer<typeof WaterReferenceObjectSchema>;

export const FrameObservationSchema = z.object({
  cue: DamageCueSchema,
  evidence: z.string().max(200),
  confidence: z.number().min(0).max(1),
  extent: DamageExtentSchema.optional(),
  box: FrameBoxSchema.optional(),
});
export type FrameObservation = z.infer<typeof FrameObservationSchema>;

export const FrameWaterSchema = z.object({
  present: z.boolean(), // any floodwater or standing water in the frame
  inside: z.boolean(), // inside a building
  level: WaterLevelSchema,
  referenceObject: WaterReferenceObjectSchema,
  evidence: z.string().max(200).optional(),
});
export type FrameWater = z.infer<typeof FrameWaterSchema>;

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
      extent: DamageExtentSchema.optional(), // additive
      box: FrameBoxSchema.optional(), // additive
    }),
  ),
  lifeSafety: z.array(
    z.object({
      flag: LifeSafetyFlagSchema,
      evidence: z.string().max(200),
      confidence: z.number().min(0).max(1),
      box: FrameBoxSchema.optional(), // additive
    }),
  ),
  hazardObserved: HazardSchema.optional(),
  waterDepth: WaterDepthSchema.default('unknown'),
  caption: z.string().max(240),
  /** Additive: the frame's main finding in a few words, e.g. "Missing shingles and exposed decking". Affected view only. */
  headline: z.string().max(80).optional(),
  /** Additive (v4): the raw evidence the components and flags above were computed from, kept for audit. */
  scene: SceneSchema.optional(),
  observations: z.array(FrameObservationSchema).optional(),
  water: FrameWaterSchema.optional(),
  rulesVersion: z.string().optional(),
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
