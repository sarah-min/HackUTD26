import type { FinancialProfile, Indicator } from '@hack/contracts/finance';
import { liquidCents, monthlyDebtPaymentsCents, monthlyOutflowCents } from './profile';

function statusMonths(v: number): Indicator['status'] {
  if (v >= 3) return 'good';
  if (v >= 1) return 'watch';
  return 'risk';
}

function statusCoverage(v: number): Indicator['status'] {
  if (v >= 1.5) return 'good';
  if (v >= 1) return 'watch';
  return 'risk';
}

function statusDti(v: number): Indicator['status'] {
  if (v < 0.36) return 'good';
  if (v <= 0.43) return 'watch';
  return 'risk';
}

function statusUtil(v: number): Indicator['status'] {
  if (v < 0.3) return 'good';
  if (v <= 0.5) return 'watch';
  return 'risk';
}

function statusGapRatio(v: number): Indicator['status'] {
  if (v < 0.2) return 'good';
  if (v <= 0.5) return 'watch';
  return 'risk';
}

export function computeIndicators(args: {
  profile: FinancialProfile;
  gapLikelyCents: number;
  repairLikelyCents: number;
}): Indicator[] {
  const liquid = liquidCents(args.profile);
  const outflow = monthlyOutflowCents(args.profile);
  const debt = monthlyDebtPaymentsCents(args.profile);
  const gross = args.profile.monthlyGrossIncomeCents;

  const runway =
    outflow === 0 ? (liquid - args.gapLikelyCents >= 0 ? 99 : 0) : (liquid - args.gapLikelyCents) / outflow;

  const emergency =
    args.gapLikelyCents === 0 ? 99 : liquid / args.gapLikelyCents;

  const dti = gross === 0 ? 1 : debt / gross;

  let cardBal = 0;
  let cardLim = 0;
  for (const a of args.profile.accounts) {
    if (a.type === 'credit_card' && a.creditLimitCents != null) {
      cardBal += a.balanceCents;
      cardLim += a.creditLimitCents;
    }
  }
  const util = cardLim === 0 ? 0 : cardBal / cardLim;

  const gapRatio = args.repairLikelyCents === 0 ? 0 : args.gapLikelyCents / args.repairLikelyCents;

  return [
    {
      id: 'liquidity_runway_months',
      label: 'Liquidity runway',
      value: runway,
      unit: 'months',
      status: statusMonths(runway),
      explanation: `Cash after the likely gap covers about ${runway.toFixed(1)} months of essential outflows.`,
    },
    {
      id: 'emergency_fund_coverage',
      label: 'Emergency fund coverage',
      value: emergency,
      unit: 'ratio',
      status: statusCoverage(emergency),
      explanation:
        args.gapLikelyCents === 0
          ? 'No likely coverage gap — emergency fund is not needed for repairs.'
          : `Liquid cash is ${emergency.toFixed(2)}× the likely repair gap.`,
    },
    {
      id: 'debt_to_income',
      label: 'Debt-to-income',
      value: dti,
      unit: 'ratio',
      status: statusDti(dti),
      explanation: `Monthly debt payments are ${(dti * 100).toFixed(0)}% of gross income.`,
    },
    {
      id: 'credit_utilization',
      label: 'Credit utilization',
      value: util,
      unit: 'ratio',
      status: statusUtil(util),
      explanation:
        cardLim === 0
          ? 'No revolving credit lines on this synthetic profile.'
          : `Cards are at ${(util * 100).toFixed(0)}% of combined limits.`,
    },
    {
      id: 'insurance_gap_ratio',
      label: 'Insurance gap ratio',
      value: gapRatio,
      unit: 'ratio',
      status: statusGapRatio(gapRatio),
      explanation: `The likely unpaid share of repair cost is ${(gapRatio * 100).toFixed(0)}%.`,
    },
  ];
}
