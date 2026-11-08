import { HazardSchema, LifeSafetyFlagSchema, type Hazard } from '@hack/contracts/common';
import {
  DamageCueSchema,
  DamageExtentSchema,
  SceneSchema,
  WaterLevelSchema,
  WaterReferenceObjectSchema,
} from '@hack/contracts/assessment';
import { CUE_RULES } from '../rules';

// v4: the model reports visible evidence only (cues, water against a reference object); code rules set severity.
// v3: separated the home from the street. v2: guided JSON, bounded lists. v1 free-form output could loop.
export const DAMAGE_FRAME_PROMPT_VERSION = 'damage-frame-v4';

export const MAX_OBSERVATIONS_PER_FRAME = 8;
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

/** JSON Schema for the model's reply (vLLM guided decoding). */
export const DAMAGE_FRAME_JSON_SCHEMA = {
  type: 'object',
  properties: {
    usable: { type: 'boolean' },
    unusableReason: { type: 'string', enum: ['dark', 'blurry', 'not_a_structure', 'other'] },
    scene: { type: 'string', enum: SceneSchema.options },
    headline: { type: 'string', maxLength: 80 },
    caption: { type: 'string', maxLength: 240 },
    observations: {
      type: 'array',
      maxItems: MAX_OBSERVATIONS_PER_FRAME,
      items: {
        type: 'object',
        properties: {
          cue: { type: 'string', enum: DamageCueSchema.options },
          evidence: { type: 'string', maxLength: 160 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          extent: { type: 'string', enum: DamageExtentSchema.options },
          box,
        },
        required: ['cue', 'evidence', 'confidence'],
        additionalProperties: false,
      },
    },
    water: {
      type: 'object',
      properties: {
        present: { type: 'boolean' },
        inside: { type: 'boolean' },
        level: { type: 'string', enum: WaterLevelSchema.options },
        referenceObject: { type: 'string', enum: WaterReferenceObjectSchema.options },
        evidence: { type: 'string', maxLength: 160 },
      },
      required: ['present', 'inside', 'level', 'referenceObject'],
      additionalProperties: false,
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
  },
  required: ['usable', 'scene', 'headline', 'caption', 'observations', 'water', 'lifeSafety'],
  additionalProperties: false,
} as const;

const cueLines = DamageCueSchema.options.map((c) => `  ${c}: ${CUE_RULES[c].description}`).join('\n');

export const DAMAGE_FRAME_SYSTEM_PROMPT = `/no_think
You report visible evidence in ONE still frame from a phone video or photo taken after a disaster (any kind: flood, storm, tornado, fire, earthquake, hail, landslide, snow). You do not rate severity; the software does that from your evidence. Reply with one JSON object and nothing else.
- usable: true if the frame is clear enough to judge. If false, give unusableReason and no observations.
- scene: home_exterior, home_interior, street_or_area (a road or several buildings), aerial, vehicle, or other.
- headline: the most important thing visible, 3 to 8 words, dangers first. "No visible damage" if nothing is wrong.
- caption: one plain sentence describing what is visible.
- observations: up to ${MAX_OBSERVATIONS_PER_FRAME}, each cue once, only for what you can actually see. Choose from:
${cueLines}
  Each has evidence (what you see, under 160 characters), confidence 0 to 1, optional extent (localized, partial, widespread) and optional box (the region as fractions of the image).
  Street poles, wires and road debris are not observations; report them in lifeSafety.
- water: present (any floodwater or standing water), inside (in a building). level only by comparing the waterline to a visible object of known height, named in referenceObject (electrical_outlet, door_or_handle, countertop_or_furniture, stair_steps, window_sill, vehicle, person, other_known_height). If no such object is visible, level is not_visible and referenceObject is none.
- lifeSafety: up to ${MAX_FLAGS_PER_FRAME} clearly visible dangers, each once: ${LifeSafetyFlagSchema.options.join(', ')}. Fallen or leaning utility poles or low wires are downed_power_line; anything across a road is road_blocked.
- hazardObserved: the disaster type, only if this frame shows it: ${HazardSchema.options.join(', ')}.`;

export function damageFrameUserText(hazard: Hazard | undefined): string {
  return hazard ? `Reported hazard: ${hazard}. Report the visible evidence in this frame.` : 'Report the visible evidence in this frame.';
}
