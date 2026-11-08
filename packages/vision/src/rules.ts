import type { DamageCue, FrameFinding, FrameObservation, FrameWater, Scene, WaterLevel } from '@hack/contracts/assessment';
import { DAMAGE_LEVEL_RANK, type Component, type DamageLevel, type Hazard, type LifeSafetyFlag } from '@hack/contracts/common';

// Evidence → severity. The vision model reports what it sees (cues, water against a reference object); these rules decide
// the FEMA level. They name physical evidence, not disaster types, so one table covers flood, wind, tornado, wildfire,
// earthquake, hail, landslide and winter storms. FEMA PDA scale: affected = cosmetic, livable; minor = repairable;
// major = structural damage or water above outlet height; destroyed = total loss or unsafe.
export const DAMAGE_RULES_VERSION = 'damage-rules-v1';

export interface CueRule {
  components: Component[];
  level: DamageLevel;
  flag?: LifeSafetyFlag; // life-safety flag this evidence implies
  supports?: Hazard[]; // hazards this evidence can confirm (see hazard check)
  description: string; // shown to the model
}

export const CUE_RULES: Record<DamageCue, CueRule> = {
  structure_collapsed: { components: ['roof', 'exterior_walls'], level: 'destroyed', flag: 'structural_collapse', description: 'most of the building has collapsed or is flattened' },
  structure_burned_out: { components: ['roof', 'exterior_walls', 'interior'], level: 'destroyed', supports: ['wildfire'], description: 'burned down: only ash, frame, chimney or foundation left' },
  structure_off_foundation: { components: ['foundation'], level: 'destroyed', flag: 'structural_collapse', description: 'building moved, floated or slid off its foundation' },
  structure_leaning: { components: ['foundation', 'exterior_walls'], level: 'major', flag: 'structural_collapse', description: 'building visibly tilted, racked or out of plumb' },
  foundation_damaged: { components: ['foundation'], level: 'major', description: 'foundation visibly cracked, broken, exposed or washed out underneath' },
  roof_structure_missing: { components: ['roof'], level: 'major', description: 'roof open to the sky: decking or rafters gone' },
  roof_sagging_or_collapsed: { components: ['roof'], level: 'major', flag: 'structural_collapse', description: 'roof sagging or partly caved in' },
  roof_covering_missing: { components: ['roof'], level: 'minor', description: 'shingles, tiles or panels missing; decking still in place' },
  roof_surface_minor: { components: ['roof'], level: 'affected', description: 'a few shingles lifted, dents, or granule loss' },
  object_on_structure: { components: ['roof'], level: 'minor', description: 'tree, vehicle or large debris resting on the building' },
  wall_section_missing: { components: ['exterior_walls'], level: 'major', description: 'part of an exterior wall is gone or caved in' },
  wall_structural_cracks: { components: ['exterior_walls'], level: 'major', description: 'wide cracks or walls separating from each other' },
  cladding_damaged: { components: ['exterior_walls'], level: 'minor', description: 'siding, stucco, brick face or trim torn off, holed or melted' },
  char_or_soot: { components: ['exterior_walls'], level: 'affected', supports: ['wildfire'], description: 'scorch marks, charring or soot on the building' },
  exterior_cosmetic: { components: ['exterior_walls'], level: 'affected', description: 'stains, mud lines, peeling paint, small dents' },
  windows_doors_broken: { components: ['windows_doors'], level: 'minor', description: 'broken glass, or a door or garage door blown in or off' },
  ceiling_collapsed: { components: ['interior'], level: 'major', flag: 'structural_collapse', description: 'ceiling fallen in' },
  interior_finishes_damaged: { components: ['interior'], level: 'minor', description: 'wet or torn-out drywall, insulation or flooring' },
  mud_or_sediment_inside: { components: ['interior'], level: 'minor', supports: ['flood'], description: 'mud, silt or sediment left on floors or walls inside' },
  contents_damaged: { components: ['contents'], level: 'minor', description: 'furniture, appliances or belongings soaked, burned or broken' },
  contents_piled_outside: { components: ['contents'], level: 'minor', description: 'household items or torn-out materials piled outside' },
  utility_service_damaged: { components: ['utilities'], level: 'minor', description: "the home's own meter, service line, AC unit or tank damaged" },
  vehicle_damaged: { components: ['vehicle'], level: 'minor', description: 'vehicle dented, flooded or with broken glass' },
  vehicle_destroyed: { components: ['vehicle'], level: 'destroyed', description: 'vehicle crushed, burned out or overturned' },
  debris_on_lot: { components: ['yard_debris'], level: 'affected', description: "branches, trees or debris on the property's own lot" },
  no_visible_damage: { components: [], level: 'none', description: 'the property is visible and shows no damage' },
};

/** Interior level for water inside, by height against a visible reference. FEMA: above outlet height (~18 in) is major. */
export const WATER_LEVEL_RULES: Record<WaterLevel, { level: DamageLevel; depth: FrameFinding['waterDepth'] }> = {
  not_visible: { level: 'minor', depth: 'unknown' },
  below_floor_level: { level: 'affected', depth: 'none' },
  ankle: { level: 'minor', depth: 'ankle' },
  below_outlets: { level: 'minor', depth: 'ankle' },
  above_outlets: { level: 'major', depth: 'knee' },
  waist_or_higher: { level: 'major', depth: 'waist' },
  near_ceiling: { level: 'major', depth: 'above_waist' },
  over_roof: { level: 'destroyed', depth: 'above_waist' },
};

