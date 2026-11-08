import { type FrameFinding } from '@hack/contracts/assessment';
import { ComponentSchema, DAMAGE_LEVEL_RANK, LifeSafetyFlagSchema, type Component, type DamageLevel, type Hazard, type LifeSafetyFlag } from '@hack/contracts/common';

export const CONFIDENCE_THRESHOLD = 0.5;

/** Components that never set the overall level above 'affected'. */
export const NON_STRUCTURAL: ReadonlySet<Component> = new Set<Component>(['yard_debris', 'vehicle']);

export interface AggregatedFindings {
  componentLevels: Record<Component, DamageLevel>;
  overallLevel: DamageLevel;
  lifeSafety: LifeSafetyFlag[];
  confidence: number;
  usableFrameCount: number;
  totalFrameCount: number;
  hazardObserved: Hazard | undefined;
}

export function maxLevel(a: DamageLevel, b: DamageLevel): DamageLevel {
  return DAMAGE_LEVEL_RANK[b] > DAMAGE_LEVEL_RANK[a] ? b : a;
}

export function emptyComponentLevels(): Record<Component, DamageLevel> {
  const out = {} as Record<Component, DamageLevel>;
  for (const c of ComponentSchema.options) out[c] = 'none';
  return out;
}

/**
 * Code-computed assessment fields (CONTRACTS §3.1). The model never sets these.
 * - componentLevels: max level per component over usable frames, confidence ≥ 0.5.
 * - overallLevel: max over componentLevels, with yard_debris and vehicle capped at 'affected'.
 * - lifeSafety: any frame (usable or not) with that flag at confidence ≥ 0.5. Safety errs toward showing.
 * - confidence: mean component confidence over usable frames (0 when nothing usable).
 */
export function aggregateFindings(findings: readonly FrameFinding[]): AggregatedFindings {
  const componentLevels = emptyComponentLevels();
  const usable = findings.filter((f) => f.usable);
  const confidences: number[] = [];
  const hazardVotes = new Map<Hazard, number>();

  for (const f of usable) {
    for (const c of f.components) {
      confidences.push(c.confidence);
      if (c.confidence >= CONFIDENCE_THRESHOLD) {
        componentLevels[c.component] = maxLevel(componentLevels[c.component], c.level);
      }
    }
    if (f.hazardObserved) hazardVotes.set(f.hazardObserved, (hazardVotes.get(f.hazardObserved) ?? 0) + 1);
  }

  const flags = new Set<LifeSafetyFlag>();
  for (const f of findings) {
    for (const s of f.lifeSafety) if (s.confidence >= CONFIDENCE_THRESHOLD) flags.add(s.flag);
  }
  const lifeSafety = LifeSafetyFlagSchema.options.filter((flag) => flags.has(flag));

  // Debris and vehicles say little about whether the home is livable: they count toward the overall level only as 'affected'.
  // componentLevels keeps their real level (the cost estimate still prices them).
  let overallLevel: DamageLevel = 'none';
  for (const [component, level] of Object.entries(componentLevels) as [Component, DamageLevel][])
    overallLevel = maxLevel(overallLevel, NON_STRUCTURAL.has(component) ? (level === 'none' ? 'none' : 'affected') : level);

  const confidence = confidences.length
    ? Math.round((confidences.reduce((s, v) => s + v, 0) / confidences.length) * 1000) / 1000
    : 0;

  let hazardObserved: Hazard | undefined;
  let best = 0;
  for (const [h, n] of hazardVotes) {
    if (n > best) {
      best = n;
      hazardObserved = h;
    }
  }

  return {
    componentLevels,
    overallLevel,
    lifeSafety,
    confidence,
    usableFrameCount: usable.length,
    totalFrameCount: findings.length,
    hazardObserved,
  };
}

/** record_assessment sets needs_more_footage when more than half the frames are unusable. */
export function needsMoreFootage(usable: number, total: number): boolean {
  return total === 0 || usable * 2 < total;
}
