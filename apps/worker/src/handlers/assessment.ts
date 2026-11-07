import {
  DamageAssessmentSchema,
  HazardSchema,
  SEVERE_FLAGS,
  type AgentFinish,
  type AssessmentLocation,
  type CostEstimate,
  type DamageAssessment,
  type DisasterDeclaration,
  type Hazard,
  type WeatherAlert,
} from '@hack/contracts';
import type { AggregatedFindings } from '@hack/damage';
import { stripUnsupportedSentences, unsupportedAmounts } from '@hack/agent';

export const CALL_911 = 'If you are in immediate danger, call 911.';

const COMPONENT_LABEL: Record<string, string> = {
  roof: 'roof', exterior_walls: 'exterior walls', windows_doors: 'windows and doors', foundation: 'foundation',
  interior: 'interior', utilities: 'utilities', contents: 'belongings', vehicle: 'vehicle', yard_debris: 'yard and debris',
};
const FLAG_LABEL: Record<string, string> = {
  person_trapped: 'a person who may be trapped', injury_visible: 'a visible injury', active_fire: 'active fire',
  gas_leak_suspected: 'a suspected gas leak', structural_collapse: 'structural collapse', downed_power_line: 'a downed power line',
  standing_water_interior: 'standing water inside', road_blocked: 'a blocked road',
};

/** Code-written finish used when the agent is skipped (too little footage) or fails. No dollar figures. */
export function deterministicFinish(agg: AggregatedFindings, opts: { needsMoreFootage: boolean; selfDanger: boolean }): AgentFinish {
  const damaged = Object.entries(agg.componentLevels)
    .filter(([, l]) => l !== 'none')
    .map(([c, l]) => `${COMPONENT_LABEL[c] ?? c} ${l}`);
  const parts: string[] = [];
  if (opts.needsMoreFootage) {
    parts.push(`Only ${agg.usableFrameCount} of ${agg.totalFrameCount} frames were clear enough to assess, so more footage is needed.`);
  }
  parts.push(
    damaged.length
      ? `The footage shows ${agg.overallLevel} damage overall (${damaged.join(', ')}).`
      : 'The usable footage does not show clear damage.',
  );
  if (agg.lifeSafety.length) parts.push(`Possible life-safety concerns: ${agg.lifeSafety.map((f) => FLAG_LABEL[f] ?? f).join(', ')}.`);
  parts.push('This is an automated estimate from video; have a professional confirm it.');
  const actions = [
    'Stay out of any area that looks unsafe until it has been checked.',
    'Photograph all damage before you clean up or make repairs.',
    'Contact your insurer to open a claim.',
    'Make only temporary repairs that prevent further damage, and keep the receipts.',
  ];
  if (opts.needsMoreFootage) actions.unshift('Film or photograph the property again in daylight, holding the camera steady.');
  return { summary: parts.join(' ').slice(0, 1200), recommendedActions: withSafetyFirst(actions, agg, opts.selfDanger) };
}

export function withSafetyFirst(actions: string[], agg: Pick<AggregatedFindings, 'lifeSafety'>, selfDanger: boolean): string[] {
  const clean = actions.map((a) => a.trim().slice(0, 200)).filter((a) => a && !/call 911/i.test(a));
  const urgent = selfDanger || agg.lifeSafety.length > 0 || agg.lifeSafety.some((f) => (SEVERE_FLAGS as readonly string[]).includes(f));
  return (urgent ? [CALL_911, ...clean] : clean).slice(0, 8);
}

export interface BuildAssessmentArgs {
  reportId: string;
  propertyId: string;
  reportHazard: string;
  selfDanger: boolean;
  agg: AggregatedFindings;
  finish: AgentFinish;
  claimNotice?: string;
  cost: CostEstimate;
  declarations: DisasterDeclaration[];
  activeAlerts: WeatherAlert[];
  location?: AssessmentLocation;
  allowedCents: number[];
  modelId: string;
  visionModelId: string;
  promptVersion: string;
  source: 'live' | 'fixture' | 'synthetic';
  now?: number;
}

/** Merge code-computed fields with the model's text fields, enforce the $ rule, validate (CONTRACTS §3.1). */
export function buildAssessment(a: BuildAssessmentArgs): DamageAssessment {
  const reportHazard = HazardSchema.safeParse(a.reportHazard);
  const hazard: Hazard = a.finish.hazard ?? (reportHazard.success ? reportHazard.data : 'other');
  const allowed = a.allowedCents;
  const scrub = (t: string) => (unsupportedAmounts([t], allowed).length ? stripUnsupportedSentences(t, allowed) : t);
  const summary = scrub(a.finish.summary).slice(0, 1200) || 'Automated assessment complete.';
  const actions = withSafetyFirst(a.finish.recommendedActions.map(scrub).filter(Boolean), a.agg, a.selfDanger);
  const claim = a.claimNotice ? scrub(a.claimNotice).slice(0, 3000) : undefined;
  return DamageAssessmentSchema.parse({
    reportId: a.reportId,
    propertyId: a.propertyId,
    overallLevel: a.agg.overallLevel,
    componentLevels: a.agg.componentLevels,
    lifeSafety: a.agg.lifeSafety,
    hazard,
    confidence: a.agg.confidence,
    usableFrameCount: a.agg.usableFrameCount,
    totalFrameCount: a.agg.totalFrameCount,
    cost: a.cost,
    declarations: a.declarations,
    activeAlerts: a.activeAlerts,
    location: a.location,
    summary,
    recommendedActions: actions,
    claimNotice: claim || undefined,
    modelId: a.modelId,
    visionModelId: a.visionModelId,
    promptVersion: a.promptVersion,
    source: a.source,
    createdAt: a.now ?? Date.now(),
  });
}
