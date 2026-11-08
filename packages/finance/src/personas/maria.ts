import type { FinancialProfile } from '@hack/contracts/finance';

/** Synthetic renter — thin emergency fund, credit card, no mortgage. */
export const maria: FinancialProfile = {
  id: 'persona-maria-renter',
  label: 'Maria, 34, renter, Houston',
  description:
    'Synthetic demo persona: apartment renter with checking, a small savings buffer, and one credit card. Labeled synthetic — not a real person.',
  accounts: [
    {
      id: 'maria-checking',
      type: 'checking',
      name: 'Everyday Checking',
      balanceCents: 185_000,
    },
    {
      id: 'maria-savings',
      type: 'savings',
      name: 'Rainy Day Savings',
      balanceCents: 320_000,
    },
    {
      id: 'maria-card',
      type: 'credit_card',
      name: 'Everyday Rewards Card',
      balanceCents: 210_000,
      aprBps: 2_199,
      creditLimitCents: 500_000,
      monthlyPaymentCents: 6_500,
      dueDay: 12,
    },
  ],
  monthlyNetIncomeCents: 420_000,
  monthlyGrossIncomeCents: 520_000,
  monthlyEssentialExpensesCents: 245_000,
  payDays: [1, 15],
  personalLoanOfferAprBps: 1_499,
  source: 'synthetic',
};
