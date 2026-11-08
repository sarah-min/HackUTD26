import type { FinancialProfile } from '@hack/contracts/finance';

/** Synthetic homeowner — mortgage, CD, stronger liquid reserves. */
export const james: FinancialProfile = {
  id: 'persona-james-homeowner',
  label: 'James, 41, homeowner, Dallas',
  description:
    'Synthetic demo persona: homeowner with checking, savings, a CD, and a mortgage. Labeled synthetic — not a real person.',
  accounts: [
    {
      id: 'james-checking',
      type: 'checking',
      name: 'Primary Checking',
      balanceCents: 410_000,
    },
    {
      id: 'james-savings',
      type: 'savings',
      name: 'Emergency Savings',
      balanceCents: 1_250_000,
    },
    {
      id: 'james-cd',
      type: 'cd',
      name: '12-Month CD',
      balanceCents: 800_000,
      earlyWithdrawalPenaltyBps: 150,
      maturityAt: 1_811_808_000_000, // 2027-06-01 UTC
    },
    {
      id: 'james-mortgage',
      type: 'mortgage',
      name: 'Primary Mortgage',
      balanceCents: 24_500_000,
      aprBps: 625,
      monthlyPaymentCents: 185_000,
      dueDay: 1,
    },
    {
      id: 'james-card',
      type: 'credit_card',
      name: 'Travel Card',
      balanceCents: 95_000,
      aprBps: 1_899,
      creditLimitCents: 1_200_000,
      monthlyPaymentCents: 3_500,
      dueDay: 22,
    },
  ],
  monthlyNetIncomeCents: 780_000,
  monthlyGrossIncomeCents: 980_000,
  monthlyEssentialExpensesCents: 310_000,
  payDays: [5, 20],
  personalLoanOfferAprBps: 1_199,
  source: 'synthetic',
};
