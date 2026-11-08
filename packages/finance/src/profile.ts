import type { FinancialProfile } from '@hack/contracts/finance';

const DEBT_TYPES = new Set([
  'mortgage',
  'auto_loan',
  'personal_loan',
  'credit_card',
]);

export function liquidCents(profile: FinancialProfile): number {
  let sum = 0;
  for (const a of profile.accounts) {
    if (a.type === 'checking' || a.type === 'savings') sum += a.balanceCents;
  }
  return sum;
}

export function monthlyDebtPaymentsCents(profile: FinancialProfile): number {
  let sum = 0;
  for (const a of profile.accounts) {
    if (DEBT_TYPES.has(a.type) && a.monthlyPaymentCents != null) {
      sum += a.monthlyPaymentCents;
    }
  }
  return sum;
}

export function monthlyOutflowCents(profile: FinancialProfile): number {
  return profile.monthlyEssentialExpensesCents + monthlyDebtPaymentsCents(profile);
}