/** Shots that may not show the reported property count with less confidence (street shots set no levels at all). */
export const SCENE_CONFIDENCE: Record<Scene, number> = {
  home_exterior: 1, home_interior: 1, vehicle: 1, aerial: 0.8, street_or_area: 0.7, other: 0.8,
};

/** Hazards that need physical evidence before the model's label is kept; others pass when any damage is visible. */
const HAZARD_NEEDS: Partial<Record<Hazard, (o: Set<DamageCue>, w: FrameWater | undefined) => boolean>> = {
  flood: (o, w) => !!w?.present || o.has('mud_or_sediment_inside'),
  wildfire: (o) => o.has('structure_burned_out') || o.has('char_or_soot'),
};

export interface ModelFrame {
  usable: boolean;
  unusableReason?: FrameFinding['unusableReason'];
  scene: Scene;
  headline?: string;
  caption: string;
  observations: FrameObservation[];
  water: FrameWater;
  lifeSafety: FrameFinding['lifeSafety'];
  hazardObserved?: Hazard;
}

const rank = (l: DamageLevel) => DAMAGE_LEVEL_RANK[l];

/** Applies the rules: model evidence in, FrameFinding (components, flags, water depth) out. Pure and deterministic. */
export function applyDamageRules(m: ModelFrame, frameIndex: number, tSec: number): FrameFinding {
  const factor = SCENE_CONFIDENCE[m.scene] ?? 0.8;
  const water: FrameWater =
    m.water.referenceObject === 'none' && m.water.level !== 'not_visible'
      ? { ...m.water, level: 'not_visible' } // no reference object, no height
      : m.water;
  const usableObs = m.usable ? m.observations : [];
  // no_visible_damage alongside damage is a contradiction: the damage cues win.
  const observations = usableObs.some((o) => o.cue !== 'no_visible_damage') ? usableObs.filter((o) => o.cue !== 'no_visible_damage') : usableObs;
  // A street or area shot is not the reported property: its evidence raises dangers, never the property's damage levels.
  const areaShot = m.scene === 'street_or_area';
  const cues = new Set(observations.map((o) => o.cue));

  type Comp = FrameFinding['components'][number];
  const comps = new Map<Component, Comp>();
  const put = (c: Comp) => {
    const prev = comps.get(c.component);
    if (!prev || rank(c.level) > rank(prev.level) || (rank(c.level) === rank(prev.level) && c.confidence > prev.confidence)) comps.set(c.component, c);
  };
  const flags = new Map<LifeSafetyFlag, FrameFinding['lifeSafety'][number]>();
  const addFlag = (f: FrameFinding['lifeSafety'][number]) => {
    const prev = flags.get(f.flag);
    if (!prev || f.confidence > prev.confidence) flags.set(f.flag, f);
  };

  for (const o of observations) {
    const rule = CUE_RULES[o.cue];
    const confidence = Math.round(o.confidence * factor * 1000) / 1000;
    if (!areaShot)
      for (const component of rule.components)
        put({ component, level: rule.level, evidence: o.evidence, confidence, ...(o.extent ? { extent: o.extent } : {}), ...(o.box ? { box: o.box } : {}) });
    if (rule.flag) addFlag({ flag: rule.flag, evidence: o.evidence, confidence, ...(o.box ? { box: o.box } : {}) });
  }

  let waterDepth: FrameFinding['waterDepth'] = water.present ? WATER_LEVEL_RULES[water.level].depth : 'none';
  if (m.usable && water.present && water.inside) {
    const rule = WATER_LEVEL_RULES[water.level];
    const evidence = water.evidence || (water.level === 'not_visible' ? 'Standing water inside; depth not measurable.' : `Water ${water.level.replace(/_/g, ' ')} against a ${water.referenceObject.replace(/_/g, ' ')}.`);
    put({ component: 'interior', level: rule.level, evidence, confidence: Math.round(0.8 * factor * 1000) / 1000 });
    put({ component: 'contents', level: 'minor', evidence: 'Belongings exposed to water inside.', confidence: Math.round(0.6 * factor * 1000) / 1000 });
    addFlag({ flag: 'standing_water_interior', evidence, confidence: 0.8 });
  } else if (m.usable && water.present && water.level === 'over_roof') {
    put({ component: 'roof', level: 'destroyed', evidence: water.evidence || 'Water over the roof line.', confidence: Math.round(0.8 * factor * 1000) / 1000 });
  }

  for (const f of m.lifeSafety) addFlag(f); // model-reported dangers always kept: safety errs toward showing

  let hazardObserved = m.hazardObserved;
  if (hazardObserved) {
    const need = HAZARD_NEEDS[hazardObserved];
    const anyEvidence = cues.size > 0 && !(cues.size === 1 && cues.has('no_visible_damage'));
    if (need ? !need(cues, water) : !anyEvidence && !water.present && flags.size === 0) hazardObserved = undefined;
  }

  return {
    frameIndex,
    tSec,
    usable: m.usable,
    ...(m.usable ? {} : { unusableReason: m.unusableReason ?? 'other' }),
    components: [...comps.values()],
    lifeSafety: [...flags.values()],
    ...(hazardObserved ? { hazardObserved } : {}),
    waterDepth,
    caption: m.caption,
    ...(m.headline ? { headline: m.headline } : {}),
    scene: m.scene,
    observations,
    water,
    rulesVersion: DAMAGE_RULES_VERSION,
  };
}
