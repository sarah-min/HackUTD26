import type { FrameFinding } from './assessment';
import {
  DAMAGE_LEVEL_RANK,
  SEVERE_FLAGS,
  type Component,
  type DamageLevel,
  type LifeSafetyFlag,
} from './common';

// Part 3, additive (import as '@hack/contracts/display'). Display labels shared by the reporter and affected-person views (Figma "FieldReporterCaptureScreen").
// Stored data keeps the FEMA scale; only these labels change on screen.

/** Figma legend: No visible damage · Minor · Moderate · Severe · Destroyed. */
export const DAMAGE_LEVEL_LABEL: Record<DamageLevel, string> = {
  none: 'No visible damage',
  affected: 'Minor',
  minor: 'Moderate',
  major: 'Severe',
  destroyed: 'Destroyed',
};

/** Marker and legend colors from the Figma map. */
export const DAMAGE_LEVEL_COLOR: Record<DamageLevel, string> = {
  none: '#10b981',
  affected: '#eab308',
  minor: '#f97316',
  major: '#ef4444',
  destroyed: '#7f1d1d',
};

export const COMPONENT_LABEL: Record<Component, string> = {
  roof: 'Roof',
  exterior_walls: 'Siding & walls',
  windows_doors: 'Windows & doors',
  foundation: 'Foundation',
  interior: 'Interior',
  utilities: 'Utilities',
  contents: 'Contents',
  vehicle: 'Vehicle',
  yard_debris: 'Yard & debris',
};

/** Chip text for "Flagged on-scene hazards". Safe to show the reporter. */
export const LIFE_SAFETY_LABEL: Record<LifeSafetyFlag, string> = {
  person_trapped: 'Person trapped',
  injury_visible: 'Injury visible',
  active_fire: 'Active fire',
  gas_leak_suspected: 'Possible gas leak',
  structural_collapse: 'Structural instability',
  downed_power_line: 'Downed power line',
  standing_water_interior: 'Water inside',
  road_blocked: 'Road blocked',
};

export type ConfidenceLabel = 'High confidence' | 'Medium confidence' | 'Low confidence';
export function confidenceLabel(confidence: number): ConfidenceLabel {
  if (confidence >= 0.75) return 'High confidence';
  if (confidence >= 0.5) return 'Medium confidence';
  return 'Low confidence';
}

export function isSevereFlag(flag: LifeSafetyFlag): boolean {
  return (SEVERE_FLAGS as readonly string[]).includes(flag);
}

/** Reporter view: `report.life_safety_csv` → chip labels, most urgent first. */
export function lifeSafetyChips(flags: readonly LifeSafetyFlag[] | string): string[] {
  const list = (typeof flags === 'string' ? flags.split(',').map((f) => f.trim()).filter(Boolean) : [...flags]) as LifeSafetyFlag[];
  return list
    .filter((f) => f in LIFE_SAFETY_LABEL)
    .sort((a, b) => Number(isSevereFlag(b)) - Number(isSevereFlag(a)))
    .map((f) => LIFE_SAFETY_LABEL[f]);
}

/** The finding a frame card leads with: life-safety first, then the most damaged, most confident component. */
export function primaryFinding(f: FrameFinding):
  | { kind: 'lifeSafety'; label: string; note: string; confidence: number; box?: FrameFinding['components'][number]['box'] }
  | { kind: 'component'; label: string; note: string; confidence: number; level: DamageLevel; box?: FrameFinding['components'][number]['box'] }
  | null {
  const flag = [...f.lifeSafety].sort((a, b) => Number(isSevereFlag(b.flag)) - Number(isSevereFlag(a.flag)) || b.confidence - a.confidence)[0];
  if (flag && flag.confidence >= 0.5)
    return { kind: 'lifeSafety', label: LIFE_SAFETY_LABEL[flag.flag], note: flag.evidence, confidence: flag.confidence, box: flag.box };
  const comp = [...f.components]
    .filter((c) => c.level !== 'none')
    .sort((a, b) => DAMAGE_LEVEL_RANK[b.level] - DAMAGE_LEVEL_RANK[a.level] || b.confidence - a.confidence)[0];
  if (!comp) return null;
  return { kind: 'component', label: COMPONENT_LABEL[comp.component], note: comp.evidence, confidence: comp.confidence, level: comp.level, box: comp.box };
}

/** Frame card: "Frame 02 · 00:21". */
export function frameLabel(frameIndex: number, tSec: number): string {
  const s = Math.max(0, Math.round(tSec));
  return `Frame ${String(frameIndex + 1).padStart(2, '0')} · ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Headline for a frame: the model's headline, else the primary finding's evidence, else the caption. */
export function frameHeadline(f: FrameFinding): string {
  return f.headline?.trim() || primaryFinding(f)?.note || f.caption;
}
