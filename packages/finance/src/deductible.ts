import type { InsuranceInfo, Scenario } from '@hack/contracts/finance';

export function deductibleCents(insurance: InsuranceInfo, scenario?: Pick<Scenario, 'deductibleOverrideCents'>): number {
  if (scenario?.deductibleOverrideCents != null) return scenario.deductibleOverrideCents;
  if (insurance.deductibleCents != null) return insurance.deductibleCents;
  if (insurance.deductibleBps != null) {
    return Math.round((insurance.dwellingCoverageCents * insurance.deductibleBps) / 10_000);
  }
  return 0;
}
