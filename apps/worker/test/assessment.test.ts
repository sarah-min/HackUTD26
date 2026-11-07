import { describe, expect, it } from 'vitest';
import { FrameFindingSchema } from '@hack/contracts';
import { aggregateFindings, estimateRepairCost } from '@hack/damage';
import { collectAllowedCents } from '@hack/agent';
import { CALL_911, buildAssessment, deterministicFinish } from '../src/handlers/assessment';
import findingsFixture from '../../../fixtures/assessment/findings-sample.json';

const findings = findingsFixture.findings.map((f) => FrameFindingSchema.parse(f));
const agg = aggregateFindings(findings);
const cost = estimateRepairCost({ componentLevels: agg.componentLevels });

const base = {
  reportId: '7', propertyId: '9', reportHazard: 'hurricane_wind', selfDanger: false, agg, cost, declarations: [], activeAlerts: [],
  allowedCents: collectAllowedCents([cost]), modelId: 'agent', visionModelId: 'vl', promptVersion: 'p', source: 'fixture' as const, now: 1,
};

describe('buildAssessment', () => {
  it('uses code-computed fields and puts the 911 line first when a hazard is present', () => {
    const a = buildAssessment({ ...base, finish: { summary: 'Roof damage.', recommendedActions: ['Tarp the roof.'] } });
    expect(a.overallLevel).toBe('major');
    expect(a.lifeSafety).toEqual(['downed_power_line']);
    expect(a.recommendedActions[0]).toBe(CALL_911);
    expect(a.cost.likelyCents).toBe(cost.likelyCents);
  });
  it('strips sentences with invented dollar figures from model text', () => {
    const a = buildAssessment({
      ...base,
      finish: { summary: 'Major roof damage. FEMA will give you $12,345 next week.', recommendedActions: ['Expect $9,999 from your insurer.', 'Photograph everything.'] },
      claimNotice: 'Roof destroyed. Value $1,000,000.',
    });
    expect(a.summary).toBe('Major roof damage.');
    expect(a.recommendedActions).toEqual([CALL_911, 'Photograph everything.']);
    expect(a.claimNotice).toBe('Roof destroyed.');
  });
  it('deterministic finish asks for more footage without dollar figures', () => {
    const f = deterministicFinish(agg, { needsMoreFootage: true, selfDanger: true });
    expect(f.summary).toMatch(/more footage is needed/);
    expect(f.summary).not.toMatch(/\$/);
    expect(f.recommendedActions[0]).toBe(CALL_911);
  });
});
