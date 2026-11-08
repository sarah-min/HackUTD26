import { describe, expect, it } from 'vitest';
import { AffectedIntakeSchema } from '@hack/contracts/finance';
import { buildRecoveryPlan, coachReplyFromPlan, getPersona, type CostEstimate } from '../src/index';

const COST: CostEstimate = {
  lowCents: 700_000,
  likelyCents: 1_000_000,
  highCents: 1_400_000,
  lineItems: [
    { component: 'roof', level: 'major', basis: 'test', likelyCents: 700_000 },
    { component: 'contents', level: 'minor', basis: 'test', likelyCents: 300_000 },
  ],
  inputs: { homeSqft: 1800, stories: 1, tenure: 'own', assumed: false },
  costModelVersion: 'cost-v1',
  disclaimer: 'Illustrative estimate, not a contractor quote or insurance determination.',
};

describe('coachReplyFromPlan', () => {
  it('grounds answers in plan gap figures', () => {
    const plan = buildRecoveryPlan({
      propertyId: '1',
      reportId: '1',
      intake: AffectedIntakeSchema.parse({
        household: { peopleCount: 2, vulnerabilities: [] },
        tenure: 'own',
        homeSqft: 1800,
        stories: 1,
        insurance: {
          policyType: 'homeowners',
          dwellingCoverageCents: 5_000_000,
          contentsCoverageCents: 500_000,
          deductibleCents: 100_000,
          floodCovered: false,
        },
        personaId: 'persona-maria-renter',
      }),
      profile: getPersona('persona-maria-renter'),
      assessment: { hazard: 'hurricane_wind', declarations: [] },
      cost: COST,
      now: 1_700_000_000_000,
    });
    const reply = coachReplyFromPlan(plan, 'What is my gap?');
    expect(reply).toMatch(/\$/);
    expect(reply.toLowerCase()).toContain('educational');
    expect(reply).not.toMatch(/\$\d+\.\d{3,}/); // no free-form float dollars
  });
});
