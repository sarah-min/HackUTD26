import { ComponentSchema, DamageLevelSchema, HazardSchema, LifeSafetyFlagSchema, type Hazard } from '@hack/contracts/common';
import { DamageExtentSchema, WaterDepthSchema } from '@hack/contracts/assessment';

// v2: output shaped for the reporter and affected-person views (headline, extent, highlight box), bounded lists,
// guided JSON decoding. v1 free-form output could loop until the token limit.
export const DAMAGE_FRAME_PROMPT_VERSION = 'damage-frame-v2';

export const MAX_COMPONENTS_PER_FRAME = 6;
export const MAX_FLAGS_PER_FRAME = 4;

const box = {
  type: 'object',
  description: 'Region of the image, as fractions of its width and height from the top-left corner.',
  properties: {
    x: { type: 'number', minimum: 0, maximum: 1 },
    y: { type: 'number', minimum: 0, maximum: 1 },
    w: { type: 'number', minimum: 0, maximum: 1 },
    h: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['x', 'y', 'w', 'h'],
  additionalProperties: false,
} as const;

/** JSON Schema for the model's reply (vLLM guided decoding). frameIndex/tSec are added by code. */
export const DAMAGE_FRAME_JSON_SCHEMA = {
  type: 'object',
  properties: {
    usable: { type: 'boolean' },
    unusableReason: { type: 'string', enum: ['dark', 'blurry', 'not_a_structure', 'other'] },
    headline: { type: 'string', maxLength: 80 },
    caption: { type: 'string', maxLength: 240 },
    components: {
      type: 'array',
      maxItems: MAX_COMPONENTS_PER_FRAME,
      items: {
        type: 'object',
        properties: {
          component: { type: 'string', enum: ComponentSchema.options },
          level: { type: 'string', enum: DamageLevelSchema.options },
          extent: { type: 'string', enum: DamageExtentSchema.options },
          evidence: { type: 'string', maxLength: 160 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          box,
        },
        required: ['component', 'level', 'extent', 'evidence', 'confidence'],
        additionalProperties: false,
      },
    },
    lifeSafety: {
      type: 'array',
      maxItems: MAX_FLAGS_PER_FRAME,
      items: {
        type: 'object',
        properties: {
          flag: { type: 'string', enum: LifeSafetyFlagSchema.options },
          evidence: { type: 'string', maxLength: 160 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          box,
        },
        required: ['flag', 'evidence', 'confidence'],
        additionalProperties: false,
      },
    },
    hazardObserved: { type: 'string', enum: HazardSchema.options },
    waterDepth: { type: 'string', enum: WaterDepthSchema.options },
  },
  required: ['usable', 'headline', 'caption', 'components', 'lifeSafety', 'waterDepth'],
  additionalProperties: false,
} as const;

const list = (xs: readonly string[]) => xs.join(', ');

export const DAMAGE_FRAME_SYSTEM_PROMPT = `/no_think
You assess ONE still frame from a phone video or photo of a residential property after a disaster.
Reply with one JSON object and nothing else:
- usable: true if the frame shows a building, vehicle or property clearly enough to assess. If false, give unusableReason (dark, blurry, not_a_structure, other) and empty lists.
- headline: the single most important finding in 3 to 8 words, e.g. "Missing shingles and exposed decking". Use "No visible damage" when nothing is damaged.
- caption: one plain sentence describing the frame.
- components: up to ${MAX_COMPONENTS_PER_FRAME} visible parts, each listed once. component is one of: ${list(ComponentSchema.options)}.
  level uses the FEMA scale: none (undamaged), affected (cosmetic, livable), minor (repairable, e.g. some shingles missing, water below the outlets), major (structural damage or water above the outlets), destroyed (total loss or structurally unsafe).
  extent: localized (one small area), partial (a noticeable section), widespread (most of what is visible).
  evidence: what you see, under 160 characters. confidence: 0 to 1.
  box: the damaged region as fractions of the image (x, y from the top-left; w, h sizes). Include it only when you can point to the area.
- lifeSafety: up to ${MAX_FLAGS_PER_FRAME} dangers that are clearly visible, each listed once: ${list(LifeSafetyFlagSchema.options)}. Same evidence, confidence and box rules.
- hazardObserved: the disaster type the frame shows, if clear: ${list(HazardSchema.options)}.
- waterDepth: ${list(WaterDepthSchema.options)}.
Describe only what this frame shows. Leave out costs, causes you cannot see, and parts that are not visible.`;

export function damageFrameUserText(hazard: Hazard | undefined): string {
  return hazard ? `Reported hazard: ${hazard}. Assess this frame.` : 'Assess this frame.';
}
