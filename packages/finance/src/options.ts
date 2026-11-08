import type { FinancialProfile, FundingOption } from '@hack/contracts/finance';
import { liquidCents, monthlyOutflowCents } from './profile';
import type { DisasterDeclaration } from './types';

const SBA_LINK = 'https://www.sba.gov/funding-programs/disaster-assistance';
const FEMA_LINK = 'https://www.disasterassistance.gov/';

function costForAmount(optionId: FundingOption['id'], amountCents: number, profile: FinancialProfile): number | null {
  if (amountCents <= 0) return 0;
  if (optionId === 'savings') return 0;
  if (optionId === 'credit_card') {
    const cards = profile.accounts.filter((a) => a.type === 'credit_card' && a.aprBps != null);
    if (cards.length === 0) return 0;
    const apr = cards[0]!.aprBps!;
    return Math.round((amountCents * apr * 6) / 120_000);
  }
  if (optionId === 'personal_loan') {
    const apr = profile.personalLoanOfferAprBps;
    if (apr == null) return null;
    return Math.round((amountCents * apr * 24) / 120_000 / 2);
  }
  if (optionId === 'cd_early_withdrawal') {
    let weighted = 0;
    let total = 0;
    for (const a of profile.accounts) {
      if (a.type === 'cd') {
        total += a.balanceCents;
        weighted += a.balanceCents * (a.earlyWithdrawalPenaltyBps ?? 0);
      }
    }
    if (total === 0) return 0;
    const penaltyBps = Math.round(weighted / total);
    return Math.round((amountCents * penaltyBps) / 10_000);
  }
  if (optionId === 'ira_withdrawal') return null;
  if (optionId === 'sba_disaster_loan') return null;
  if (optionId === 'fema_ihp') return 0;
  return null;
}

export function buildFundingOptions(args: {
  profile: FinancialProfile;
  gapLikelyCents: number;
  declarations: DisasterDeclaration[];
}): FundingOption[] {
  const { profile, gapLikelyCents, declarations } = args;
  const liquid = liquidCents(profile);
  const outflow = monthlyOutflowCents(profile);
  const options: FundingOption[] = [];

  const savingsAvail = Math.max(0, liquid - outflow);
  options.push({
    id: 'savings',
    label: 'Savings / checking',
    availableCents: savingsAvail,
    costOfFundsCents: 0,
    daysToFunds: 0,
    eligibilityNote: 'Keeps a 1-month essential-outflow buffer in cash.',
  });

  let cardAvail = 0;
  for (const a of profile.accounts) {
    if (a.type === 'credit_card' && a.creditLimitCents != null) {
      cardAvail += Math.max(0, a.creditLimitCents - a.balanceCents);
    }
  }
  const cardAmt = Math.min(cardAvail, gapLikelyCents);
  options.push({
    id: 'credit_card',
    label: 'Credit card',
    availableCents: cardAvail,
    costOfFundsCents: costForAmount('credit_card', cardAmt, profile),
    daysToFunds: 0,
  });

  if (profile.personalLoanOfferAprBps != null) {
    const avail = Math.min(2_500_000, gapLikelyCents);
    options.push({
      id: 'personal_loan',
      label: 'Personal loan (illustrative offer)',
      availableCents: avail,
      costOfFundsCents: costForAmount('personal_loan', avail, profile),
      daysToFunds: 3,
      eligibilityNote: 'Synthetic demo offer — not a real underwriting decision.',
    });
  }

  let cdAvail = 0;
  for (const a of profile.accounts) {
    if (a.type === 'cd') cdAvail += a.balanceCents;
  }
  if (cdAvail > 0) {
    const amt = Math.min(cdAvail, gapLikelyCents);
    options.push({
      id: 'cd_early_withdrawal',
      label: 'CD early withdrawal',
      availableCents: cdAvail,
      costOfFundsCents: costForAmount('cd_early_withdrawal', amt, profile),
      daysToFunds: 1,
    });
  }

  let iraAvail = 0;
  for (const a of profile.accounts) {
    if (a.type === 'ira') iraAvail += a.balanceCents;
  }
  if (iraAvail > 0) {
    options.push({
      id: 'ira_withdrawal',
      label: 'IRA withdrawal',
      availableCents: iraAvail,
      costOfFundsCents: null,
      daysToFunds: 7,
      eligibilityNote: 'Taxes and early-withdrawal penalties may apply — last resort.',
    });
  }

  if (declarations.length > 0) {
    options.push({
      id: 'sba_disaster_loan',
      label: 'SBA disaster loan',
      availableCents: null,
      costOfFundsCents: null,
      daysToFunds: null,
      eligibilityNote: 'Check eligibility',
      link: SBA_LINK,
    });
  }

  if (declarations.some((d) => d.ihProgramDeclared)) {
    options.push({
      id: 'fema_ihp',
      label: 'FEMA Individual Assistance (IHP)',
      availableCents: null,
      costOfFundsCents: null,
      daysToFunds: null,
      eligibilityNote: 'Check eligibility',
      link: FEMA_LINK,
    });
  }

  return options;
}

export function recommendedMix(
  options: FundingOption[],
  gapLikelyCents: number,
): Array<{ optionId: string; amountCents: number }> {
  if (gapLikelyCents <= 0) return [];

  const known = options.filter(
    (o) => o.availableCents != null && o.costOfFundsCents != null && o.daysToFunds != null && o.availableCents > 0,
  );

  known.sort((a, b) => {
    const aAmt = Math.min(a.availableCents!, gapLikelyCents);
    const bAmt = Math.min(b.availableCents!, gapLikelyCents);
    const aCpd = aAmt === 0 ? 0 : a.costOfFundsCents! / aAmt;
    const bCpd = bAmt === 0 ? 0 : b.costOfFundsCents! / bAmt;
    if (aCpd !== bCpd) return aCpd - bCpd;
    return a.daysToFunds! - b.daysToFunds!;
  });

  const mix: Array<{ optionId: string; amountCents: number }> = [];
  let remaining = gapLikelyCents;
  for (const o of known) {
    if (remaining <= 0) break;
    const take = Math.min(o.availableCents!, remaining);
    if (take <= 0) continue;
    mix.push({ optionId: o.id, amountCents: take });
    remaining -= take;
  }
  return mix;
}

export function totalCostOfFunds(
  mix: Array<{ optionId: string; amountCents: number }>,
  profile: FinancialProfile,
): number {
  let total = 0;
  for (const m of mix) {
    const c = costForAmount(m.optionId as FundingOption['id'], m.amountCents, profile);
    if (c != null) total += c;
  }
  return total;
}
