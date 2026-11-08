import type { FinancialProfile } from '@hack/contracts/finance';

/** Synthetic homeowner — IRA, auto loan, thinner cash after essentials. */
export const aisha: FinancialProfile = {
  id: 'persona-aisha-homeowner',
  label: 'Aisha, 38, homeowner, Fort Worth',
  description:
    'Synthetic demo persona: homeowner with checking, a small savings balance, an IRA, an auto loan, and a mortgage. Labeled synthetic — not a real person.',
  accounts: [
    {
      id: 'aisha-checking',
      type: 'checking',
      name: 'Joint Checking',
      balanceCents: 240_000,
    },
    {
      id: 'aisha-savings',
      type: 'savings',
      name: 'Short-Term Savings',
      balanceCents: 175_000,
    },
    {
      id: 'aisha-ira',
      type: 'ira',
      name: 'Traditional IRA',
      balanceCents: 4_200_000,
    },
    {
      id: 'aisha-auto',
      type: 'auto_loan',
      name: 'Auto Loan',
      balanceCents: 1_150_000,
      aprBps: 699,
      monthlyPaymentCents: 42_000,
      dueDay: 8,
    },
    {
      id: 'aisha-mortgage',
      type: 'mortgage',
      name: 'Home Mortgage',
      balanceCents: 31_000_000,
      aprBps: 675,
      monthlyPaymentCents: 210_000,
      dueDay: 1,
    },
    {
      id: 'aisha-card',
      type: 'credit_card',
      name: 'Store Card',
      balanceCents: 380_000,
      aprBps: 2_499,
      creditLimitCents: 450_000,
      monthlyPaymentCents: 12_000,
      dueDay: 18,
    },
  ],
  monthlyNetIncomeCents: 610_000,
  monthlyGrossIncomeCents: 760_000,
  monthlyEssentialExpensesCents: 290_000,
  payDays: [1],
  personalLoanOfferAprBps: 1_649,
  source: 'synthetic',
};
