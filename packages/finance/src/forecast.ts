import type { FinancialProfile, ForecastPoint, Scenario } from '@hack/contracts/finance';
import { liquidCents } from './profile';
import { MS_PER_DAY } from './types';

function formatDollars(cents: number): string {
  const sign = cents < 0 ? '−' : '';
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildForecast(args: {
  profile: FinancialProfile;
  scenario: Scenario;
  repairCostCents: number;
  expectedPayoutCents: number;
  fundingMix: Array<{ optionId: string; amountCents: number }>;
  optionsById: Map<string, { daysToFunds: number | null }>;
  startAt: number;
}): { forecast: ForecastPoint[]; firstShortfallDay: number | null } {
  const { profile, scenario, startAt } = args;
  let liquid = liquidCents(profile);
  const forecast: ForecastPoint[] = [];
  let firstShortfallDay: number | null = null;

  const payPerCheck =
    profile.payDays.length === 0
      ? 0
      : Math.round(profile.monthlyNetIncomeCents / profile.payDays.length);
  const dailyEssentials = Math.round(profile.monthlyEssentialExpensesCents / 30);
  const incomeLossDays = Math.round(scenario.incomeLossMonths * 30);

  const mixByDay = new Map<number, Array<{ optionId: string; amountCents: number }>>();
  for (const m of args.fundingMix) {
    if (m.optionId === 'savings') continue; // already in liquid
    const meta = args.optionsById.get(m.optionId);
    const day = meta?.daysToFunds ?? 0;
    const list = mixByDay.get(day) ?? [];
    list.push(m);
    mixByDay.set(day, list);
  }

  for (let day = 0; day <= 90; day++) {
    const at = startAt + day * MS_PER_DAY;
    const events: string[] = [];
    const date = new Date(at);
    const dom = date.getUTCDate();

    if (day > 0) {
      liquid -= dailyEssentials;
      if (dailyEssentials > 0) {
        // keep event noise low — only annotate week boundaries
      }

      if (day >= incomeLossDays && profile.payDays.includes(dom)) {
        liquid += payPerCheck;
        events.push(`Paycheck +${formatDollars(payPerCheck)}`);
      }

      for (const a of profile.accounts) {
        if (a.dueDay === dom && a.monthlyPaymentCents != null && a.monthlyPaymentCents > 0) {
          liquid -= a.monthlyPaymentCents;
          events.push(`${a.name} −${formatDollars(a.monthlyPaymentCents)}`);
        }
      }
    } else if (day === 0 && incomeLossDays === 0 && profile.payDays.includes(dom)) {
      // day 0: optional paycheck if it falls on start — skip to keep day0 = starting liquid
    }

    if (day === scenario.repairStartDay) {
      liquid -= args.repairCostCents;
      events.push(`Repair spend −${formatDollars(args.repairCostCents)}`);
    }
    if (day === scenario.payoutDelayDays) {
      liquid += args.expectedPayoutCents;
      events.push(`Insurance payout +${formatDollars(args.expectedPayoutCents)}`);
    }

    const arrivals = mixByDay.get(day);
    if (arrivals) {
      for (const m of arrivals) {
        liquid += m.amountCents;
        events.push(`Funding (${m.optionId}) +${formatDollars(m.amountCents)}`);
      }
    }

    if (firstShortfallDay == null && liquid < 0) firstShortfallDay = day;

    forecast.push({ day, at, liquidCents: liquid, events });
  }

  return { forecast, firstShortfallDay };
}
