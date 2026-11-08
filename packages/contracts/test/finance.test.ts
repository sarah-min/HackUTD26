import { describe, expect, it } from 'vitest';
import {
  AffectedIntakeSchema,
  FinancialProfileSchema,
  RecoveryPlanSchema,
  ScenarioSchema,
} from '../src/finance';
import recoveryPlan from '../../../fixtures/report/fake-worker/recovery-plan.json';
import maria from '../../../fixtures/finance/persona-maria.json';

describe('finance schemas', () => {
  it('parses AffectedIntake with defaults for home size', () => {
    const intake = AffectedIntakeSchema.parse({
      household: { peopleCount: 2, vulnerabilities: ['elderly'] },
      tenure: 'own',
      insurance: { policyType: 'homeowners', floodCovered: false },
      personaId: 'persona-maria-renter',
    });
    expect(intake.homeSqft).toBe(1800);
    expect(intake.stories).toBe(1);
    expect(intake.insurance.dwellingCoverageCents).toBe(0);
  });

  it('parses Scenario defaults', () => {
    const s = ScenarioSchema.parse({});
    expect(s.repairCase).toBe('likely');
    expect(s.payoutDelayDays).toBe(30);
    expect(s.repairStartDay).toBe(7);
  });

  it('validates synthetic persona fixtures', () => {
    expect(FinancialProfileSchema.parse(maria.data).id).toBe('persona-maria-renter');
  });

  it('validates the fake-worker RecoveryPlan fixture (truncated forecast ok)', () => {
    const plan = RecoveryPlanSchema.parse(recoveryPlan.data);
    expect(plan.disclaimer).toContain('Not financial advice');
    expect(plan.indicators.length).toBeGreaterThanOrEqual(3);
    expect(plan.source).toBe('fixture');
  });
});
