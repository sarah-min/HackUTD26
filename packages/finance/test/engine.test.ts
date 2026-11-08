import { describe, expect, it } from 'vitest';
import { AffectedIntakeSchema } from '@hack/contracts/finance';
import { buildRecoveryPlan, getPersona, simulate, type CostEstimate } from '../src/index';

const COST: CostEstimate = {
  lowCents: 700_000,
  likelyCents: 1_000_000,
  highCents: 1_400_000,
  lineItems: [
    {
      component: 'roof',
      level: 'major',
      basis: 'test roof',
      likelyCents: 700_000,
    },
    {
      component: 'contents',
      level: 'minor',
      basis: 'test contents',
      likelyCents: 300_000,
    },
  ],
  inputs: { homeSqft: 1800, stories: 1, tenure: 'own', assumed: false },
  costModelVersion: 'cost-v1',
  disclaimer: 'Illustrative estimate, not a contractor quote or insurance determination.',
};

const intakeOwn = AffectedIntakeSchema.parse({
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
});

describe('computePayoutGap / buildRecoveryPlan', () => {
  it('computes exact integer payout and gap for homeowners likely case', () => {
    // structure 700000 + contents 300000 - deductible 100000 = 900000 payout
    // gap = 1000000 - 900000 = 100000
    const plan = buildRecoveryPlan({
      propertyId: '1',
      reportId: '1',
      intake: intakeOwn,
      profile: getPersona('persona-maria-renter'),
      assessment: { hazard: 'hurricane_wind', declarations: [] },
      cost: COST,
      now: 1_700_000_000_000,
    });
    expect(plan.expectedPayoutCents.likely).toBe(900_000);
    expect(plan.gapCents.likely).toBe(100_000);
    expect(plan.repairCostCents.likely).toBe(1_000_000);
    expect(plan.indicators.length).toBe(5);
    expect(plan.forecast).toHaveLength(91);
    expect(plan.source).toBe('synthetic');
  });

  it('excludes flood payout when hazard is flood and floodCovered is false', () => {
    const plan = buildRecoveryPlan({
      propertyId: '1',
      reportId: '1',
      intake: intakeOwn,
      profile: getPersona('persona-james-homeowner'),
      assessment: { hazard: 'flood', declarations: [] },
      cost: COST,
      now: 1_700_000_000_000,
    });
    expect(plan.expectedPayoutCents.likely).toBe(0);
    expect(plan.gapCents.likely).toBe(1_000_000);
    expect(plan.payoutNotes.some((n) => n.includes('Flood damage'))).toBe(true);
  });

  it('renters payout uses contents only', () => {
    const renters = AffectedIntakeSchema.parse({
      ...intakeOwn,
      tenure: 'rent',
      insurance: {
        policyType: 'renters',
        dwellingCoverageCents: 0,
        contentsCoverageCents: 250_000,
        deductibleCents: 50_000,
        floodCovered: false,
      },
    });
    const plan = buildRecoveryPlan({
      propertyId: '1',
      reportId: '1',
      intake: renters,
      profile: getPersona('persona-maria-renter'),
      assessment: { hazard: 'hurricane_wind', declarations: [] },
      cost: COST,
      now: 1_700_000_000_000,
    });
    // min(300000, 250000) - 50000 = 200000
    expect(plan.expectedPayoutCents.likely).toBe(200_000);
    expect(plan.gapCents.likely).toBe(800_000);
  });
});

describe('simulate', () => {
  it('is pure, fast, and returns 91 forecast points', () => {
    const profile = getPersona('persona-james-homeowner');
    const t0 = Date.now();
    const result = simulate({
      profile,
      intake: intakeOwn,
      cost: COST,
      declarations: [],
      hazard: 'hurricane_wind',
      scenario: {
        repairCase: 'likely',
        payoutDelayDays: 30,
        incomeLossMonths: 0,
        repairStartDay: 7,
      },
      now: 1_700_000_000_000,
    });
    const ms = Date.now() - t0;
    expect(result.forecast).toHaveLength(91);
    expect(result.indicators.length).toBeGreaterThanOrEqual(3);
    expect(ms).toBeLessThan(20);
  });

  it('respects deductibleOverrideCents', () => {
    const base = simulate({
      profile: getPersona('persona-maria-renter'),
      intake: intakeOwn,
      cost: COST,
      declarations: [],
      hazard: 'hurricane_wind',
      scenario: { repairCase: 'likely', payoutDelayDays: 30, incomeLossMonths: 0, repairStartDay: 7 },
      now: 1_700_000_000_000,
    });
    const highDed = simulate({
      profile: getPersona('persona-maria-renter'),
      intake: intakeOwn,
      cost: COST,
      declarations: [],
      hazard: 'hurricane_wind',
      scenario: {
        repairCase: 'likely',
        payoutDelayDays: 30,
        incomeLossMonths: 0,
        repairStartDay: 7,
        deductibleOverrideCents: 500_000,
      },
      now: 1_700_000_000_000,
    });
    // payout 700000+300000-500000 = 500000 → gap 500000 vs base gap 100000
    expect(highDed.gapCents.likely).toBe(500_000);
    expect(highDed.gapCents.likely).toBeGreaterThan(base.gapCents.likely);
  });
});
